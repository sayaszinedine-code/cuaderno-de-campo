import { expect, test } from "@playwright/test";
import { createClassroomAndStudent, EMAIL, mockSupabase, OTHER_EMAIL, useOpfsFolder } from "./helpers";

test("registro, aprobación, carpeta, perfil, aula y niña persisten tras recargar; otra docente no ve esos datos", async ({
  page,
}) => {
  const profile = await mockSupabase(page);
  await useOpfsFolder(page);

  // Registro
  await page.goto("/registro/");
  await page.getByLabel("Nombres").fill("María");
  await page.getByLabel("Apellidos").fill("Pérez");
  await page.getByLabel("Correo electrónico").fill(EMAIL);
  await page.getByLabel("Contraseña (mínimo 8 caracteres)").fill("clave-segura-1");
  await page.getByLabel("Institución educativa").fill("IEI 123");
  await page.getByLabel("UGEL").fill("UGEL 01");
  await page.getByLabel("Región").selectOption({ index: 1 });
  await page.getByLabel("Acepto la política de privacidad").check();
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await expect(page.getByRole("status")).toContainText("Revisa tu correo");
  expect(profile.profile?.status).toBe("pending");

  // Login: cuenta en revisión
  await page.goto("/login/");
  await page.getByLabel("Correo electrónico").fill(EMAIL);
  await page.getByLabel("Contraseña").fill("clave-segura-1");
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page.getByText("Tu cuenta está en revisión")).toBeVisible();

  // El administrador aprueba
  if (!profile.profile) throw new Error("profile was not created by sign-up");
  profile.profile.status = "active";
  await page.reload();

  // Elegir carpeta
  await expect(page.getByRole("heading", { name: "Elige dónde guardar tu cuaderno" })).toBeVisible();
  await page.getByRole("button", { name: "Elegir carpeta" }).click();
  await expect(page.getByRole("heading", { name: "Mi carpeta" })).toBeVisible();

  // Completar perfil
  await page.getByRole("link", { name: "Perfil" }).first().click();
  await expect(page.getByRole("heading", { name: "Mi perfil" })).toBeVisible();
  await page.getByLabel("Teléfono").fill("987654321");
  await page.getByLabel("Domicilio").fill("Av. Los Pinos 123");
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(page.getByText("Perfil guardado.")).toBeVisible();

  // Crear aula Girasoles (ciclo II, 4 años) y agregar a Valentina Quispe
  await createClassroomAndStudent(page);

  // Recargar: los datos siguen en la carpeta
  await page.reload();
  await expect(page.getByRole("link", { name: "Quispe, Valentina" })).toBeVisible();

  // Una docente no accede al panel de administración
  await page.goto("/admin/");
  await expect(page.getByText("No tienes acceso a esta sección.")).toBeVisible();

  // Cerrar sesión desde «Mi cuenta»
  await page.goto("/inicio/");
  await page.getByRole("navigation", { name: "Principal", exact: true }).getByRole("link", { name: "Mi cuenta" }).click();
  await page.getByRole("button", { name: "Cerrar sesión" }).click();
  await expect(page).toHaveURL(/\/login\/$/);

  // Otra docente en el mismo navegador: debe elegir su propia carpeta
  await page.getByLabel("Correo electrónico").fill(OTHER_EMAIL);
  await page.getByLabel("Contraseña").fill("otra-clave-1");
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page.getByRole("heading", { name: "Elige dónde guardar tu cuaderno" })).toBeVisible();
});
