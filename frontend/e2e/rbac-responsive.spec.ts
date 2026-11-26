import { expect, test } from "@playwright/test";
import { apiToken, login } from "./helpers";

test("admin aterriza en el Panel y ve los módulos de gestión", async ({ page }) => {
  await login(page, "admin", "admin1234");
  await expect(page).toHaveURL(/\/panel/);
  for (const n of ["Cubículos", "Trabajadores", "Configuración"]) await expect(page.getByRole("link", { name: n })).toBeVisible();
});

test("trabajador aterriza en Gestión del día; sin ítems de admin y con 403 en la API", async ({ page, request }) => {
  await login(page, "ana", "ana12345");
  await expect(page).toHaveURL(/\/dia/);
  await expect(page.getByRole("link", { name: "Cubículos" })).toHaveCount(0);
  await page.goto("/cubiculos");
  await expect(page).not.toHaveURL(/cubiculos/); // redirigido
  const h = await apiToken(request, "ana", "ana12345");
  for (const url of ["/api/cubicles", "/api/workers", "/api/settings"]) expect((await request.get(url, { headers: h })).status()).toBe(403);
});

test("responsive: sidebar fijo en escritorio y menú desplegable en móvil", async ({ page }) => {
  await login(page, "admin", "admin1234");
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(page.getByRole("link", { name: "Panel" })).toBeInViewport();
  await page.setViewportSize({ width: 768, height: 900 });
  await expect(page.getByRole("link", { name: "Panel" })).toBeInViewport();
  await page.setViewportSize({ width: 375, height: 700 });
  await expect(page.getByRole("link", { name: "Panel" })).not.toBeInViewport();
  await page.getByRole("button", { name: "Menú" }).click();
  await expect(page.getByRole("link", { name: "Panel" })).toBeInViewport();
});
