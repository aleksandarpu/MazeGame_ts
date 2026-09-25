// UI texts live in assets/lang/<language>.json (one flat key -> text map per language).
// Texts can have {placeholders}. Plural texts have one key per plural form
// ("<key>.one", "<key>.few", "<key>.other", ... as Intl.PluralRules names them), used by tPlural.
// To add a language: add a JSON file with the same keys and an entry in `languages`.
import en from "../assets/lang/en.json";
import sr from "../assets/lang/sr.json";

export type TextKey = keyof typeof en;

// Compile-time check: every language has every English key (extra plural forms are fine)
sr satisfies Record<TextKey, string>;

export type Language = { id: string; label: string; texts: Record<string, string> };

export const languages: Language[] = [
  { id: "en", label: "English", texts: en },
  { id: "sr", label: "Српски", texts: sr },
];

const LANGUAGE_KEY = "mazegame.language";

function initialLanguage(): Language {
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(LANGUAGE_KEY);
  } catch {
    // Storage blocked; fall back to the browser language
  }
  const wanted = saved ?? (navigator.language.toLowerCase().startsWith("sr") ? "sr" : "en");
  return languages.find((l) => l.id === wanted) ?? languages[0];
}

let current: Language = initialLanguage();

function applyToDocument() {
  document.documentElement.lang = current.id;
  document.title = t("app.title");
}

export function getLanguage(): Language {
  return current;
}

export function setLanguage(id: string) {
  const next = languages.find((l) => l.id === id);
  if (!next) return;
  current = next;
  try {
    localStorage.setItem(LANGUAGE_KEY, id);
  } catch {
    // Not saved; the choice lasts for this page load
  }
  applyToDocument();
}

function fill(text: string, params: Record<string, string | number>): string {
  return text.replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match));
}

/** The text for `key` in the current language (English if missing), with {placeholders} filled in. */
export function t(key: TextKey, params: Record<string, string | number> = {}): string {
  return fill(current.texts[key] ?? en[key] ?? key, params);
}

// Keys that have plural forms: "dice.youRolled" for "dice.youRolled.one" / ".other" ...
type PluralKey = { [K in TextKey]: K extends `${infer Base}.other` ? Base : never }[TextKey];

/** Like t, choosing the plural form for `count` (also available as {n}). */
export function tPlural(key: PluralKey, count: number, params: Record<string, string | number> = {}): string {
  const form = new Intl.PluralRules(current.id).select(count);
  const text = current.texts[`${key}.${form}`] ?? current.texts[`${key}.other`] ?? en[`${key}.other` as TextKey];
  return fill(text, { n: count, ...params });
}

/** A language drop-down; `onChange` runs after the language has switched (redraw the screen there). */
export function createLanguagePicker(onChange: () => void): HTMLLabelElement {
  const label = document.createElement("label");
  Object.assign(label.style, { display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "14px" });
  label.append(`${t("language.label")}: `);

  const select = document.createElement("select");
  Object.assign(select.style, { padding: "4px 6px", fontSize: "14px", borderRadius: "5px" });
  for (const language of languages) {
    const option = document.createElement("option");
    option.value = language.id;
    option.textContent = language.label;
    option.selected = language.id === current.id;
    select.appendChild(option);
  }
  select.addEventListener("change", () => {
    setLanguage(select.value);
    onChange();
  });
  label.appendChild(select);
  return label;
}

applyToDocument();
