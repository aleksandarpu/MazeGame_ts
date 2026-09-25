# Question Editor

A desktop editor for the game's question files in `assets/data/*.json`. It's a single Python 3 script built on Tkinter (included with Python), so there's nothing to install.

## Run

From the project root:

```
python tools/question-editor/question_editor.py
```

This opens the first file in `assets/data/`. Pick another file from the **File** list, or pass a path:

```
python tools/question-editor/question_editor.py assets/data/jezik_qa.json
```

## Using it

- **Left column:** every question with its answers. The correct answer is green with a ✓. Questions with a problem are shown in red.
- **Right column:** the editor for the selected question.
  - **Question text:** press Enter for a new line. Wrap words in `*stars*` to show them in red in the game. The **Preview** shows how it will look.
  - **Answers:** edit them in place. Use ↑ / ↓ to reorder, ✕ to delete and **+ Add answer** to add one. **The first answer is the correct one**, and the game shuffles answers before showing them.
- **+ New question** (Ctrl+N) adds a question with 4 empty answers after the selected one. **Delete question** removes the selected question.
- **Group** at the top is the file's group name.
- **New file…** starts an empty question file. Enter a group name, add questions, then Save, which asks where to save it (usually `assets/data/`). To use a new file in the game, import it in `src/questions.ts` and give it a flag type.
- **Save** (Ctrl+S) writes the file. A file can't be saved without a group name or without at least one question. If any question has a problem, you're warned and can save anyway. Problems are: empty text, fewer than 2 or more than 4 answers (the game uses keys 1–4), an empty answer, or an unpaired `*`.
- Unsaved changes are marked with ● in the window title. You're asked before closing or switching files.

Saving keeps the file's formatting: 4-space indentation, UTF-8 text (Cyrillic is not escaped) and the original line endings. Opening and saving a file without changes produces an identical file.
