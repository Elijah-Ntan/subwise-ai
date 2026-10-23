"use client";
import dynamic from "next/dynamic";
import { baseline, forecast, formatMoney } from "@/lib/finance";
import type { Adjustment, Workspace } from "@/lib/contracts";
import { Button } from "./ui/button";
const FutureChart = dynamic(() => import("./future-chart"), {
  ssr: false,
  loading: () => <p className="helper">Loading chart…</p>,
});
export function Future({
  workspace,
  scenario,
  setScenario,
  onExplain,
  onSave,
}: {
  workspace: Workspace;
  scenario: Adjustment;
  setScenario: (a: Adjustment) => void;
  onExplain: () => void;
  onSave: () => void;
}) {
  const base = forecast(workspace, { ...baseline, months: scenario.months });
  const alt = forecast(workspace, scenario);
  return (
    <section className="panel" id="future">
      <div className="section-heading">
        <div>
          <p className="eyebrow">LOOK AHEAD</p>
          <h2>Your financial future</h2>
        </div>
        <span className="tag">Scenario</span>
      </div>
      <p className="helper">
        Explore a choice before you make it. These are estimates based on your confirmed
        assumptions.
      </p>
      <div className="metrics">
        <div>
          <span>Current monthly remainder</span>
          <strong>
            {base.discretionary === null
              ? "Not enough information"
              : formatMoney(base.discretionary)}
          </strong>
        </div>
        <div>
          <span>With your changes</span>
          <strong
            className={
              alt.discretionary !== null && alt.discretionary < 0 ? "negative" : "positive"
            }
          >
            {alt.discretionary === null ? "Not enough information" : formatMoney(alt.discretionary)}
          </strong>
        </div>
      </div>
      {alt.missing.length ? (
        <div className="notice">To calculate this, confirm: {alt.missing.join(", ")}.</div>
      ) : (
        <>
          <FutureChart base={base} alternative={alt} />
          <p className="chart-caption">
            <span className="legend-dot gray" /> Current plan <span className="legend-dot" /> Your
            scenario <span>Cash remaining after planned savings · NGN</span>
          </p>
        </>
      )}
      <div className="scenario-controls">
        <label>
          Monthly savings in this scenario:{" "}
          <b>{formatMoney(scenario.savings ?? workspace.profile.savings ?? 0)}</b>
          <input
            aria-label="Scenario monthly savings"
            type="range"
            min={0}
            max={Math.max((workspace.profile.income ?? 10000000) / 100, 100000)}
            step={500}
            value={(scenario.savings ?? workspace.profile.savings ?? 0) / 100}
            onChange={(e) => setScenario({ ...scenario, savings: Number(e.target.value) * 100 })}
          />
        </label>
        <label>
          Time horizon
          <select
            aria-label="Time horizon"
            value={scenario.months}
            onChange={(e) => setScenario({ ...scenario, months: Number(e.target.value) })}
          >
            <option value={3}>3 months</option>
            <option value={6}>6 months</option>
            <option value={12}>12 months</option>
          </select>
        </label>
      </div>
      {workspace.commitments
        .filter((c) => c.status === "confirmed")
        .map((c) => (
          <label className="check" key={c.merchant}>
            <input
              type="checkbox"
              checked={scenario.omitMerchants.includes(c.merchant)}
              onChange={(e) =>
                setScenario({
                  ...scenario,
                  omitMerchants: e.target.checked
                    ? [...scenario.omitMerchants, c.merchant]
                    : scenario.omitMerchants.filter((m) => m !== c.merchant),
                })
              }
            />{" "}
            Explore stopping {c.merchant} ({formatMoney(c.monthlyAmount)}/month)
          </label>
        ))}
      <div className="actions">
        <Button variant="outline" size="sm" onClick={onExplain}>
          Ask about this scenario
        </Button>
        <Button size="sm" disabled={alt.discretionary === null} onClick={onSave}>
          Approve & save scenario
        </Button>
      </div>
      <details>
        <summary>Calculation & assumptions</summary>
        <dl className="calculation">
          <dt>Expected income</dt>
          <dd>{alt.income === null ? "Unknown" : formatMoney(alt.income)}</dd>
          <dt>Essential expenses</dt>
          <dd>{alt.essentials === null ? "Unknown" : formatMoney(alt.essentials)}</dd>
          <dt>Confirmed recurring payments</dt>
          <dd>{formatMoney(alt.recurring)}</dd>
          <dt>Other obligations</dt>
          <dd>{alt.otherObligations === null ? "Unknown" : formatMoney(alt.otherObligations)}</dd>
          <dt>Planned savings</dt>
          <dd>{alt.savings === null ? "Unknown" : formatMoney(alt.savings)}</dd>
          <dt>Monthly shortfall</dt>
          <dd>{alt.shortfall === null ? "Unknown" : formatMoney(alt.shortfall)}</dd>
        </dl>
        <ul className="helper">
          {alt.assumptions.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
        <p className="helper">
          Starting balance:{" "}
          {alt.openingBalance === null
            ? "unknown; the chart shows cumulative change, not an account balance."
            : formatMoney(alt.openingBalance)}{" "}
          No subscriptions are canceled here.
        </p>
      </details>
    </section>
  );
}
