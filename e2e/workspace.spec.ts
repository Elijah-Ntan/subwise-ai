import { test, expect } from "@playwright/test";
test("synthetic investigation, confirmations, scenario and approved memory", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Your money has a future." })).toBeVisible();
  await page.getByRole("button", { name: "Student sample" }).click();
  await expect(page.getByText("15 transactions ready")).toBeVisible();
  await page.getByLabel("Expected monthly income", { exact: true }).fill("80000");
  await page.getByLabel("Monthly essentials", { exact: true }).fill("35000");
  await page.getByLabel("Monthly savings target", { exact: true }).fill("20000");
  await page.getByLabel("Other monthly obligations", { exact: true }).fill("0");
  await page.getByRole("button", { name: "Confirm these assumptions" }).click();
  await page.getByLabel("Review netflix", { exact: true }).selectOption("confirmed");
  await page.getByLabel("Review campus rent", { exact: true }).selectOption("essential");
  await page.getByLabel("Review spotify", { exact: true }).selectOption("not-recurring");
  await page.getByLabel("Review groceries", { exact: true }).selectOption("not-recurring");
  await expect(page.locator(".metrics")).toContainText("₦3,000.00");
  await page.getByLabel("Explore stopping netflix", { exact: false }).check();
  await expect(page.locator(".metrics")).toContainText("₦10,000.00");
  await page.getByRole("button", { name: "Approve & save scenario" }).click();
  await expect(page.getByText("1 plans", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText("1 plans", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Review campus rent", { exact: true })).toHaveValue("essential");
  await page.getByLabel("Preference to remember").fill("Keep internet for my coursework");
  await page.getByRole("button", { name: "Confirm preference", exact: true }).click();
  await page.getByRole("button", { name: "Save memory in this browser" }).click();
  await page.reload();
  await expect(page.getByText("Keep internet for my coursework", { exact: true })).toBeVisible();
  await page.screenshot({ path: "test-results/workspace-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator("body")).toHaveJSProperty("scrollWidth", 390);
  await page.screenshot({ path: "test-results/workspace-mobile.png", fullPage: true });
});
test("invalid CSV reports an error without replacing current data", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Freelancer sample" }).click();
  await page
    .locator('input[type="file"]')
    .setInputFiles({
      name: "invalid.csv",
      mimeType: "text/csv",
      buffer: Buffer.from("date,value\n2026-10-23,500"),
    });
  await expect(page.locator(".banner.error")).toContainText("Required columns");
  await expect(page.getByText("12 transactions ready")).toBeVisible();
});
test("memory endpoints deny unauthenticated access", async ({ request }) => {
  expect((await request.get("/api/memory")).status()).toBe(401);
  expect((await request.put("/api/memory", { data: { approved: true, state: {} } })).status()).toBe(
    401,
  );
  expect((await request.delete("/api/memory")).status()).toBe(401);
});
