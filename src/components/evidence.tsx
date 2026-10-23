"use client";
import { analyzeTransactions } from "@/lib/transactions";
import { formatMoney } from "@/lib/finance";
import type { Workspace } from "@/lib/contracts";
export function Evidence({
  workspace,
  onChange,
}: {
  workspace: Workspace;
  onChange: (w: Workspace) => void;
}) {
  const analysis = analyzeTransactions(workspace.transactions);
  return (
    <section className="panel" id="evidence">
      <div className="section-heading">
        <div>
          <p className="eyebrow">THE EVIDENCE</p>
          <h2>Money X-ray</h2>
        </div>
        <span className="count">{workspace.transactions.length} transactions</span>
      </div>
      <p className="helper">
        Repeated payments found by transaction analysis. You decide which are ongoing commitments.
      </p>
      {!analysis.candidates.length && (
        <p className="empty-small">
          Load a statement to look for recurring payments. At least two monthly occurrences are
          needed.
        </p>
      )}
      {analysis.candidates.map((candidate) => {
        const saved = workspace.commitments.find((c) => c.merchant === candidate.merchant);
        return (
          <div className="evidence-row" key={candidate.merchant}>
            <div className="row-between">
              <strong className="merchant">{candidate.merchant}</strong>
              <strong>
                {formatMoney(saved?.monthlyAmount ?? candidate.monthlyAmount)}
                <small> / mo</small>
              </strong>
            </div>
            <p className="helper">
              {candidate.transactionIds.length} charges · {candidate.frequency}
              {candidate.increased ? " · latest amount increased" : ""}
            </p>
            <label className="sr-only" htmlFor={`status-${candidate.merchant}`}>
              Review {candidate.merchant}
            </label>
            <select
              id={`status-${candidate.merchant}`}
              value={saved?.status ?? "review"}
              onChange={(e) => {
                const rest = workspace.commitments.filter((c) => c.merchant !== candidate.merchant);
                onChange({
                  ...workspace,
                  commitments:
                    e.target.value === "review"
                      ? rest
                      : [
                          ...rest,
                          {
                            merchant: candidate.merchant,
                            monthlyAmount: candidate.monthlyAmount,
                            transactionIds: candidate.transactionIds,
                            status: e.target.value as "confirmed" | "essential" | "not-recurring",
                          },
                        ],
                });
              }}
            >
              <option value="review">Needs my review</option>
              <option value="confirmed">Confirm recurring payment</option>
              <option value="essential">Essential — keep this</option>
              <option value="not-recurring">Not a recurring commitment</option>
            </select>
            <details>
              <summary>See supporting transactions</summary>
              <ul className="evidence-list">
                {workspace.transactions
                  .filter((t) => candidate.transactionIds.includes(t.id))
                  .map((t) => (
                    <li key={t.id}>
                      <span>
                        {t.date} · {t.description}
                      </span>
                      <b>{formatMoney(t.amount)}</b>
                      <code>{t.id}</code>
                    </li>
                  ))}
              </ul>
            </details>
          </div>
        );
      })}
      {analysis.duplicates.map((d, i) => (
        <p className="notice" key={i}>
          Possible duplicate: {d.transactionIds.join(", ")}. {d.reason}
        </p>
      ))}
      {workspace.transactions.length > 0 && (
        <details>
          <summary>All transactions & corrections</summary>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Date / ID</th>
                  <th>Description / merchant</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                {workspace.transactions.map((t) => (
                  <tr key={t.id}>
                    <td>
                      {t.date}
                      <small>{t.id}</small>
                    </td>
                    <td>
                      {t.description}
                      <input
                        aria-label={`Merchant for ${t.id}`}
                        defaultValue={t.merchant}
                        maxLength={100}
                        onBlur={(e) => {
                          const merchant = e.target.value.trim().toLowerCase();
                          if (!merchant || merchant === t.merchant) return;
                          onChange({
                            ...workspace,
                            transactions: workspace.transactions.map((item) =>
                              item.id === t.id ? { ...item, merchant } : item,
                            ),
                            commitments: workspace.commitments.filter(
                              (c) => c.merchant !== t.merchant && c.merchant !== merchant,
                            ),
                          });
                        }}
                      />
                    </td>
                    <td>
                      {t.direction === "debit" ? "−" : "+"}
                      {formatMoney(t.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="helper">
            Editing a merchant clears affected confirmations. Review the resulting group again.
          </p>
        </details>
      )}
    </section>
  );
}
