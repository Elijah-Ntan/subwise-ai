import { describe, expect, it } from "vitest";
import { baseline, forecast, toMinor } from "../src/lib/finance";
import { emptyWorkspace, workspaceSchema, agentResponseSchema } from "../src/lib/contracts";
import { demoWorkspace, demoCsv } from "../src/lib/demo";
import { analyzeTransactions, normalizeMerchant, parseCsv } from "../src/lib/transactions";
import { createToolRuntime, validateGrounding } from "../src/lib/agent";
import { deleteLocalMemory, loadLocalMemory, saveLocalMemory } from "../src/lib/browser-memory";

function complete() {
  const w = demoWorkspace("student");
  w.profile = {
    income: 8000000,
    essentials: 3500000,
    savings: 2000000,
    otherObligations: 0,
    openingBalance: null,
    irregularIncome: false,
    goal: "Save monthly",
  };
  w.commitments = [
    {
      merchant: "netflix",
      monthlyAmount: 700000,
      status: "confirmed",
      transactionIds: ["student-09-2"],
    },
  ];
  return w;
}
const response = () =>
  agentResponseSchema.parse({
    intent: "forecast",
    investigation_summary: "Review the calculated scenario.",
    relevant_findings: [],
    supporting_transaction_ids: [],
    clarification_question: null,
    tool_results_used: [],
    financial_scenarios: [],
    recommended_actions: [],
    assumptions: [],
    uncertainties: [],
    next_user_action: "Review",
  });
