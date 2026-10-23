# SubWise implementation notes

## One financial investigation loop

The Next.js application owns authorization, calculations and persistence. A single OpenAI Responses workflow chooses five read-only analytical tools. No framework, vector database, Python service or autonomous write tools are involved.

1. The user imports a CSV or chooses a clearly marked synthetic dataset.
2. TypeScript validates the input and groups recurring candidates. The user reviews each candidate.
3. Optional natural-language extraction produces a proposal; confirming it updates the current session's profile.
4. `/api/agent` verifies identity or restricts public demo data to a canonical synthetic dataset.
5. The model selects tools. Zod validates each call. Application code executes it and returns results to the model.
6. Structured output is checked against actual transaction IDs, calculated scenario IDs, approved preference strings, tool invocations and proposed financial impact.
7. The user selects actions or adjusts a scenario. An explicit approval saves browser memory; a separate authenticated approval saves cloud memory.

The workflow allows eight tool calls, at most seven model rounds, and a 55-second overall abort deadline. Provider calls have 25-second timeouts with no automatic retries. A refusal, malformed output or grounding failure returns an error rather than a substitute answer. Numerical prose is prohibited by the prompt; numeric UI results are sourced from TypeScript tools. Semantic claims in prose still require live evaluation and are not mathematically verified.

## Shared contracts

`src/lib/contracts.ts` is the API contract source. Monetary values are integer kobo (100 per naira), capped at 100 billion per input. `null` means unknown; `0` is an explicit amount. `Workspace` contains transactions, confirmed commitments, profile and preferences. `Plan` captures selected actions, profile assumptions and an optional scenario. `FinancialAgentResponse` references source transactions and computed scenarios.

| Endpoint             | Contract and behavior                                                                               |
| -------------------- | --------------------------------------------------------------------------------------------------- |
| `POST /api/extract`  | `{message, workspace}` → proposed financial facts; does not persist                                 |
| `POST /api/agent`    | `{message, workspace, plans?, history?}` → structured response, tool trace, verified scenarios      |
| `GET /api/memory`    | Bearer-authenticated retrieval of the caller's approved aggregate                                   |
| `PUT /api/memory`    | `{approved: true, state: {workspace, plans}}`; caller identity comes from verified Supabase session |
| `DELETE /api/memory` | Authenticated deletion of the caller's aggregate                                                    |
| `GET /api/status`    | Boolean capability flags; no credentials or user data                                               |

## Financial model

Monthly remainder = expected income − separately entered essentials − confirmed recurring commitments − other obligations − planned savings. Transaction history supports investigation only; historical debits are never added again to this equation. Missing essentials, income, other obligations or savings leave the remainder unknown. An unknown starting balance leaves projected account balances unknown even if cumulative cash change can be calculated.

Monthly scenarios use constant assumptions across 1–24 months. They do not model payment-day timing, exchange rates, inflation, investment returns or stochastic income. Irregular income is explicitly labeled uncertain. Essential commitments cannot be omitted through a scenario. Potential savings are hypothetical, never booked as money saved.

## Storage and identity

For the MVP, Supabase stores one small atomic JSONB aggregate per user in `financial_workspaces`; it contains the profile, transactions, commitments, goals, preferences and plans. This avoids partial multi-table saves while keeping the authorization boundary explicit. Normalize into separate tables when record volume or query requirements justify it.

RLS applies to every select/insert/update/delete. The application uses the public anon key plus the authenticated user's bearer token, never a service-role key. Supabase Auth provides email-link sign-in. Nothing financial is written automatically. Browser memory uses a versioned, validated localStorage key only after approval and is shared by people using that browser profile; clearing browser memory removes it. Cloud memory is loaded explicitly to avoid overwriting unsaved work. Conversation history stays in the current tab, is limited to eight recent messages, and is not persisted by the application. OpenAI requests use `store: false`; provider-level retention policies still apply.

The transaction tool redacts long numeric strings from descriptions before sending them to OpenAI. User messages and free-text preferences may still contain sensitive text; this is not a full PII detector. CSV descriptions are untrusted data. Source data cannot grant a new tool or write permission.

## Current limits

- CSV: 256 KB, 500 rows, documented format only. No bank integrations or bank credentials.
- Recurrence detection uses approximately monthly dates, not bank-specific merchant enrichment. Users correct merchant grouping and confirm commitments. Payments are not automatically classified as subscriptions.
- Approved saved plans can be deleted and replaced; they do not execute payments or cancellations.
- In-process rate limits are best-effort per runtime instance. Before an unrestricted public launch, add a shared limiter or platform firewall rule. Public demo AI is off by default.
- Cloud saves are last-write-wins. Multi-device merge/version-conflict handling is future work.
- No key means no live model evaluation. Mock-provider tests establish orchestration behavior, not model accuracy.
