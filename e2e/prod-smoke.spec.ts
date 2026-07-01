import { test, expect } from "@playwright/test";

/**
 * Live end-to-end smoke against a deployed ReviewOps Agent instance.
 * Default target: production (see playwright.config.ts / E2E_BASE_URL).
 *
 * NOTE: the questionnaire-generation test WRITES a draft to the target DB. When
 * run against the demo/production DB, re-seed afterwards (`npm run seed` with the
 * Turso env) to restore a pristine demo state.
 */

// The manager's own card shows exactly "Maria"; report cards only mention her as
// "reports to Maria", so an exact-text filter uniquely selects the login button.
async function loginAsMaria(page: import("@playwright/test").Page) {
  await page.goto("/login");
  const mariaCard = page
    .locator(".card")
    .filter({ has: page.getByText("Maria", { exact: true }) });
  await mariaCard.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL("**/manager");
}

test.describe("ReviewOps Agent — live smoke", () => {
  test("permission scope: Maria sees her reports, not another team's", async ({
    page,
  }) => {
    await loginAsMaria(page);
    // Her direct reports are listed on the dashboard…
    await expect(page.getByText("Anna").first()).toBeVisible();
    await expect(page.getByText("Mark").first()).toBeVisible();
    await expect(page.getByText("Julia").first()).toBeVisible();
    // …Olek reports to Nora and must not appear anywhere for Maria.
    await expect(page.getByText("Olek")).toHaveCount(0);
  });

  test("full stack: generate a questionnaire via the live agent", async ({
    page,
  }) => {
    await loginAsMaria(page);
    await page.goto("/manager/questionnaires/new");

    await page
      .locator("form input")
      .first()
      .fill("E2E smoke: Q2 collaboration & mentoring evidence");

    await page.getByRole("button", { name: /Generate questions/ }).click();

    // The browser calls Vercel → Cloud Run agent → Gemini, safety-checks the
    // result, persists it, then redirects to the preview page.
    await page.waitForURL("**/preview", { timeout: 60_000 });
    // The preview renders a "Questions (N)" section and the generated questions.
    await expect(
      page.getByRole("heading", { name: /Questions \(\d+\)/ }),
    ).toBeVisible();
    await expect(page.locator("ol li").first()).toBeVisible();
  });
});
