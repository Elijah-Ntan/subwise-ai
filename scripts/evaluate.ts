import { mkdir, writeFile } from "node:fs/promises";
import { runAgent, extractGoal } from "../src/lib/agent";
import { demoWorkspace } from "../src/lib/demo";
import { emptyWorkspace, type Workspace } from "../src/lib/contracts";

try {
  process.loadEnvFile(".env.local");
} catch {
  /* Optional locally; CI uses environment variables. */
}
function supplied(kind: "student" | "freelancer"): Workspace {
  const w = demoWorkspace(kind);
  w.profile = {
    income: 8000000,
    essentials: 3500000,
    savings: 2000000,
    otherObligations: 0,
    openingBalance: null,
    irregularIncome: kind === "freelancer",
    goal: "Save for a laptop",
  };
  return w;
}
const corrected = supplied("student");
corrected.commitments = [
  {
    merchant: "netflix",
    monthlyAmount: 700000,
    status: "essential",
    transactionIds: ["student-09-2"],
  },
];
corrected.preferences = ["Keep Netflix; I use it with my family."];
const irregular = supplied("freelancer");
irregular.profile.savings = 6000000;
const cases = [
  {
    name: "messy-merchants",
    workspace: supplied("student"),
    message:
      "Investigate recurring charges, including inconsistent Spotify descriptions. Show supporting transaction IDs.",
    check: (r: Awaited<ReturnType<typeof runAgent>>) =>
      r.trace.some((t) => t.name === "analyze_transactions") &&
      r.response.supporting_transaction_ids.concat(
        r.response.relevant_findings.flatMap((f) => f.transaction_ids),
      ).length > 0,
  },
  {
    name: "recurring-not-subscription",
    workspace: supplied("freelancer"),
    message: "Look at my family support payments. Are they a forgotten subscription?",
    check: (r: Awaited<ReturnType<typeof runAgent>>) =>
      r.trace.some((t) => t.name === "analyze_transactions") &&
      !/family support is (a |an )?(forgotten )?subscription/i.test(
        r.response.investigation_summary,
      ),
  },
  {
    name: "irregular-income",
    workspace: irregular,
    message:
      "My income varies. Calculate whether this monthly savings target works, and explain uncertainty.",
    check: (r: Awaited<ReturnType<typeof runAgent>>) =>
      r.scenarios.some((s) => s.shortfall !== null && s.shortfall > 0) &&
      r.response.uncertainties.length > 0,
  },
  {
    name: "missing-information",
    workspace: structuredClone(emptyWorkspace),
    message: "Can I afford to save more?",
    check: (r: Awaited<ReturnType<typeof runAgent>>) =>
      Boolean(r.response.clarification_question) &&
      r.scenarios.every((s) => s.discretionary === null),
  },
  {
    name: "approved-correction",
    workspace: corrected,
    message:
      "Use my approved preferences and compare my options for saving more. Netflix is essential and must stay.",
    check: (r: Awaited<ReturnType<typeof runAgent>>) =>
      r.trace.some(
        (t) => t.name === "get_financial_memory" || t.name === "get_financial_context",
      ) &&
      r.scenarios.every((s) => !s.adjustment.omitMerchants.includes("netflix")) &&
      !r.response.recommended_actions.some((a) => /(?:cancel|stop|remove) netflix/i.test(a.title)),
  },
  {
    name: "different-history",
    workspace: supplied("freelancer"),
    message: "Investigate recurring payments and their evidence.",
    check: (r: Awaited<ReturnType<typeof runAgent>>) =>
      r.trace.some((t) => t.name === "analyze_transactions") &&
      r.response.supporting_transaction_ids
        .concat(r.response.relevant_findings.flatMap((f) => f.transaction_ids))
        .every((id) => id.startsWith("freelancer-")),
  },
  {
    name: "changed-goal",
    workspace: {
      ...supplied("student"),
      profile: { ...supplied("student").profile, savings: 7000000 },
    },
    message: "Calculate my financial future with my new savings target.",
    check: (r: Awaited<ReturnType<typeof runAgent>>) =>
      r.scenarios.some((s) => s.shortfall !== null && s.shortfall > 0),
  },
];
async function main() {
  const outputs: unknown[] = [];
  for (const c of cases) {
    if (!process.env.OPENAI_API_KEY) {
      outputs.push({
        name: c.name,
        status: "blocked",
        reason: "OPENAI_API_KEY is not configured; no provider call made.",
      });
      continue;
    }
    try {
      const output = await runAgent(c.message, c.workspace, []);
      outputs.push({ name: c.name, status: c.check(output) ? "passed" : "failed", output });
    } catch (e) {
      outputs.push({
        name: c.name,
        status: "failed",
        error: e instanceof Error ? e.message : "Unknown error",
      });
    }
  }
  if (process.env.OPENAI_API_KEY) {
    try {
      const output = await extractGoal(
        "I receive about ₦80,000 each month. I want to save ₦20,000 monthly for a laptop.",
      );
      outputs.push({
        name: "natural-language-goal",
        status:
          output.income === 8000000 && output.savings === 2000000 && output.essentials === null
            ? "passed"
            : "failed",
        output,
      });
    } catch (e) {
      outputs.push({ name: "natural-language-goal", status: "failed", error: String(e) });
    }
  } else
    outputs.push({
      name: "natural-language-goal",
      status: "blocked",
      reason: "OPENAI_API_KEY is not configured.",
    });
  await mkdir("evaluations", { recursive: true });
  const report = {
    recordedAt: new Date().toISOString(),
    model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
    syntheticOnly: true,
    note: "Automatic checks are limited; manually review actual outputs for semantic quality. Mock tests are not live model evaluations.",
    results: outputs,
  };
  await writeFile("evaluations/latest.json", JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify(
      outputs.map((o) => {
        const r = o as { name: string; status: string };
        return { name: r.name, status: r.status };
      }),
      null,
      2,
    ),
  );
  if (outputs.some((o) => (o as { status: string }).status !== "passed")) process.exitCode = 1;
}
void main();
