// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { FR } from "./i18n-fr";
import { ZH_CN } from "./i18n-zh-CN";
import { spoken, t, tc, tn } from "./i18n";
import { UNDONE, fromService } from "./i18n-daemon";
import { setPrefs } from "./prefs";

afterEach(() => setPrefs({ language: "en" }));

describe("the app's words", () => {
  it("are the English text until another language is chosen, with their names filled in", () => {
    expect(t("Saved: “{name}” is in the sidebar", { name: "Receipts" })).toBe("Saved: “Receipts” is in the sidebar");
    expect(tn(1, "1 message", "{count} messages")).toBe("1 message");
    expect(tn(1200, "1 message", "{count} messages")).toMatch(/^1.?200 messages$/);
  });

  it("are French where the table has them, English where it does not yet", () => {
    setPrefs({ language: "fr" });
    expect(t("Mark read")).toBe(FR["Mark read"]);
    expect(t("A sentence nobody translated")).toBe("A sentence nobody translated");
  });

  it("count as French does: 0 and 1 are singular", () => {
    setPrefs({ language: "fr" });
    const forms = FR["{count} messages selected"];
    expect(typeof forms).toBe("object");
    expect(tn(0, "1 message selected", "{count} messages selected")).toBe("0 message sélectionné");
    expect(tn(1, "1 message selected", "{count} messages selected")).toBe("1 message sélectionné");
    expect(tn(3, "1 message selected", "{count} messages selected")).toBe("3 messages sélectionnés");
  });
});

describe("a word English uses for two things", () => {
  it("is told apart by its context", () => {
    expect(tc("folder", "Archive")).toBe("Archive");
    setPrefs({ language: "fr" });
    expect(tc("folder", "Archive")).toBe("Archives");
    expect(t("Archive")).toBe("Archiver");
  });
});

describe("the French table", () => {
  const names = (text: string) => new Set([...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]));
  it("keeps the names of the English text: each one, and no other", () => {
    for (const [english, french] of Object.entries(FR)) {
      const wanted = names(english);
      for (const form of typeof french === "string" ? [french] : [french.one, french.other]) {
        const used = names(form);
        for (const name of used) expect(wanted.has(name), `${english} → ${form}: {${name}}`).toBe(true);
        for (const name of wanted) if (name !== "count" || typeof french === "string") expect(used.has(name), `${english} → ${form}: no {${name}}`).toBe(true);
      }
    }
  });
});

describe("the Chinese table", () => {
  const names = (text: string) => new Set([...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]));
  it("keeps the names of the English text: each one, and no other", () => {
    for (const [english, chinese] of Object.entries(ZH_CN)) {
      const wanted = names(english);
      for (const form of typeof chinese === "string" ? [chinese] : [chinese.one, chinese.other]) {
        const used = names(form);
        for (const name of used) expect(wanted.has(name), `${english} → ${form}: {${name}}`).toBe(true);
        for (const name of wanted) if (name !== "count" || typeof chinese === "string") expect(used.has(name), `${english} → ${form}: no {${name}}`).toBe(true);
      }
    }
  });

  it("has every key the French table has, and no others, so neither silently falls back", () => {
    expect(Object.keys(ZH_CN).sort()).toEqual(Object.keys(FR).sort());
  });

  it("speaks Chinese: one form for every count, and English where a word is missing", () => {
    setPrefs({ language: "zh-CN" });
    expect(t("Mark read")).toBe("标为已读");
    expect(tc("folder", "Archive")).toBe("归档");
    expect(t("Archive")).toBe("归档");
    expect(tn(1, "1 message", "{count} messages")).toBe("1 封邮件");
    expect(tn(3, "1 message", "{count} messages")).toBe("3 封邮件");
    expect(t("A sentence nobody translated")).toBe("A sentence nobody translated");
  });

  it("says what the background service writes", () => {
    setPrefs({ language: "zh-CN" });
    for (const word of UNDONE) expect(fromService(word), word).not.toBe(word);
    for (const said of [
      "Moved to Receipts",
      "Marked 3 messages read",
      "Flagged 2 messages",
      "Send “Plans” to Ada and Bob",
      "Archive 1 message",
      "Archived (3 messages)",
    ]) {
      expect(fromService(said), said).not.toBe(said);
    }
  });

  it("is the system's language when it speaks Simplified Chinese, not Traditional", () => {
    const use = (tag: string) => Object.defineProperty(window.navigator, "language", { value: tag, configurable: true });
    const original = Object.getOwnPropertyDescriptor(window.navigator, "language");
    try {
      setPrefs({ language: "system" });
      for (const [tag, wanted] of [
        ["zh-CN", "zh-CN"],
        ["zh-Hans-CN", "zh-CN"],
        ["zh-SG", "zh-CN"],
        ["zh-TW", "en"],
        ["zh-HK", "en"],
        ["zh-Hant-TW", "en"],
      ] as const) {
        use(tag);
        expect(spoken(), tag).toBe(wanted);
      }
    } finally {
      if (original) Object.defineProperty(window.navigator, "language", original);
      else delete (window.navigator as unknown as { language?: string }).language;
    }
  });
});
