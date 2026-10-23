import { z } from "zod";

export const money = z.number().int().min(0).max(100_000_000_000);
export const transactionSchema = z.object({
  id: z.string().min(1).max(80),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine((value) => {
      const parsed = new Date(`${value}T00:00:00Z`);
      return Number.isFinite(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
    }, "Invalid calendar date"),
  description: z.string().min(1).max(180),
  merchant: z.string().min(1).max(100),
  amount: money,
  direction: z.enum(["debit", "credit"]),
});
export const commitmentSchema = z.object({
  merchant: z.string().min(1).max(100),
  monthlyAmount: money,
  status: z.enum(["confirmed", "essential", "not-recurring"]),
  transactionIds: z.array(z.string()).max(500),
});
export const profileSchema = z.object({
  income: money.nullable(),
  essentials: money.nullable(),
  savings: money.nullable(),
  otherObligations: money.nullable(),
  openingBalance: money.nullable(),
  irregularIncome: z.boolean(),
  goal: z.string().max(500),
});
export const workspaceSchema = z
  .object({
    source: z.enum(["empty", "synthetic-student", "synthetic-freelancer", "csv"]),
    transactions: z.array(transactionSchema).max(500),
    commitments: z.array(commitmentSchema).max(100),
    profile: profileSchema,
    preferences: z.array(z.string().min(1).max(300)).max(20),
  })
  .superRefine((data, ctx) => {
    const ids = new Set(data.transactions.map((t) => t.id));
    if (ids.size !== data.transactions.length)
      ctx.addIssue({ code: "custom", message: "Duplicate transaction IDs" });
    if (new Set(data.commitments.map((c) => c.merchant)).size !== data.commitments.length)
      ctx.addIssue({ code: "custom", message: "Duplicate commitments" });
    for (const c of data.commitments)
      if (c.transactionIds.some((id) => !ids.has(id)))
        ctx.addIssue({ code: "custom", message: "Unknown commitment evidence" });
  });
export const adjustmentSchema = z
  .object({
    label: z.string().min(1).max(80),
    income: money.nullable(),
    savings: money.nullable(),
    essentials: money.nullable(),
    omitMerchants: z.array(z.string().max(100)).max(20),
    months: z.number().int().min(1).max(24),
  })
  .strict();
export const extractionSchema = z.object({
  income: money.nullable(),
  savings: money.nullable(),
  essentials: money.nullable(),
  irregularIncome: z.boolean().nullable(),
  goal: z.string().nullable(),
  explanation: z.string(),
});
export const agentResponseSchema = z.object({
  intent: z.string(),
  investigation_summary: z.string(),
  relevant_findings: z.array(
    z.object({
      observation: z.string(),
      transaction_ids: z.array(z.string()),
      status: z.enum(["observed", "confirmed", "uncertain"]),
    }),
  ),
  supporting_transaction_ids: z.array(z.string()),
  clarification_question: z.string().nullable(),
  tool_results_used: z.array(z.string()),
  financial_scenarios: z.array(z.string()),
  recommended_actions: z.array(
    z.object({
      title: z.string(),
      explanation: z.string(),
      supporting_evidence: z.array(z.string()),
      preferences_considered: z.array(z.string()),
      scenario_id: z.string().nullable(),
      potential_monthly_impact: z.number().int().nullable(),
      priority: z.enum(["high", "medium", "low"]),
      requires_approval: z.boolean(),
    }),
  ),
  assumptions: z.array(z.string()),
  uncertainties: z.array(z.string()),
  next_user_action: z.string(),
});
export const planSchema = z.object({
  id: z.string().uuid(),
  createdAt: z.string().datetime(),
  title: z.string().min(1).max(160),
  actions: z.array(z.string().min(1).max(1000)).min(1).max(20),
  assumptions: profileSchema,
  scenario: adjustmentSchema.nullable(),
});
export const savedStateSchema = z.object({
  workspace: workspaceSchema,
  plans: z.array(planSchema).max(30),
});
export type Workspace = z.infer<typeof workspaceSchema>;
export type Transaction = z.infer<typeof transactionSchema>;
export type Adjustment = z.infer<typeof adjustmentSchema>;
export type AgentResponse = z.infer<typeof agentResponseSchema>;
export type Plan = z.infer<typeof planSchema>;
export type Extraction = z.infer<typeof extractionSchema>;
export const emptyWorkspace: Workspace = {
  source: "empty",
  transactions: [],
  commitments: [],
  preferences: [],
  profile: {
    income: null,
    essentials: null,
    savings: null,
    otherObligations: null,
    openingBalance: null,
    irregularIncome: false,
    goal: "",
  },
};
