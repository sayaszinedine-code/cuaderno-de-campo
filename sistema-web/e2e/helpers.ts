import { expect, type Page, type Route } from "@playwright/test";

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

export const USER_ID = "00000000-0000-4000-8000-000000000001";
export const EMAIL = "maria@example.com";
/** A second, already approved teacher using the same browser profile. */
export const OTHER_ID = "00000000-0000-4000-8000-000000000002";
export const OTHER_EMAIL = "rosa@example.com";

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

const authUser = (id: string, email: string) => ({
  id,
  aud: "authenticated",
  role: "authenticated",
  email,
  app_metadata: {},
  user_metadata: {},
  created_at: "2026-01-01T00:00:00Z",
});

/** Mocks the only Supabase surface the app uses: auth (sign-up, password login, user, logout) and `profiles`. */
export async function mockSupabase(page: Page) {
  const users = { [EMAIL]: authUser(USER_ID, EMAIL), [OTHER_EMAIL]: authUser(OTHER_ID, OTHER_EMAIL) };
  const other: MockProfile = {
    id: OTHER_ID,
    first_names: "Rosa",
    last_names: "Quispe",
    email: OTHER_EMAIL,
    institution: null,
    ugel: null,
    region: null,
    status: "active",
    role: "teacher",
  };
  const state: { profile: MockProfile | null; current: keyof typeof users } = { profile: null, current: EMAIL };
  const currentProfile = () => (state.current === EMAIL ? state.profile : other);

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
      return json(route, users[EMAIL]);
    }
    if (url.pathname.endsWith("/token")) {
      const { email } = route.request().postDataJSON() as { email: string };
      if (!(email in users)) return json(route, { code: "invalid_credentials" }, 400);
      state.current = email as keyof typeof users;
      const user = users[state.current];
      return json(route, {
        access_token: "test-access-token",
        refresh_token: "test-refresh-token",
        token_type: "bearer",
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        user,
      });
    }
    if (url.pathname.endsWith("/user")) return json(route, users[state.current]);
    if (url.pathname.endsWith("/logout")) return route.fulfill({ status: 204 });
    return json(route, {});
  });

  await page.route("**/rest/v1/profiles**", async (route) => {
    const request = route.request();
    if (request.method() === "PATCH" && state.current === EMAIL && state.profile) {
      state.profile = { ...state.profile, ...(request.postDataJSON() as Partial<MockProfile>) };
    }
    return json(route, currentProfile());
  });

  return state;
}

/** Real FsAccessStorage code path, backed by OPFS instead of a native folder picker. */
export async function useOpfsFolder(page: Page) {
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

/** Registers, gets approved, logs in and picks the (OPFS-backed) folder. Ends on the folder screen. */
export async function signUpActiveTeacher(page: Page, profile: Awaited<ReturnType<typeof mockSupabase>>) {
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
  if (!profile.profile) throw new Error("profile was not created by sign-up");
  profile.profile.status = "active";
  await page.goto("/login/");
  await page.getByLabel("Correo electrónico").fill(EMAIL);
  await page.getByLabel("Contraseña").fill("clave-segura-1");
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page.getByRole("heading", { name: "Elige dónde guardar tu cuaderno" })).toBeVisible();
  await page.getByRole("button", { name: "Elegir carpeta" }).click();
  await expect(page.getByRole("heading", { name: "Mi carpeta" })).toBeVisible();
}

/** Creates the «Girasoles» classroom (cycle II, 4 years) and the student «Valentina Quispe». */
export async function createClassroomAndStudent(page: Page) {
  await page.goto("/aulas/");
  await page.getByLabel("Nombre del aula").fill("Girasoles");
  await page.getByLabel("Ciclo").selectOption("II");
  await page.getByLabel("4 años").check();
  await page.getByRole("button", { name: "Crear aula" }).click();
  await expect(page.getByText("Girasoles").first()).toBeVisible();

  await page.goto("/ninos/");
  await page.getByLabel("Nombres").fill("Valentina");
  await page.getByLabel("Apellidos").fill("Quispe");
  await page.getByRole("button", { name: "Agregar niño" }).click();
  await expect(page.getByRole("link", { name: "Quispe, Valentina" })).toBeVisible();
}

/** Creates a field note for «Valentina Quispe» on `date` (YYYY-MM-DD) under the given Matemática competency. */
export async function createNote(page: Page, opts: { date: string; text: string; competency: string }) {
  await page.goto("/cuaderno/registro/");
  await expect(page.getByRole("heading", { name: "Nuevo registro" })).toBeVisible();
  await page.getByRole("button", { name: "Valentina Quispe" }).click();
  await page.getByText("Cambiar", { exact: true }).click(); // date, aula and moment are folded behind «Cambiar»
  await page.getByLabel("Fecha").fill(opts.date);
  await page.getByLabel("¿Qué hizo o dijo? Describe los hechos").fill(opts.text);
  await page.getByLabel(/^Área/).selectOption({ label: "Matemática" });
  await page.getByLabel(/^Competencia/).selectOption({ label: opts.competency });
  await page.getByRole("group", { name: "Desempeños" }).getByRole("checkbox").first().check();
  await page.getByLabel("Interpretación en relación al desempeño").fill("Clasifica según un criterio.");
  await page.getByLabel("Reflexión docente en relación a la actividad").fill("Repetir con material variado.");
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(page).toHaveURL(/\/cuaderno\/$/);
  await expect(page.getByRole("article").filter({ hasText: opts.text })).toBeVisible();
}
