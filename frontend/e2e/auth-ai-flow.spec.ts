import { expect, test, type Page } from "@playwright/test";

async function selectEditorText(page: Page) {
  const editor = page.locator('[contenteditable="true"]').first();
  await editor.click();
  await editor.evaluate((element) => {
    const root = element.firstChild;
    if (!root || !root.textContent) {
      return;
    }

    const range = document.createRange();
    range.setStart(root, 0);
    range.setEnd(root, Math.min(root.textContent.length, 14));

    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
  });
}

test("login through AI suggestion acceptance", async ({ page }) => {
  await page.goto("/login");

  await page.getByPlaceholder("Email address").fill("owner@example.com");
  await page.getByPlaceholder("Password").fill("Password123!");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(/\/$/);
  await page.getByPlaceholder("Untitled document").fill("Playwright AI flow");
  await page.getByPlaceholder("Start with a note, paragraph, or meeting summary.").fill(
    "This draft explains the weekly status update for the product team.",
  );
  await page.getByRole("button", { name: "Create and open" }).click();

  await expect(page).toHaveURL(/\/documents\/\d+/);
  await selectEditorText(page);

  await page.getByRole("button", { name: "Open AI assistant" }).click();
  await page.getByRole("button", { name: "Generate suggestion" }).click();

  const suggestion = page.getByPlaceholder("AI suggestions will appear here.");
  await expect(suggestion).not.toHaveValue("");

  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page.getByText("Accepted")).toBeVisible();
  await expect(page.locator('[contenteditable="true"]').first()).toContainText("status");
});
