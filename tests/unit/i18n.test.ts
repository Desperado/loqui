import { describe, expect, it } from "vitest";
import { localizedLanguageNames, pluralKey, translations } from "../../src/lib/i18n";
import { LANGS } from "../../src/lib/translate";

describe("UI translations", () => {
  it("keeps every locale dictionary in sync", () => {
    const englishKeys = Object.keys(translations.en).sort();
    expect(Object.keys(translations.de).sort()).toEqual(englishKeys);
    expect(Object.keys(translations.uk).sort()).toEqual(englishKeys);
  });

  it("names every supported translation language in every UI locale", () => {
    for (const locale of ["en", "de", "uk"] as const) {
      expect(Object.keys(localizedLanguageNames[locale]).sort()).toEqual([...LANGS].sort());
    }
  });

  it("selects Ukrainian singular, few, and many forms", () => {
    expect(pluralKey("message", "uk", 1)).toBe("messageOne");
    expect(pluralKey("message", "uk", 2)).toBe("messageFew");
    expect(pluralKey("message", "uk", 5)).toBe("messageMany");
    expect(pluralKey("message", "uk", 21)).toBe("messageOne");
  });
});
