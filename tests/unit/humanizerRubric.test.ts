import { describe, expect, it } from "vitest";
import { HUMANIZER_EVAL_SET } from "../../src/lib/humanizerEvalset";
import {
  HUMANIZER_EDITORIAL_RUBRIC,
  HUMANIZER_UPSTREAM,
  reviewEditorialPatterns,
} from "../../src/lib/humanizerRubric";

function ids(text: string, language = "en", writingSample?: string) {
  return reviewEditorialPatterns({ text, language, writingSample }).map(({ id }) => id);
}

describe("Humanizer editorial rubric", () => {
  it("pins the adapted upstream version and keeps the prompt compact", () => {
    expect(HUMANIZER_UPSTREAM).toEqual({
      version: "3.0.0",
      commit: "9862685f575c65a8247f90369951df1b3416e3d6",
    });
    expect(HUMANIZER_EDITORIAL_RUBRIC.length).toBeLessThan(2_500);
  });

  it("detects the five persistent pattern families", () => {
    expect(ids("It is not just fast, but reliable.")).toContain("not_x_but_y");
    expect(ids("The cache is faster. That is the real win.")).toContain("dramatic_closer");
    expect(ids("Clear—fast—simple.")).toContain("excessive_dashes");
    expect(ids("We deliver clarity, confidence, and control.")).toContain("forced_triad");
    expect(ids("- **speed:** fast\n- **quality:** stable")).toContain("decorative_bold");
  });

  it("does not flag real contrasts, real lists, quotations, or technical hyphenation", () => {
    expect(ids("The flag is not red but blue.")).not.toContain("not_x_but_y");
    expect(ids("The supported colors are red, green, and blue.")).not.toContain("forced_triad");
    expect(ids('She quoted "It is not just fast, but reliable."')).not.toContain("not_x_but_y");
    expect(ids("Run `git diff -- src/lib/a-b.ts` before publishing.")).not.toContain("excessive_dashes");
    expect(ids("The TLS-encrypted, low-latency connection stays open.")).not.toContain("excessive_dashes");
  });

  it("lets a writing sample establish deliberate dash usage", () => {
    const text = "I tried it—twice—and kept both results.";
    const sample = "I write with asides—often—and I like the rhythm.";

    expect(ids(text)).toContain("excessive_dashes");
    expect(ids(text, "en", sample)).not.toContain("excessive_dashes");
  });

  it("does not run English lexical checks for German or Ukrainian", () => {
    expect(ids("It is not just fast, but reliable.", "de")).not.toContain("not_x_but_y");
    expect(ids("That is the real win.", "uk")).not.toContain("dramatic_closer");
  });

  it("provides fixtures for every rubric category and supported evaluation language", () => {
    expect(new Set(HUMANIZER_EVAL_SET.map(({ category }) => category))).toEqual(
      new Set(["staging", "rhythm", "inflation", "formatting", "residue"])
    );
    expect(new Set(HUMANIZER_EVAL_SET.map(({ language }) => language))).toEqual(new Set(["en", "de", "uk"]));
  });
});
