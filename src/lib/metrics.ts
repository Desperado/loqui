// Text-quality metrics used by the eval harness.
// chrF (Popović 2015): character n-gram F-score, the standard lightweight MT metric.
// WER: word error rate, the standard speech-recognition metric.

function charNgrams(text: string, n: number): Map<string, number> {
  const grams = new Map<string, number>();
  const s = text.replace(/\s+/g, " ").trim();
  for (let i = 0; i + n <= s.length; i++) {
    const g = s.slice(i, i + n);
    grams.set(g, (grams.get(g) ?? 0) + 1);
  }
  return grams;
}

function overlap(a: Map<string, number>, b: Map<string, number>): number {
  let total = 0;
  for (const [g, count] of a) total += Math.min(count, b.get(g) ?? 0);
  return total;
}

/**
 * chrF score in [0, 100]. Character n-grams n=1..6, beta=2 (recall-weighted).
 */
export function chrF(hypothesis: string, reference: string, maxN = 6, beta = 2): number {
  const hyp = hypothesis.toLowerCase();
  const ref = reference.toLowerCase();
  if (!hyp.trim() || !ref.trim()) return 0;

  let precisionSum = 0;
  let recallSum = 0;
  let counted = 0;
  for (let n = 1; n <= maxN; n++) {
    const hypGrams = charNgrams(hyp, n);
    const refGrams = charNgrams(ref, n);
    const hypTotal = [...hypGrams.values()].reduce((a, b) => a + b, 0);
    const refTotal = [...refGrams.values()].reduce((a, b) => a + b, 0);
    if (hypTotal === 0 || refTotal === 0) continue;
    const match = overlap(hypGrams, refGrams);
    precisionSum += match / hypTotal;
    recallSum += match / refTotal;
    counted++;
  }
  if (counted === 0) return 0;
  const precision = precisionSum / counted;
  const recall = recallSum / counted;
  if (precision + recall === 0) return 0;
  const b2 = beta * beta;
  const f = ((1 + b2) * precision * recall) / (b2 * precision + recall);
  return Math.round(f * 1000) / 10; // one decimal, 0-100
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[.,!?;:"«»„“”()\-–—]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Word error rate in [0, 1+]: (substitutions + insertions + deletions) / reference length.
 */
export function wer(hypothesis: string, reference: string): number {
  const hyp = tokenize(hypothesis);
  const ref = tokenize(reference);
  if (ref.length === 0) return hyp.length === 0 ? 0 : 1;

  const dp: number[][] = Array.from({ length: ref.length + 1 }, (_, i) =>
    Array.from({ length: hyp.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= ref.length; i++) {
    for (let j = 1; j <= hyp.length; j++) {
      const cost = ref[i - 1] === hyp[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return Math.round((dp[ref.length][hyp.length] / ref.length) * 1000) / 1000;
}
