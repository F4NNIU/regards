import { FR } from "./i18n-fr";
import { ZH_CN } from "./i18n-zh-CN";
import { getPrefs } from "./prefs";

/**
 * The app's words in its language. The English text is the key, so the code
 * reads as it shows: `t("Mark read")`, `t("Saved: “{name}”", { name })`, and
 * `tn(count, "1 message", "{count} messages")` for a count. A language's
 * table gives each its translation; what it lacks stays in English.
 */
export type Spoken = "en" | "fr" | "zh-CN";

/** A translation: one text, or a count's forms (`one` for 0 and 1 in French). */
export type Entry = string | { one: string; other: string };

const TABLES: Record<Exclude<Spoken, "en">, Record<string, Entry>> = { fr: FR, "zh-CN": ZH_CN };

const systemSpeaks = (language: Spoken) => {
  const tag = navigator.language.toLowerCase();
  // Simplified Chinese: zh-CN, zh-SG and anything written in the Hans script.
  // Traditional (zh-TW, zh-HK, zh-Hant) does not match, and stays English.
  return language === "zh-CN" ? /^zh-(?:cn|sg|hans)/.test(tag) : tag.startsWith(language);
};

/** The language the app speaks: the one chosen, or the system's when it is French or Chinese. */
export function spoken(): Spoken {
  const chosen = getPrefs().language;
  if (chosen !== "system") return chosen;
  return systemSpeaks("fr") ? "fr" : systemSpeaks("zh-CN") ? "zh-CN" : "en";
}

/** For dates and numbers: the system's own locale when it speaks the app's language (fr-CH, say), or the language. */
export function appLocale(): string {
  const language = spoken();
  return systemSpeaks(language) ? navigator.language : language;
}

const fill = (text: string, values: Record<string, string | number>) =>
  text.replace(/\{(\w+)\}/g, (all, name: string) => (name in values ? String(values[name]) : all));

/** `text` (English) in the app's language, with its `{name}`s filled in. */
export function t(text: string, values: Record<string, string | number> = {}): string {
  const language = spoken();
  const entry = language === "en" ? undefined : TABLES[language][text];
  return fill(typeof entry === "object" ? entry.other : (entry ?? text), values);
}

/**
 * `text` where English uses one word for two things (Archive the verb and
 * Archive the folder): the table keys it as `context|text`; English shows
 * `text`.
 */
export function tc(context: string, text: string, values: Record<string, string | number> = {}): string {
  const language = spoken();
  const entry = language === "en" ? undefined : TABLES[language][`${context}|${text}`];
  return fill(typeof entry === "object" ? entry.other : (entry ?? text), values);
}

/**
 * A sentence about a count: `one` (English, for 1) or `other` (English, the
 * key), as the app's language counts; `{count}` is the number, written as
 * there.
 */
export function tn(count: number, one: string, other: string, values: Record<string, string | number> = {}): string {
  const language = spoken();
  const all = { count: count.toLocaleString(appLocale()), ...values };
  const entry = language === "en" ? undefined : TABLES[language][other];
  if (entry === undefined) return fill(count === 1 ? one : other, all);
  if (typeof entry === "string") return fill(entry, all);
  return fill(new Intl.PluralRules(language).select(count) === "one" ? entry.one : entry.other, all);
}
