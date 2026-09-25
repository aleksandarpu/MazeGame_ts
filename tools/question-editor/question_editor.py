#!/usr/bin/env python3
"""Visual editor for the maze game's question files (assets/data/*.json).

File format:
    {
        "Group": "Gramatika",
        "Questions": [
            { "Question": "text, may contain \\n and *marked* words", "Answers": ["correct", "wrong", ...] }
        ]
    }

The FIRST answer is the correct one (the game shuffles answers before showing them).

Usage:
    python question_editor.py [path/to/file.json]
"""

from __future__ import annotations

import json
import sys
import tkinter as tk
from pathlib import Path
from tkinter import filedialog, messagebox, ttk

DATA_DIR = Path(__file__).resolve().parents[2] / "assets" / "data"
GAME_ANSWER_KEYS = 4  # the game answers with keys 1-4


# ---------------------------------------------------------------------------
# File I/O (keeps the files' formatting: 4-space indent, raw UTF-8, original line endings)
# ---------------------------------------------------------------------------

class QuestionFile:
    def __init__(self, path: Path | None = None):
        """Loads `path`, or creates a new empty file (not on disk until saved) when path is None."""
        self.path = path
        if path is None:
            # Same formatting as the existing files
            self.had_bom = False
            self.newline = "\r\n"
            self.trailing_newline = False
            self.group = ""
            self.questions = []
            return
        raw = path.read_bytes()
        text = raw.decode("utf-8-sig")
        self.had_bom = raw.startswith(b"\xef\xbb\xbf")
        self.newline = "\r\n" if "\r\n" in text else "\n"
        self.trailing_newline = text.endswith("\n")
        data = json.loads(text)
        self.group: str = data.get("Group", "")
        self.questions: list[dict] = [
            {"Question": q.get("Question", ""), "Answers": list(q.get("Answers", []))}
            for q in data.get("Questions", [])
        ]

    def to_text(self) -> str:
        data = {"Group": self.group, "Questions": self.questions}
        text = json.dumps(data, ensure_ascii=False, indent=4)
        if self.newline != "\n":
            text = text.replace("\n", self.newline)
        if self.trailing_newline:
            text += self.newline
        return text

    def save(self, path: Path | None = None):
        target = path or self.path
        if target is None:
            raise ValueError("No file name to save to")
        encoding = "utf-8-sig" if self.had_bom else "utf-8"
        # newline="" writes the line endings exactly as they are in the text
        with open(target, "w", encoding=encoding, newline="") as f:
            f.write(self.to_text())
        self.path = target


def question_problems(q: dict) -> list[str]:
    problems = []
    if not q["Question"].strip():
        problems.append("question text is empty")
    answers = q["Answers"]
    if len(answers) < 2:
        problems.append("needs at least 2 answers")
    if len(answers) > GAME_ANSWER_KEYS:
        problems.append(f"more than {GAME_ANSWER_KEYS} answers (the game only has keys 1-{GAME_ANSWER_KEYS})")
    if any(not a.strip() for a in answers):
        problems.append("has an empty answer")
    if q["Question"].count("*") % 2:
        problems.append("unpaired * marker")
    return problems


def one_line(text: str, limit: int = 90) -> str:
    text = text.replace("﻿", "").replace("\r\n", "\n").replace("\n", " ⏎ ").strip()
    return text if len(text) <= limit else text[: limit - 1] + "…"


# ---------------------------------------------------------------------------
# Editor window
# ---------------------------------------------------------------------------

