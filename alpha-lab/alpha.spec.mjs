import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test("find a source-linked study and read evidence in two actions", async ({ page }) => {
  await expect(page.getByRole("heading", { name: /Pick up the research/ })).toBeVisible();
  await page.getByRole("button", { name: /Sharp-anchored MLB pricing has no qualified edge/ }).click();
  await expect(page.getByRole("heading", { name: /Sharp-anchored MLB pricing/ })).toBeVisible();
  await expect(page.getByText(/no executable, post-fee, out-of-sample strategy/i)).toBeVisible();
  await expect(page.getByRole("link", { name: /MLB Alpha full-market research/ })).toHaveAttribute("href", "https://github.com/chmoses98/edge-finder-api/pull/305");
  await expect(page.getByText(/What we cannot claim/i)).toBeVisible();
});

test("one search narrows the work queue without hiding qualifications", async ({ page }) => {
  await page.getByLabel("Find a question or finding").fill("pregame information clock");
  await expect(page.getByRole("button", { name: /Verify the pregame information clock/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Our NBA market baseline/ })).toHaveCount(0);
  await expect(page.getByText(/Before the clock change/)).toBeVisible();
});

test("new question, checklist and note survive reload", async ({ page }) => {
  await page.getByRole("button", { name: /New question/ }).click();
  await page.getByPlaceholder("Example: Do lineup changes create a short pricing delay?").fill("Do late scratches predict a price correction?");
  await page.getByRole("button", { name: "Save research question" }).click();
  await expect(page.getByRole("heading", { name: "Do late scratches predict a price correction?" })).toBeVisible();
  await page.getByRole("checkbox", { name: /Define a falsifiable hypothesis/ }).check();
  await page.getByLabel("YOUR WORKING NOTES").fill("Require a timestamped pregame baseline.");
  await page.reload();
  await page.getByRole("button", { name: /Do late scratches predict a price correction/ }).click();
  await expect(page.getByRole("checkbox", { name: /Define a falsifiable hypothesis/ })).toBeChecked();
  await expect(page.getByLabel("YOUR WORKING NOTES")).toHaveValue("Require a timestamped pregame baseline.");
});

test("mobile and desktop never require sideways scrolling", async ({ page }) => {
  const sizes = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, view: window.innerWidth }));
  expect(sizes.scroll).toBeLessThanOrEqual(sizes.view);
  await expect(page.getByRole("button", { name: "Export" })).toBeVisible();
});
