# SubWise AI

Your money has a future. See it before it happens.

A small financial investigation workspace for the TIC Hackathon 3.0. One real AI agent investigates user-supplied information with read-only tools; TypeScript calculates every forecast; users approve what is remembered.

## Run locally

Requires Node.js 22.12+ and npm.

```sh
npm ci
npm run dev
```

Open http://localhost:3000. If that port is already in use, Next.js prints the selected port. CSV analysis, synthetic samples, the scenario calculator and explicit browser saves work without external credentials.

## Connect live AI and cloud memory

Copy `.env.example` to `.env.local` and configure it privately; never commit keys.

- `OPENAI_API_KEY`: server-only OpenAI key.
- `OPENAI_MODEL`: configurable Responses-compatible model; defaults to `gpt-4.1-mini`.
- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Supabase project URL and public anon key. Never use a service-role key here.
- `ALLOW_DEMO_AI`: defaults to `false`. Set `true` only for a controlled synthetic demonstration if you want AI access without signing in. Real CSV AI analysis requires authentication.

Apply `supabase/migrations/001_financial_memory.sql` in your Supabase SQL editor. Enable email-link authentication and allow your application URL in Auth redirect settings. Restart the app after changing environment variables. Click **Guest workspace** to sign in. Cloud save and load are explicit operations.

Live AI and Supabase have not been verified in this development environment because their credentials are absent. The interface reports unavailable services; it never replaces AI output with prerecorded responses or reports an unsuccessful cloud save as successful.

## CSV format

```csv
id,date,description,amount,direction
tx-1,2026-07-04,WEB SPOTIFY NG 7492,1300.00,debit
tx-2,2026-08-04,Spotify payment,1300.00,debit
```

Amounts are positive naira with at most two decimal places; direction is `debit` or `credit`. Dates use `YYYY-MM-DD`. IDs must be unique. Uploads are limited to 256 KB and 500 rows. Both downloadable sample histories are synthetic.

## Verification

```sh
npm run test
npm run typecheck
npm run lint
npm run build
npx playwright install chromium
npm run test:e2e
npm run eval
```

Browser tests use the production build on port 3091, avoiding unrelated development servers. `PLAYWRIGHT_CHANNEL=msedge` or `chrome` can use an installed browser. Live evaluations write actual results to `evaluations/latest.json` and return a nonzero exit code for failed or blocked cases. Without credentials they are explicitly marked blocked, not passed. RLS tests in `supabase/tests/financial_memory_rls.sql` are intended for a disposable local Supabase instance with pgTAP.

## Project structure

- `src/lib/contracts.ts`: validated shared API contracts.
- `src/lib/transactions.ts`: CSV normalization, recurrence candidates and duplicate review.
- `src/lib/finance.ts`: precise deterministic forecasts.
- `src/lib/agent.ts`: bounded Responses tool loop, extraction and output grounding.
- `src/app/api`: authenticated memory, AI and status endpoints.
- `src/components`: responsive investigation, evidence, assumptions, scenarios and memory UI.
- `supabase`: migration and tenant-isolation tests.
- `tests`, `e2e`, `scripts/evaluate.ts`: unit/integration, browser and live model evaluations.

## Deploy

Import this GitHub repository into Vercel with the Next.js preset. Configure the environment variables above in the intended environment, apply the Supabase migration, and allow the Vercel URL in Supabase Auth. No external credentials are needed to build. AI-intensive operations remain unavailable until configured.

GitHub Actions runs lint, unit tests, a production build and the browser journey. See [architecture and limits](docs/architecture.md) and the [two-minute demo](docs/demo.md).

## Scope

This is decision support, not payment execution. Recurring charges need confirmation; missing information stays unknown; scenarios are estimates. There are no bank connections, automatic cancellations, continuous monitoring or claims of model retraining. Rate limits are currently best-effort per server process; use a shared limiter before an unrestricted public launch.
