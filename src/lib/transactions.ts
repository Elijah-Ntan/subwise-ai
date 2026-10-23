import Papa from "papaparse";
import { transactionSchema, type Transaction } from "./contracts";
import { toMinor } from "./finance";

export function normalizeMerchant(description: string): string {
  return (
    description
      .toLowerCase()
      .replace(/\b(pos|web|payment|purchase|debit|ng|nigeria)\b/g, " ")
      .replace(/[^a-z\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 100) || "unidentified merchant"
  );
}
export function parseCsv(csv: string): Transaction[] {
  if (new TextEncoder().encode(csv).length > 256_000) throw new Error("CSV exceeds 256 KB.");
  const result = Papa.parse<Record<string, string>>(csv, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim().toLowerCase(),
  });
  if (result.errors.length) throw new Error(`CSV error: ${result.errors[0].message}`);
  const columns = ["id", "date", "description", "amount", "direction"];
  if (columns.some((c) => !result.meta.fields?.includes(c)))
    throw new Error(`Required columns: ${columns.join(", ")}`);
  if (!result.data.length || result.data.length > 500)
    throw new Error("Upload between 1 and 500 transactions.");
  const ids = new Set<string>();
  return result.data.map((row, index) => {
    const date = row.date?.trim();
    const parsed = new Date(`${date}T00:00:00Z`);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !Number.isFinite(parsed.valueOf()) ||
      parsed.toISOString().slice(0, 10) !== date
    )
      throw new Error(`Row ${index + 2}: invalid date.`);
    const tx = transactionSchema.parse({
      id: row.id.trim(),
      date,
      description: row.description.trim(),
      merchant: normalizeMerchant(row.description),
      amount: toMinor(row.amount),
      direction: row.direction.trim().toLowerCase(),
    });
    if (ids.has(tx.id)) throw new Error(`Duplicate transaction ID: ${tx.id}`);
    ids.add(tx.id);
    return tx;
  });
}
export function analyzeTransactions(transactions: Transaction[]) {
  const grouped = new Map<string, Transaction[]>();
  for (const t of transactions.filter((t) => t.direction === "debit"))
    grouped.set(t.merchant, [...(grouped.get(t.merchant) ?? []), t]);
  const candidates = [];
  const duplicates: { transactionIds: string[]; reason: string }[] = [];
  for (const [merchant, items] of grouped) {
    const sorted = [...items].sort((a, b) => a.date.localeCompare(b.date));
    const uniqueDates = [...new Set(sorted.map((t) => t.date))];
    const intervals = uniqueDates
      .slice(1)
      .map((d, i) => (Date.parse(d) - Date.parse(uniqueDates[i])) / 86400000);
    const monthly = intervals.length > 0 && intervals.every((d) => d >= 25 && d <= 35);
    if (monthly)
      candidates.push({
        merchant,
        monthlyAmount: sorted.at(-1)!.amount,
        transactionIds: sorted.map((t) => t.id),
        frequency: "approximately monthly",
        classification: "unconfirmed recurring payment",
        uncertainty: "Repetition does not establish a subscription, necessity, or usage.",
        increased: sorted.at(-1)!.amount > sorted[0].amount,
      });
    const sameDay = new Map<string, string[]>();
    for (const t of sorted) {
      const key = `${t.date}:${t.amount}`;
      sameDay.set(key, [...(sameDay.get(key) ?? []), t.id]);
    }
    for (const ids of sameDay.values())
      if (ids.length > 1)
        duplicates.push({
          transactionIds: ids,
          reason: "Same merchant, date and amount; review, do not automatically delete.",
        });
  }
  return {
    candidates,
    duplicates,
    period: transactions.length
      ? {
          from: [...transactions].sort((a, b) => a.date.localeCompare(b.date))[0].date,
          to: [...transactions].sort((a, b) => b.date.localeCompare(a.date))[0].date,
        }
      : null,
  };
}
