import { beforeEach, describe, expect, it, vi } from "vitest";
const sdk = vi.hoisted(() => ({ create: vi.fn(), parse: vi.fn() }));
vi.mock("openai", () => ({
  default: class {
    responses = sdk;
  },
}));
import { extractGoal, runAgent } from "../src/lib/agent";
import { emptyWorkspace } from "../src/lib/contracts";
const final = {
  intent: "clarify",
  investigation_summary: "Your essentials are unknown.",
  relevant_findings: [],
  supporting_transaction_ids: [],
  clarification_question: "What are your monthly essentials?",
  tool_results_used: ["get_financial_context"],
  financial_scenarios: [],
  recommended_actions: [],
  assumptions: [],
  uncertainties: ["Missing essentials"],
  next_user_action: "Confirm essentials",
};
beforeEach(() => {
  vi.stubEnv("OPENAI_API_KEY", "unit-test-not-a-real-key");
  sdk.create.mockReset();
  sdk.parse.mockReset();
});
describe("bounded real-tool orchestration (mock provider)", () => {
  it("executes requested tools and passes actual outputs back", async () => {
    sdk.create
      .mockResolvedValueOnce({
        status: "completed",
        output: [
          {
            type: "function_call",
            name: "get_financial_context",
            arguments: "{}",
            call_id: "call-1",
          },
        ],
      })
      .mockResolvedValueOnce({
        status: "completed",
        output: [],
        output_text: JSON.stringify(final),
      });
    const result = await runAgent("Can I save?", emptyWorkspace, []);
    expect(result.trace).toHaveLength(1);
    expect(result.response.clarification_question).toContain("essentials");
    expect(sdk.create.mock.calls[1][0].input).toContainEqual(
      expect.objectContaining({
        type: "function_call_output",
        call_id: "call-1",
        output: expect.stringContaining('"income":null'),
      }),
    );
  });
  it("stops excessive tool calls", async () => {
    sdk.create.mockResolvedValue({
      status: "completed",
      output: Array.from({ length: 9 }, (_, i) => ({
        type: "function_call",
        name: "get_financial_context",
        arguments: "{}",
        call_id: String(i),
      })),
    });
    await expect(runAgent("Analyze", emptyWorkspace, [])).rejects.toThrow(/tool limit/);
  });
  it("fails clearly on refusal", async () => {
    sdk.create.mockResolvedValue({ status: "completed", output: [], output_text: "" });
    await expect(runAgent("Analyze", emptyWorkspace, [])).rejects.toThrow(/declined/);
  });
  it("validates extracted natural-language goals without persisting them", async () => {
    sdk.parse.mockResolvedValue({
      output_parsed: {
        income: 8000000,
        savings: 2000000,
        essentials: null,
        irregularIncome: true,
        goal: "Laptop",
        explanation: "User supplied income and target",
      },
    });
    const proposal = await extractGoal("I get 80000 irregularly and aim to save 20000 a month");
    expect(proposal.income).toBe(8000000);
    expect(emptyWorkspace.profile.income).toBeNull();
    expect(sdk.parse.mock.calls[0][0].store).toBe(false);
  });
  it("rejects extraction with fractional minor units", async () => {
    sdk.parse.mockResolvedValue({
      output_parsed: {
        income: 1.2,
        savings: null,
        essentials: null,
        irregularIncome: null,
        goal: null,
        explanation: "Invalid",
      },
    });
    await expect(extractGoal("Income")).rejects.toThrow();
  });
});
