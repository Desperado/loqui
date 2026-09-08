import { describe, expect, it } from "vitest";
import { detectAppLocale, isMobileBrowser, parseAcceptLanguage, preferredTranslationPair } from "../../src/lib/browserProfile";

describe("browser profile detection", () => {
  it("uses the first supported browser language", () => {
    expect(detectAppLocale({ languages: ["fr-FR", "uk-UA", "de-DE"] })).toBe("uk");
    expect(detectAppLocale({ languages: ["de-AT", "uk-UA"] })).toBe("de");
    expect(detectAppLocale({ languages: ["fr-FR", "en-US"] })).toBe("en");
    expect(detectAppLocale({ languages: ["en-US", "en", "de-DE", "de"] })).toBe("en");
    expect(detectAppLocale({ languages: ["en-GB", "uk"] })).toBe("en");
  });

  it("honors Accept-Language quality ordering", () => {
    expect(parseAcceptLanguage("de-DE;q=0.7, en-US;q=1, uk;q=0.8")).toEqual(["en-US", "uk", "de-DE"]);
    expect(detectAppLocale({ languages: parseAcceptLanguage("de-DE;q=0.7, en-US;q=1") })).toBe("en");
  });

  it("chooses reciprocal German and Ukrainian translation directions", () => {
    expect(preferredTranslationPair("uk")).toEqual({ sourceLang: "uk", targetLang: "de" });
    expect(preferredTranslationPair("de")).toEqual({ sourceLang: "de", targetLang: "uk" });
    expect(preferredTranslationPair("en")).toEqual({ sourceLang: "auto", targetLang: "uk" });
  });

  it("detects common mobile and tablet browser profiles", () => {
    expect(isMobileBrowser({ userAgentData: { mobile: true } })).toBe(true);
    expect(isMobileBrowser({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)" })).toBe(true);
    expect(isMobileBrowser({ userAgent: "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit Mobile" })).toBe(true);
    expect(isMobileBrowser({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)", maxTouchPoints: 5 })).toBe(true);
    expect(isMobileBrowser({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)", maxTouchPoints: 0 })).toBe(false);
  });
});
