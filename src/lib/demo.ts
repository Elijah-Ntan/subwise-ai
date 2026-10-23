import { emptyWorkspace, type Workspace } from "./contracts";
import { parseCsv } from "./transactions";

export function demoCsv(kind: "student" | "freelancer") {
  const rows = ["id,date,description,amount,direction"];
  for (let month = 7; month <= 9; month++) {
    const m = String(month).padStart(2, "0");
    const entries =
      kind === "student"
        ? [
            ["Allowance", "80000", "credit"],
            [month === 7 ? "WEB SPOTIFY NG 7492" : "Spotify payment", "1300", "debit"],
            ["Netflix", month === 9 ? "7000" : "5500", "debit"],
            ["Campus rent", "15000", "debit"],
            ["Groceries", "24000", "debit"],
          ]
        : [
            [
              "Freelance project",
              String(month === 7 ? 120000 : month === 8 ? 45000 : 95000),
              "credit",
            ],
            ["Family support", "25000", "debit"],
            ["Internet plan", "18000", "debit"],
            ["Market shopping", "30000", "debit"],
          ];
    entries.forEach(([description, amount, direction], i) =>
      rows.push(
        `${kind}-${m}-${i},2026-${m}-${String(i + 2).padStart(2, "0")},${description},${amount},${direction}`,
      ),
    );
  }
  return rows.join("\n");
}
export function demoWorkspace(kind: "student" | "freelancer"): Workspace {
  return {
    ...structuredClone(emptyWorkspace),
    source: `synthetic-${kind}`,
    transactions: parseCsv(demoCsv(kind)),
  };
}
