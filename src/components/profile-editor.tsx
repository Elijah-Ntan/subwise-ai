"use client";
import { useState } from "react";
import { profileSchema, type Workspace } from "@/lib/contracts";
import { toMinor } from "@/lib/finance";
import { Button } from "./ui/button";
const fields = [
  ["income", "Expected monthly income"],
  ["essentials", "Monthly essentials"],
  ["savings", "Monthly savings target"],
  ["otherObligations", "Other monthly obligations"],
  ["openingBalance", "Available starting balance"],
] as const;
export function ProfileEditor({
  profile,
  onApply,
}: {
  profile: Workspace["profile"];
  onApply: (p: Workspace["profile"]) => void;
}) {
  const [error, setError] = useState("");
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        setError("");
        try {
          const form = new FormData(event.currentTarget);
          const amounts = Object.fromEntries(
            fields.map(([key]) => {
              const value = String(form.get(key) ?? "").trim();
              return [key, value ? toMinor(value) : null];
            }),
          );
          onApply(
            profileSchema.parse({
              ...amounts,
              goal: form.get("goal"),
              irregularIncome: form.get("irregularIncome") === "on",
            }),
          );
        } catch (e) {
          setError(e instanceof Error ? e.message : "Check your amounts.");
        }
      }}
    >
      <p className="helper">
        Amounts in naira. Leave unknowns blank. Essentials and other obligations must exclude the
        recurring payments you confirm below.
      </p>
      <div className="form-grid">
        {fields.map(([key, label]) => (
          <label key={key}>
            {label}
            <div className="money-input">
              <span>₦</span>
              <input
                name={key}
                aria-label={label}
                inputMode="decimal"
                placeholder="Unknown"
                defaultValue={profile[key] === null ? "" : profile[key] / 100}
              />
            </div>
          </label>
        ))}
      </div>
      <label>
        What are you working towards?
        <input
          name="goal"
          maxLength={500}
          defaultValue={profile.goal}
          placeholder="A laptop, rent, or a little breathing room"
        />
      </label>
      <label className="check">
        <input type="checkbox" name="irregularIncome" defaultChecked={profile.irregularIncome} /> My
        income changes from month to month
      </label>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <Button type="submit" size="sm">
        Confirm these assumptions
      </Button>
    </form>
  );
}
