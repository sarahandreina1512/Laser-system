import { expect, type APIRequestContext, type Page } from "@playwright/test";

export async function login(page: Page, user: string, pass: string) {
  await page.goto("/login");
  await page.getByPlaceholder("Usuario").fill(user);
  await page.getByPlaceholder("Contraseña").fill(pass);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await expect(page).not.toHaveURL(/login/);
}

export async function apiToken(request: APIRequestContext, user = "admin", pass = "admin1234") {
  const r = await request.post("/api/auth/login", { form: { username: user, password: pass } });
  return { Authorization: `Bearer ${(await r.json()).access_token}` };
}

/** ISO local (sin zona) para `daysAhead` días a partir de hoy a la hora dada. */
export function at(daysAhead: number, hour: number) {
  const d = new Date(); d.setDate(d.getDate() + daysAhead); d.setHours(hour, 0, 0, 0);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:00:00`;
}
