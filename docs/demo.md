# Two-minute demonstration

Use synthetic data only. To demonstrate real AI, configure OpenAI and either sign in to Supabase or explicitly enable `ALLOW_DEMO_AI=true` for the controlled synthetic demo.

1. Load **Student sample**. Ask: “I receive about ₦80,000 monthly and want to save ₦20,000 monthly. Can I make it work?” Choose **Extract my goals for review**, inspect the proposal and confirm it.
2. Ask the agent to investigate recurring payments. Inspect actual supporting IDs and the executed-tool details. It should seek clarification about missing expenses.
3. In **The bigger picture**, enter income 80,000, essentials 35,000, savings 20,000, other obligations 0. Essentials here exclude rent and Netflix. Confirm the assumptions.
4. In **Money X-ray**, mark campus rent essential, Netflix recurring, and groceries and Spotify non-recurring for this illustrative scenario. These are user decisions, not model conclusions.
5. The baseline monthly remainder is ₦3,000. Explore stopping Netflix; the hypothetical remainder becomes ₦10,000. No service is canceled. Ask the agent to explain the scenario and inspect its actual calculation calls.
6. Approve the scenario, add a preference such as “Keep my internet for coursework,” and save browser memory or save to your account. Refresh and inspect the restored plan. For cloud memory, choose **Load from account**. Ask another related question; inspect the memory tool result.

Repeat with the freelancer sample and irregular income, then change the savings target. Clear an essential assumption to demonstrate an explicitly incomplete forecast. Merchant corrections clear affected confirmations and force review.

Without an API key, only the data review, deterministic calculations and explicit browser memory can be demonstrated. Do not present these as live AI output.
