import { adjustmentSchema, type Adjustment, type Workspace } from "./contracts";

export function toMinor(value: string): number {
  const clean = value.trim().replace(/,/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(clean))
    throw new Error("Use a positive amount with at most two decimal places.");
  const [whole, fraction = ""] = clean.split(".");
  const amount = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(amount) || amount > 100_000_000_000)
    throw new Error("Amount is too large.");
  return amount;
}
export const formatMoney = (value: number) =>
  new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 2,
  }).format(value / 100);
export const baseline: Adjustment = {
  label: "Current plan",
  income: null,
  savings: null,
  essentials: null,
  omitMerchants: [],
  months: 6,
};

export function forecast(workspace: Workspace, raw: Adjustment = baseline) {
  const a = adjustmentSchema.parse(raw);
  const p = workspace.profile;
  for (const merchant of a.omitMerchants) {
    const c = workspace.commitments.find((c) => c.merchant === merchant);
    if (!c || c.status !== "confirmed")
      throw new Error("Only confirmed, non-essential commitments can be removed from a scenario.");
  }
  const income = a.income ?? p.income;
  const essentials = a.essentials ?? p.essentials;
  const savings = a.savings ?? p.savings;
  const recurring = workspace.commitments
    .filter((c) => c.status !== "not-recurring" && !a.omitMerchants.includes(c.merchant))
    .reduce((sum, c) => sum + c.monthlyAmount, 0);
  const missing = [
    income === null && "Expected monthly income",
    essentials === null && "Essential expenses excluding confirmed commitments",
    savings === null && "Monthly savings contribution",
    p.otherObligations === null && "Other monthly obligations",
  ].filter((s): s is string => Boolean(s));
  const available = missing.length ? null : income! - essentials! - recurring - p.otherObligations!;
  const discretionary = available === null ? null : available - savings!;
  return {
    label: a.label,
    months: a.months,
    income,
    essentials,
    recurring,
    savings,
    otherObligations: p.otherObligations,
    available,
    discretionary,
    shortfall: discretionary === null ? null : Math.max(0, -discretionary),
    missing,
    openingBalance: p.openingBalance,
    points: Array.from({ length: a.months }, (_, i) => ({
      month: i + 1,
      cumulativeSurplus: discretionary === null ? null : discretionary * (i + 1),
      projectedBalance:
        discretionary === null || p.openingBalance === null
          ? null
          : p.openingBalance + discretionary * (i + 1),
      plannedSavings: savings === null ? null : savings * (i + 1),
    })),
    assumptions: [
      "Monthly cash-flow estimate, not a dated payment schedule.",
      "Essentials and other obligations exclude separately confirmed commitments.",
      "Historical debits are evidence only; they are not added again to forecast expenses.",
      "Unconfirmed recurring candidates are excluded; review them before relying on the forecast.",
      ...(p.irregularIncome
        ? ["Income is irregular; the entered amount is a scenario, not guaranteed income."]
        : []),
    ],
  };
}
export type Forecast = ReturnType<typeof forecast>;
