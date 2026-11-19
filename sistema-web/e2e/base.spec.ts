import { expect, test, type Page, type Route } from "@playwright/test";

type MockProfile = {
  id: string;
  first_names: string;
  last_names: string;
  email: string;
  institution: string | null;
  ugel: string | null;
  region: string | null;
  status: "pending" | "active" | "suspended";
  role: "teacher" | "admin";
};

const USER_ID = "00000000-0000-4000-8000-000000000001";
const EMAIL = "maria@example.com";

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

/** Mocks the only Supabase surface the app uses: auth (sign-up, password login, user) and `profiles`. */
async function mockSupabase(page: Page) {
  const user = {
    id: USER_ID,
    aud: "authenticated",
    role: "authenticated",
    email: EMAIL,
    app_metadata: {},
    user_metadata: {},
    created_at: "2026-01-01T00:00:00Z",
  };
  const state: { profile: MockProfile | null } = { profile: null };

  await page.route("**/auth/v1/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/signup")) {
      const body = route.request().postDataJSON() as { data?: Record<string, string> };
      const meta = body.data ?? {};
      state.profile = {
        id: USER_ID,
        first_names: meta.first_names ?? "",
        last_names: meta.last_names ?? "",
        email: EMAIL,
        institution: meta.institution ?? null,
        ugel: meta.ugel ?? null,
        region: meta.region ?? null,
        status: "pending",
        role: "teacher",
      };
      // Email confirmation is on: no session is returned.
      return json(route, user);
    }
    if (url.pathname.endsWith("/token")) {
      return json(route, {
        access_token: "test-access-token",
        refresh_token: "test-refresh-token",
        token_type: "bearer",
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        user,
      });
    }
    if (url.pathname.endsWith("/user")) return json(route, user);
    return json(route, {});
  });

  await page.route("**/rest/v1/profiles**", async (route) => {
    const request = route.request();
    if (request.method() === "PATCH" && state.profile) {
      state.profile = { ...state.profile, ...(request.postDataJSON() as Partial<MockProfile>) };
    }
    return json(route, state.profile);
  });

  return state;
}

/** Real FsAccessStorage code path, backed by OPFS instead of a native folder picker. */
async function mockFolderPicker(page: Page) {
  await page.addInitScript(() => {
    const proto = FileSystemDirectoryHandle.prototype as unknown as Record<string, unknown>;
    proto.queryPermission = async () => "granted";
    proto.requestPermission = async () => "granted";
    window.showDirectoryPicker = async () => {
      const root = await navigator.storage.getDirectory();
      return root.getDirectoryHandle("Cuaderno de Campo", { create: true });
    };
  });
}

test("registro, aprobación, carpeta, perfil, aula y niña persisten tras recargar", async ({ page }) => {
  const profile = await mockSupabase(page);
  await mockFolderPicker(page);

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
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("Perfil guardado.")).toBeVisible();

  // Crear aula Girasoles, ciclo II, 4 años
  await page.goto("/aulas/");
  await page.getByLabel("Nombre del aula").fill("Girasoles");
  await page.getByLabel("Ciclo").selectOption("II");
  await page.getByLabel("4 años").check();
  await page.getByRole("button", { name: "Crear aula" }).click();
  await expect(page.getByText("Girasoles").first()).toBeVisible();

  // Agregar a Valentina Quispe
  await page.goto("/ninos/");
  await page.getByLabel("Nombres").fill("Valentina");
  await page.getByLabel("Apellidos").fill("Quispe");
  await page.getByRole("button", { name: "Agregar niño" }).click();
  const student = page.getByRole("link", { name: "Quispe, Valentina" });
  await expect(student).toBeVisible();

  // Recargar: los datos siguen en la carpeta
  await page.reload();
  await expect(page.getByRole("link", { name: "Quispe, Valentina" })).toBeVisible();

  // Una docente no accede al panel de administración
  await page.goto("/admin/");
  await expect(page.getByText("No tienes acceso a esta sección.")).toBeVisible();
});