describe("CSV and transaction analysis", () => {
  it("parses documented samples and exact minor units", () => {
    expect(parseCsv(demoCsv("student"))).toHaveLength(15);
    expect(toMinor("1,000.09")).toBe(100009);
  });
  it("normalizes noisy descriptions without inventing records", () => {
    expect(normalizeMerchant("WEB SPOTIFY NG 7492")).toBe("spotify");
    expect(
      analyzeTransactions(demoWorkspace("student").transactions).candidates.find(
        (c) => c.merchant === "spotify",
      )?.transactionIds,
    ).toHaveLength(3);
  });
  it.each(["2026-02-30", "invalid", "2026-13-01"])("rejects invalid date %s", (date) => {
    expect(() =>
      parseCsv(`id,date,description,amount,direction\na,${date},Rent,100,debit`),
    ).toThrow();
  });
  it.each(["-2", "1.001", "NaN", "1e9", "1000000001"])("rejects invalid money %s", (value) => {
    expect(() => toMinor(value)).toThrow();
  });
  it("requires headers and records", () => {
    expect(() => parseCsv("date,value\n2026-01-01,100")).toThrow(/columns/);
    expect(() => parseCsv("id,date,description,amount,direction")).toThrow();
  });
  it("rejects duplicate IDs without silently discarding transactions", () => {
    expect(() =>
      parseCsv(
        "id,date,description,amount,direction\na,2026-01-01,Shop,100,debit\na,2026-01-01,Shop,100,debit",
      ),
    ).toThrow(/Duplicate/);
  });
  it("flags duplicate-looking transactions and excludes credits", () => {
    const w = demoWorkspace("student");
    w.transactions.push({ ...w.transactions[1], id: "extra" });
    const a = analyzeTransactions(w.transactions);
    expect(a.duplicates).toHaveLength(1);
    expect(a.candidates.some((c) => c.merchant === "allowance")).toBe(false);
  });
  it("does not call rent a subscription", () => {
    const a = analyzeTransactions(demoWorkspace("student").transactions);
    expect(a.candidates.find((c) => c.merchant === "campus rent")?.classification).toBe(
      "unconfirmed recurring payment",
    );
  });
  it("distinguishes two histories", () => {
    expect(analyzeTransactions(demoWorkspace("student").transactions).candidates).not.toEqual(
      analyzeTransactions(demoWorkspace("freelancer").transactions).candidates,
    );
  });
  it("enforces upload limits", () => {
    expect(() => parseCsv("a".repeat(256001))).toThrow(/256/);
  });
});
describe("financial calculations", () => {
  it("calculates from confirmed expenses without double counting history", () => {
    const f = forecast(complete());
    expect(f.recurring).toBe(700000);
    expect(f.discretionary).toBe(1800000);
    expect(f.points[5].cumulativeSurplus).toBe(10800000);
    expect(f.points[0].projectedBalance).toBeNull();
  });
  it("keeps unknowns unknown, including other obligations", () => {
    const f = forecast(emptyWorkspace);
    expect(f.discretionary).toBeNull();
    expect(f.missing).toHaveLength(4);
    expect(f.points[0].cumulativeSurplus).toBeNull();
  });
  it("distinguishes an explicit zero from missing data", () => {
    const w = complete();
    w.profile.essentials = 0;
    expect(forecast(w).discretionary).toBe(5300000);
  });
  it("models a hypothetical cancellation and savings target", () => {
    const w = complete();
    expect(forecast(w, { ...baseline, omitMerchants: ["netflix"] }).discretionary).toBe(2500000);
    expect(forecast(w, { ...baseline, savings: 5000000 }).shortfall).toBe(1200000);
    expect(w.commitments).toHaveLength(1);
  });
  it("protects essential commitments and rejects invented merchants", () => {
    const w = complete();
    w.commitments[0].status = "essential";
    expect(() => forecast(w, { ...baseline, omitMerchants: ["netflix"] })).toThrow();
    expect(() => forecast(w, { ...baseline, omitMerchants: ["unknown"] })).toThrow();
  });
  it("ignores corrected non-recurring payments", () => {
    const w = complete();
    w.commitments[0].status = "not-recurring";
    expect(forecast(w).recurring).toBe(0);
  });
  it("exposes irregular income uncertainty", () => {
    const w = complete();
    w.profile.irregularIncome = true;
    expect(forecast(w).assumptions.join(" ")).toContain("not guaranteed");
  });
  it("rejects unsafe horizons and invalid schema evidence", () => {
    expect(() => forecast(complete(), { ...baseline, months: 100 })).toThrow();
    const w = complete();
    w.commitments[0].transactionIds = ["fabricated"];
    expect(() => workspaceSchema.parse(w)).toThrow();
  });
});
describe("tools and output grounding", () => {
  it("validates tool arguments and bounds alternatives", () => {
    const r = createToolRuntime(complete(), []);
    expect(() => r.execute("calculate_financial_future", { income: 1 })).toThrow();
    expect(() => r.execute("compare_financial_scenarios", { alternatives: [] })).toThrow();
    expect(() => r.execute("send_money", {})).toThrow();
  });
  it("records actual calculations and returns approved memory", () => {
    const w = complete();
    w.preferences = ["Keep my internet"];
    const r = createToolRuntime(w, []);
    r.execute("calculate_financial_future", {});
    expect(r.scenarios[0].discretionary).toBe(1800000);
    expect(r.execute("get_financial_memory", {})).toMatchObject({ preferences: w.preferences });
    expect(r.trace.map((t) => t.name)).toEqual([
      "calculate_financial_future",
      "get_financial_memory",
    ]);
  });
  it("rejects schema-invalid responses", () => {
    expect(() => agentResponseSchema.parse({ intent: "hello" })).toThrow();
  });
  it("rejects invented evidence, scenarios and tool claims", () => {
    const w = complete();
    const r = createToolRuntime(w, []);
    const a = response();
    a.supporting_transaction_ids = ["fake"];
    expect(() => validateGrounding(a, w, r)).toThrow();
    a.supporting_transaction_ids = [];
    a.financial_scenarios = ["fake"];
    expect(() => validateGrounding(a, w, r)).toThrow();
    a.financial_scenarios = [];
    a.tool_results_used = ["calculate_financial_future"];
    expect(() => validateGrounding(a, w, r)).toThrow();
  });
  it("checks proposed financial impacts against tool output", () => {
    const w = complete();
    const r = createToolRuntime(w, []);
    r.execute("compare_financial_scenarios", {
      alternatives: [{ ...baseline, omitMerchants: ["netflix"] }],
    });
    const a = response();
    a.recommended_actions = [
      {
        title: "Review Netflix",
        explanation: "Hypothetical",
        supporting_evidence: ["student-09-2"],
        preferences_considered: [],
        scenario_id: "scenario-2",
        potential_monthly_impact: 700000,
        priority: "low",
        requires_approval: true,
      },
    ];
    expect(validateGrounding(a, w, r)).toBe(a);
    a.recommended_actions[0].potential_monthly_impact = 800000;
    expect(() => validateGrounding(a, w, r)).toThrow(/impact/);
  });
});
describe("approved local memory", () => {
  it("round-trips plans, preferences and deletion", () => {
    const map = new Map<string, string>();
    const storage = {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => {
        map.set(k, v);
      },
      removeItem: (k: string) => {
        map.delete(k);
      },
    };
    const w = complete();
    w.preferences = ["Keep Netflix"];
    const plan = {
      id: "d0f5ada2-9c70-44f0-8a7b-7b080a61c415",
      createdAt: "2026-10-23T12:00:00.000Z",
      title: "My plan",
      actions: ["Review savings target"],
      assumptions: w.profile,
      scenario: baseline,
    };
    saveLocalMemory(storage, w, [plan]);
    expect(loadLocalMemory(storage)).toEqual({ workspace: w, plans: [plan] });
    deleteLocalMemory(storage);
    expect(loadLocalMemory(storage)).toBeNull();
  });
});
