import type { Request, Response } from "express";
import fs from "fs";
import path from "path";

// Repo root's scripts/eval-results/ — populated by `npm run eval:tutor` / `npm run eval:quiz`.
// This endpoint just reads whatever was last written; it never re-runs the scripts itself
// (that would mean real Groq calls on every admin page load).
const EVAL_RESULTS_DIR = path.resolve(__dirname, "../../../../scripts/eval-results");

const KNOWN_EVALS = [
  { key: "tutor", file: "tutor-eval.json", label: "Tutor grounding eval" },
  { key: "quiz", file: "quiz-eval.json", label: "Quiz grading eval" },
];

export async function getEvalResults(_req: Request, res: Response) {
  const results = KNOWN_EVALS.map(({ key, file, label }) => {
    const filePath = path.join(EVAL_RESULTS_DIR, file);
    if (!fs.existsSync(filePath)) {
      return { key, label, available: false, data: null };
    }
    try {
      const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      return { key, label, available: true, data };
    } catch {
      return { key, label, available: false, data: null, error: "Failed to parse results file" };
    }
  });

  res.json({ evals: results });
}
