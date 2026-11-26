import { expect, test } from "@playwright/test";
import { apiToken, at, login } from "./helpers";

const book = (client_id: number, start_at: string) => ({ client_id, start_at, zone_ids: [1] });

test("2 cubículos y 2 trabajadores permiten 2 citas simultáneas, nunca 3", async ({ request }) => {
  const h = await apiToken(request);
  const c3 = await (await request.post("/api/clients", { headers: h, data: { full_name: "Tercera Cliente", national_id: "V11112222", phone: "04120000000" } })).json();
  const t = at(5, 10);
  expect((await request.post("/api/appointments", { headers: h, data: book(1, t) })).status()).toBe(201);
  expect((await request.post("/api/appointments", { headers: h, data: book(2, t) })).status()).toBe(201);
  const third = await request.post("/api/appointments", { headers: h, data: book(c3.id, t) });
  expect(third.status()).toBe(409);
  expect((await third.json()).detail.code).toBe("slot_unavailable");
});

test("la agenda se actualiza en vivo, sin recargar la página", async ({ page, request }) => {
  await login(page, "admin", "admin1234");
  await page.goto("/calendario");
  await page.getByRole("button", { name: "Día", exact: true }).click();
  for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "Siguiente" }).click(); // hoy + 3
  await expect(page.getByText("No hay citas este día.")).toBeVisible();

  const h = await apiToken(request);
  expect((await request.post("/api/appointments", { headers: h, data: book(2, at(3, 11)) })).status()).toBe(201);
  await expect(page.getByText("Carla Díaz")).toBeVisible({ timeout: 5_000 }); // llega por WebSocket
});
