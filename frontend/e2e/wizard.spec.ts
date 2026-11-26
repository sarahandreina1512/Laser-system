import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("asistente de 4 pasos: crea una cita con 2 zonas y redirige al calendario", async ({ page }) => {
  await login(page, "admin", "admin1234");
  await page.goto("/citas");
  await page.getByRole("button", { name: /María Gómez/ }).click();
  await page.getByRole("button", { name: "Continuar" }).click();

  await page.locator("button:not([disabled])").filter({ hasText: /^\d{1,2}$/ }).first().click(); // primer día disponible
  await page.locator("button").filter({ hasText: /^\d{2}:\d{2}$/ }).first().click();
  await page.getByRole("button", { name: "Continuar" }).click();

  await page.getByRole("button", { name: /Axilas/ }).click();
  await page.getByRole("button", { name: /Piernas/ }).click();
  await expect(page.getByText("60 min")).toBeVisible();   // 15 + 45
  await expect(page.getByText("$80.00")).toBeVisible();
  await expect(page.getByText(/Bs\. 3\.240,00|Bs\. 3,240\.00/)).toBeVisible(); // 80 × 40,5
  await page.getByRole("button", { name: "Continuar" }).click();

  await page.getByRole("button", { name: "Confirmar cita" }).click();
  await expect(page.getByText("Cita confirmada")).toBeVisible();
  await expect(page).toHaveURL(/\/calendario/);
});