class QuestionEditor(tk.Tk):
    def __init__(self, initial: Path | None):
        super().__init__()
        self.geometry("1280x780")
        self.minsize(900, 560)

        self.file: QuestionFile | None = None
        self.current: int | None = None  # index of the question in the editor
        self.dirty = False
        self.loading = False  # suppresses change handlers while filling the editor

        self._build_ui()
        self._bind_keys()
        self.protocol("WM_DELETE_WINDOW", self.on_close)

        if initial:
            self.open_file(initial)
        else:
            files = self._data_files()
            if files:
                self.open_file(files[0])
        self._update_title()

    # ---------- UI ----------

    def _build_ui(self):
        style = ttk.Style(self)
        if "clam" in style.theme_names():
            style.theme_use("clam")
        style.configure("Treeview", rowheight=24)
        style.configure("Correct.TLabel", foreground="#1b7f2a", font=("Segoe UI", 9, "bold"))
        style.configure("Wrong.TLabel", foreground="#666")
        style.configure("Problem.TLabel", foreground="#b3261e")

        # Top bar: file picker + group name + save
        top = ttk.Frame(self, padding=(10, 8))
        top.pack(fill="x")
        ttk.Label(top, text="File:").pack(side="left")
        self.file_var = tk.StringVar()
        self.file_combo = ttk.Combobox(top, textvariable=self.file_var, state="readonly", width=28,
                                       values=[p.name for p in self._data_files()])
        self.file_combo.pack(side="left", padx=(4, 4))
        self.file_combo.bind("<<ComboboxSelected>>", self.on_file_selected)
        ttk.Button(top, text="Open…", command=self.on_open).pack(side="left")
        ttk.Button(top, text="New file…", command=self.on_new_file).pack(side="left", padx=(4, 0))

        ttk.Label(top, text="Group:").pack(side="left", padx=(20, 4))
        self.group_var = tk.StringVar()
        self.group_var.trace_add("write", self.on_group_changed)
        self.group_entry = ttk.Entry(top, textvariable=self.group_var, width=24)
        self.group_entry.pack(side="left")

        ttk.Button(top, text="Save As…", command=self.on_save_as).pack(side="right")
        ttk.Button(top, text="Save  (Ctrl+S)", command=self.on_save).pack(side="right", padx=(0, 6))

        panes = ttk.PanedWindow(self, orient="horizontal")
        panes.pack(fill="both", expand=True, padx=10, pady=(0, 6))

        # ----- Left: list of questions with their answers -----
        left = ttk.Frame(panes)
        panes.add(left, weight=3)

        list_bar = ttk.Frame(left)
        list_bar.pack(fill="x", pady=(0, 6))
        self.count_label = ttk.Label(list_bar, text="")
        self.count_label.pack(side="left")
        ttk.Button(list_bar, text="Delete question", command=self.on_delete_question).pack(side="right")
        ttk.Button(list_bar, text="+ New question  (Ctrl+N)", command=self.on_new_question).pack(side="right", padx=(0, 6))

        tree_frame = ttk.Frame(left)
        tree_frame.pack(fill="both", expand=True)
        self.tree = ttk.Treeview(tree_frame, show="tree", selectmode="browse")
        scroll = ttk.Scrollbar(tree_frame, orient="vertical", command=self.tree.yview)
        self.tree.configure(yscrollcommand=scroll.set)
        self.tree.pack(side="left", fill="both", expand=True)
        scroll.pack(side="right", fill="y")
        self.tree.tag_configure("question", font=("Segoe UI", 10, "bold"))
        self.tree.tag_configure("problem", foreground="#b3261e")
        self.tree.tag_configure("correct", foreground="#1b7f2a")
        self.tree.tag_configure("answer", foreground="#444")
        self.tree.bind("<<TreeviewSelect>>", self.on_tree_select)

        # ----- Right: editor -----
        right = ttk.Frame(panes, padding=(12, 0, 0, 0))
        panes.add(right, weight=2)

        self.editor_title = ttk.Label(right, text="Question", font=("Segoe UI", 12, "bold"))
        self.editor_title.pack(anchor="w")
        ttk.Label(right, text="Enter = new line.  Wrap words in *stars* to show them in red.",
                  style="Wrong.TLabel").pack(anchor="w", pady=(0, 4))

        self.question_text = tk.Text(right, height=5, wrap="word", font=("Segoe UI", 11), undo=True,
                                     relief="solid", borderwidth=1)
        self.question_text.pack(fill="x")
        self.question_text.bind("<<Modified>>", self.on_question_text_changed)

        ttk.Label(right, text="Preview", font=("Segoe UI", 9, "bold")).pack(anchor="w", pady=(8, 2))
        self.preview = tk.Text(right, height=4, wrap="word", font=("Segoe UI", 11), relief="flat",
                               background="#f6f6f6", state="disabled", cursor="arrow")
        self.preview.pack(fill="x")
        self.preview.tag_configure("marked", foreground="#d11a1a", font=("Segoe UI", 11, "bold"))

        answers_bar = ttk.Frame(right)
        answers_bar.pack(fill="x", pady=(12, 4))
        ttk.Label(answers_bar, text="Answers", font=("Segoe UI", 12, "bold")).pack(side="left")
        ttk.Label(answers_bar, text="  (the first answer is the correct one)", style="Wrong.TLabel").pack(side="left")
        self.add_answer_btn = ttk.Button(answers_bar, text="+ Add answer", command=self.on_add_answer)
        self.add_answer_btn.pack(side="right")

        self.answers_frame = ttk.Frame(right)
        self.answers_frame.pack(fill="x")
        self.answers_frame.columnconfigure(1, weight=1)
        self.answer_vars: list[tk.StringVar] = []

        self.problems_label = ttk.Label(right, text="", style="Problem.TLabel", wraplength=460, justify="left")
        self.problems_label.pack(anchor="w", pady=(10, 0))

        # Status bar
        self.status = ttk.Label(self, text="", padding=(10, 2, 10, 6), style="Wrong.TLabel")
        self.status.pack(fill="x")

        self._set_editor_enabled(False)

    def _bind_keys(self):
        self.bind_all("<Control-s>", lambda e: self.on_save())
        self.bind_all("<Control-n>", lambda e: self.on_new_question())

    @staticmethod
    def _data_files() -> list[Path]:
        return sorted(DATA_DIR.glob("*.json")) if DATA_DIR.is_dir() else []

    # ---------- File handling ----------

    def open_file(self, path: Path):
        try:
            loaded = QuestionFile(path)
        except (OSError, ValueError) as err:
            messagebox.showerror("Open failed", f"Could not open {path}:\n{err}")
            return
        self._show_file(loaded)
        self.status.configure(text=f"Opened {path}")

    def _show_file(self, loaded: QuestionFile):
        self.file = loaded
        self.current = None
        self.dirty = False
        self.loading = True
        self.group_var.set(loaded.group)
        self.loading = False
        self.file_var.set(loaded.path.name if loaded.path else "")
        self._rebuild_tree()
        if loaded.questions:
            self._select_question(0)
        else:
            self._show_question(None)
        self._update_title()

    def on_new_file(self):
        if not self.confirm_discard():
            return
        self._show_file(QuestionFile())
        self.status.configure(text="New file: enter a group name and add questions, then Save.")
        self.group_entry.focus_set()

    def confirm_discard(self) -> bool:
        """True if it's OK to drop unsaved changes (after saving them if the user wants)."""
        if not self.dirty:
            return True
        answer = messagebox.askyesnocancel("Unsaved changes", "Save changes before continuing?")
        if answer is None:
            return False
        if answer:
            return self.on_save()
        return True

    def on_file_selected(self, _event=None):
        name = self.file_var.get()
        if self.file and self.file.path and name == self.file.path.name:
            return
        if not self.confirm_discard():
            self.file_var.set(self.file.path.name if self.file and self.file.path else "")
            return
        self.open_file(DATA_DIR / name)

    def on_open(self):
        if not self.confirm_discard():
            return
        path = filedialog.askopenfilename(initialdir=DATA_DIR, filetypes=[("Question files", "*.json"), ("All files", "*.*")])
        if path:
            self.open_file(Path(path))

    def on_save(self) -> bool:
        if not self.file:
            return False
        if self.file.path is None:  # new file: ask where to save it
            return self.on_save_as()
        return self._save_to(self.file.path)

    def on_save_as(self) -> bool:
        if not self.file or not self._check_can_save():
            return False
        initial = self.file.path.name if self.file.path else ""
        path = filedialog.asksaveasfilename(initialdir=DATA_DIR, initialfile=initial,
                                            defaultextension=".json", filetypes=[("Question files", "*.json")])
        if not path:
            return False
        return self._save_to(Path(path))

    def _save_to(self, path: Path) -> bool:
        assert self.file
        if not self._check_can_save() or not self._confirm_problems():
            return False
        try:
            self.file.save(path)
        except OSError as err:
            messagebox.showerror("Save failed", str(err))
            return False
        self.dirty = False
        self.file_combo.configure(values=[p.name for p in self._data_files()])  # a new file may have been added
        self.file_var.set(path.name)
        self._update_title()
        self.status.configure(text=f"Saved {path}")
        return True

    def _check_can_save(self) -> bool:
        """Blocks saving a file without a group name or without questions."""
        assert self.file
        if not self.file.group.strip():
            messagebox.showerror("Can't save", "Enter a group name first.")
            self.group_entry.focus_set()
            return False
        if not self.file.questions:
            messagebox.showerror("Can't save", "Add at least one question first.")
            return False
        return True

    def _confirm_problems(self) -> bool:
        assert self.file
        issues = [(i, p) for i, q in enumerate(self.file.questions) for p in question_problems(q)]
        if not issues:
            return True
        lines = [f"#{i + 1}: {p}" for i, p in issues[:12]]
        if len(issues) > 12:
            lines.append(f"…and {len(issues) - 12} more")
        return messagebox.askyesno("Check questions", "Some questions have problems:\n\n" + "\n".join(lines) + "\n\nSave anyway?")

    def on_close(self):
        if self.confirm_discard():
            self.destroy()

    def _mark_dirty(self):
        if not self.dirty:
            self.dirty = True
            self._update_title()

    def _update_title(self):
        if not self.file:
            name = "no file"
        else:
            name = self.file.path.name if self.file.path else "untitled (new file)"
        self.title(f"{'● ' if self.dirty else ''}{name} — Question Editor")

    # ---------- Question list ----------

    def _rebuild_tree(self):
        self.tree.delete(*self.tree.get_children())
        if not self.file:
            return
        for index in range(len(self.file.questions)):
            self.tree.insert("", "end", iid=f"q{index}", open=True)
            self._refresh_tree_item(index)
        self.count_label.configure(text=f"{len(self.file.questions)} questions")

    def _refresh_tree_item(self, index: int):
        assert self.file
        q = self.file.questions[index]
        iid = f"q{index}"
        tags = ("question", "problem") if question_problems(q) else ("question",)
        self.tree.item(iid, text=f"{index + 1}.  {one_line(q['Question']) or '(empty question)'}", tags=tags)
        self.tree.delete(*self.tree.get_children(iid))
        for a_index, answer in enumerate(q["Answers"]):
            correct = a_index == 0
            mark = "✓" if correct else "•"
            self.tree.insert(iid, "end", iid=f"q{index}a{a_index}",
                             text=f"{mark}  {one_line(answer, 70) or '(empty answer)'}",
                             tags=("correct",) if correct else ("answer",))

    def _select_question(self, index: int):
        iid = f"q{index}"
        self.tree.selection_set(iid)
        self.tree.focus(iid)
        self.tree.see(iid)

    def on_tree_select(self, _event=None):
        selection = self.tree.selection()
        if not selection:
            return
        iid = selection[0]
        # Clicking an answer selects its question
        parent = self.tree.parent(iid)
        index = int((parent or iid)[1:].split("a")[0])
        if parent:
            self.tree.selection_set(parent)
            return
        if index != self.current:
            self._show_question(index)

    def on_new_question(self):
        if not self.file:
            return
        insert_at = (self.current + 1) if self.current is not None else len(self.file.questions)
        self.file.questions.insert(insert_at, {"Question": "", "Answers": [""] * GAME_ANSWER_KEYS})
        self._mark_dirty()
        self._rebuild_tree()
        self.current = None
        self._select_question(insert_at)
        self._show_question(insert_at)
        self.question_text.focus_set()

    def on_delete_question(self):
        if not self.file or self.current is None:
            return
        q = self.file.questions[self.current]
        if not messagebox.askyesno("Delete question", f"Delete question #{self.current + 1}?\n\n{one_line(q['Question'], 120)}"):
            return
        del self.file.questions[self.current]
        self._mark_dirty()
        next_index = min(self.current, len(self.file.questions) - 1)
        self.current = None
        self._rebuild_tree()
        if next_index >= 0:
            self._select_question(next_index)
            self._show_question(next_index)
        else:
            self._show_question(None)

    # ---------- Editor ----------

    def _set_editor_enabled(self, enabled: bool):
        state = "normal" if enabled else "disabled"
        self.question_text.configure(state=state)
        self.add_answer_btn.configure(state=state)

    def _show_question(self, index: int | None):
        self.current = index
        self.loading = True
        self.question_text.configure(state="normal")
        self.question_text.delete("1.0", "end")
        if index is None or not self.file:
            self.editor_title.configure(text="Question")
            self._set_editor_enabled(False)
            self._build_answer_rows([])
        else:
            q = self.file.questions[index]
            self.editor_title.configure(text=f"Question #{index + 1}")
            self._set_editor_enabled(True)
            self.question_text.insert("1.0", q["Question"])
            self.question_text.edit_reset()
            self._build_answer_rows(q["Answers"])
        self.question_text.edit_modified(False)
        self.loading = False
        self._update_preview_and_problems()

    def on_question_text_changed(self, _event=None):
        if not self.question_text.edit_modified():
            return
        self.question_text.edit_modified(False)
        if self.loading or self.current is None or not self.file:
            return
        self.file.questions[self.current]["Question"] = self.question_text.get("1.0", "end-1c")
        self._after_edit()

    def on_group_changed(self, *_args):
        if self.loading or not self.file:
            return
        self.file.group = self.group_var.get()
        self._mark_dirty()

    def _after_edit(self):
        assert self.file and self.current is not None
        self._mark_dirty()
        self._refresh_tree_item(self.current)
        self._update_preview_and_problems()

    def _update_preview_and_problems(self):
        self.preview.configure(state="normal")
        self.preview.delete("1.0", "end")
        if self.file and self.current is not None:
            q = self.file.questions[self.current]
            text = q["Question"].replace("﻿", "")
            for line_index, line in enumerate(text.split("\n")):
                if line_index:
                    self.preview.insert("end", "\n")
                parts = line.split("*")
                if len(parts) % 2 == 0:  # unpaired * -> shown as-is, like the game does
                    self.preview.insert("end", line)
                    continue
                for part_index, part in enumerate(parts):
                    self.preview.insert("end", part, ("marked",) if part_index % 2 else ())
            problems = question_problems(q)
            self.problems_label.configure(text="⚠ " + "; ".join(problems) if problems else "")
        else:
            self.problems_label.configure(text="")
        self.preview.configure(state="disabled")

    # ---------- Answers ----------

    def _build_answer_rows(self, answers: list[str]):
        for child in self.answers_frame.winfo_children():
            child.destroy()
        self.answer_vars = []
        for a_index, answer in enumerate(answers):
            correct = a_index == 0
            ttk.Label(self.answers_frame, text=f"{a_index + 1}. {'✓ correct' if correct else 'wrong'}",
                      style="Correct.TLabel" if correct else "Wrong.TLabel", width=11
                      ).grid(row=a_index, column=0, sticky="w", pady=2)

            var = tk.StringVar(value=answer)
            var.trace_add("write", lambda *_a, i=a_index, v=var: self.on_answer_changed(i, v))
            entry = ttk.Entry(self.answers_frame, textvariable=var, font=("Segoe UI", 11))
            entry.grid(row=a_index, column=1, sticky="ew", padx=(4, 4), pady=2)
            self.answer_vars.append(var)

            up = ttk.Button(self.answers_frame, text="↑", width=3, command=lambda i=a_index: self.on_move_answer(i, -1))
            down = ttk.Button(self.answers_frame, text="↓", width=3, command=lambda i=a_index: self.on_move_answer(i, 1))
            delete = ttk.Button(self.answers_frame, text="✕", width=3, command=lambda i=a_index: self.on_delete_answer(i))
            up.grid(row=a_index, column=2, pady=2)
            down.grid(row=a_index, column=3, pady=2)
            delete.grid(row=a_index, column=4, padx=(4, 0), pady=2)
            if a_index == 0:
                up.state(["disabled"])
            if a_index == len(answers) - 1:
                down.state(["disabled"])

    def _answers(self) -> list[str]:
        assert self.file and self.current is not None
        return self.file.questions[self.current]["Answers"]

    def on_answer_changed(self, a_index: int, var: tk.StringVar):
        if self.loading or self.current is None:
            return
        self._answers()[a_index] = var.get()
        self._after_edit()

    def on_add_answer(self):
        if self.current is None:
            return
        self._answers().append("")
        self._rebuild_answers_after_change(focus=len(self._answers()) - 1)

    def on_delete_answer(self, a_index: int):
        answers = self._answers()
        if a_index == 0 and not messagebox.askyesno(
                "Delete correct answer", "This is the correct answer. After deleting it, the next answer becomes the correct one.\n\nDelete it?"):
            return
        del answers[a_index]
        self._rebuild_answers_after_change()

    def on_move_answer(self, a_index: int, direction: int):
        answers = self._answers()
        target = a_index + direction
        if not 0 <= target < len(answers):
            return
        answers[a_index], answers[target] = answers[target], answers[a_index]
        self._rebuild_answers_after_change()

    def _rebuild_answers_after_change(self, focus: int | None = None):
        self.loading = True
        self._build_answer_rows(self._answers())
        self.loading = False
        self._after_edit()
        if focus is not None:
            entries = [w for w in self.answers_frame.grid_slaves(row=focus, column=1)]
            if entries:
                entries[0].focus_set()


def main():
    initial = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else None
    app = QuestionEditor(initial)
    app.mainloop()


if __name__ == "__main__":
    main()
