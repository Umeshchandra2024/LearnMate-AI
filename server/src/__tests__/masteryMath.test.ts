import { computeUpdatedMasteryScore } from "@asc/shared";
import { classifyTrend, TREND_WINDOW_SIZE, TREND_SIGNIFICANCE_THRESHOLD } from "@asc/shared";

describe("computeUpdatedMasteryScore", () => {
  it("uses the plain average of new evidence when there is no prior score", () => {
    expect(computeUpdatedMasteryScore(null, [100, 0])).toBe(50);
    expect(computeUpdatedMasteryScore(null, [80])).toBe(80);
  });

  it("blends new evidence with the prior score, weighting new evidence more heavily", () => {
    // RECENT_EVIDENCE_WEIGHT = 0.6: previous*0.4 + newAvg*0.6.
    // previous=50, newAvg=100 -> 50*0.4 + 100*0.6 = 20 + 60 = 80.
    expect(computeUpdatedMasteryScore(50, [100])).toBe(80);
  });

  it("never overwrites with the latest answer alone — old evidence still pulls the score", () => {
    // A single perfect new answer on top of a very low prior shouldn't jump straight to 100.
    const result = computeUpdatedMasteryScore(0, [100]);
    expect(result).toBeLessThan(100);
    expect(result).toBeGreaterThan(0);
  });

  it("averages multiple new attempts from the same quiz before blending", () => {
    // newAvg of [100, 0] = 50; previous=50 -> 50*0.4 + 50*0.6 = 50.
    expect(computeUpdatedMasteryScore(50, [100, 0])).toBe(50);
  });
});

describe("classifyTrend", () => {
  it("returns insufficient-data for zero rows", () => {
    expect(classifyTrend([])).toBe("insufficient-data");
  });

  it("returns new for exactly one row — distinct from insufficient-data", () => {
    expect(classifyTrend([75])).toBe("new");
  });

  it("computes a real 1-vs-1 comparison with exactly 2 rows (adaptive window)", () => {
    // scores newest-first: [recent, prior]. recent=90, prior=40 -> improving.
    expect(classifyTrend([90, 40])).toBe("improving");
    expect(classifyTrend([40, 90])).toBe("needs-attention");
  });

  it("classifies small fluctuations as stable, not improving/needs-attention", () => {
    // Diff must be >= TREND_SIGNIFICANCE_THRESHOLD (5) to count as a real trend.
    expect(classifyTrend([52, 50])).toBe("stable");
    expect(TREND_SIGNIFICANCE_THRESHOLD).toBe(5);
  });

  it("uses at most TREND_WINDOW_SIZE rows per side even with a long history", () => {
    expect(TREND_WINDOW_SIZE).toBe(2);
    // 4 rows newest-first: recentWindow=[100,100] (avg 100), priorWindow=[0,0] (avg 0).
    expect(classifyTrend([100, 100, 0, 0])).toBe("improving");
  });
});
