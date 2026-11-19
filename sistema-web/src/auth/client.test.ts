import { beforeEach, describe, expect, it, vi } from "vitest";

const { auth, single, maybeSingle, eq, select, update, from, createClient } = vi.hoisted(() => {
  const auth = {
    signUp: vi.fn(),
    signInWithPassword: vi.fn(),
    signOut: vi.fn(),
    resetPasswordForEmail: vi.fn(),
    getUser: vi.fn(),
  };
  const single = vi.fn();
  const maybeSingle = vi.fn();
  const eq = vi.fn(() => ({ maybeSingle, select: () => ({ single }) }));
  const select = vi.fn(() => ({ eq }));
  const update = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select, update }));
  const createClient = vi.fn(() => ({ auth, from }));
  return { auth, single, maybeSingle, eq, select, update, from, createClient };
});

vi.mock("@supabase/supabase-js", () => ({ createClient }));

async function load() {
  vi.resetModules();
  return import("./client");
}

const row = {
  id: "u1",
  first_names: "Ana",
  last_names: "Quispe",
  email: "a@example.com",
  institution: "IEI 123",
  ugel: "UGEL 01",
  region: "Lima",
  status: "pending",
  role: "teacher",
  created_at: "2026-11-19T00:00:00Z",
  status_changed_at: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
});

describe("getSupabase", () => {
  it("throws a clear Spanish error when env vars are missing", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    const { getSupabase } = await load();
    expect(() => getSupabase()).toThrow(/Falta configurar Supabase/);
  });

  it("creates the client lazily, once", async () => {
    const { getSupabase } = await load();
    expect(createClient).not.toHaveBeenCalled();
    getSupabase();
    getSupabase();
    expect(createClient).toHaveBeenCalledTimes(1);
    expect(createClient).toHaveBeenCalledWith("https://example.supabase.co", "anon-key");
  });
});

describe("signUp", () => {
  it("sends registration metadata and the login redirect", async () => {
    auth.signUp.mockResolvedValue({ data: {}, error: null });
    const { signUp } = await load();
    await signUp({
      email: "a@example.com",
      password: "secret-pass",
      firstNames: "Ana",
      lastNames: "Quispe",
      institution: "IEI 123",
      ugel: "UGEL 01",
      region: "Lima",
    });
    expect(auth.signUp).toHaveBeenCalledWith({
      email: "a@example.com",
      password: "secret-pass",
      options: {
        data: {
          first_names: "Ana",
          last_names: "Quispe",
          institution: "IEI 123",
          ugel: "UGEL 01",
          region: "Lima",
        },
        emailRedirectTo: `${window.location.origin}/login/`,
      },
    });
  });

  it("throws when Supabase returns an error", async () => {
    auth.signUp.mockResolvedValue({ data: {}, error: new Error("boom") });
    const { signUp } = await load();
    await expect(
      signUp({
        email: "a@example.com",
        password: "x",
        firstNames: "A",
        lastNames: "B",
        institution: "",
        ugel: "",
        region: "",
      }),
    ).rejects.toThrow("boom");
  });
});

describe("fetchOwnProfile", () => {
  it("returns null when there is no session", async () => {
    auth.getUser.mockResolvedValue({ data: { user: null }, error: null });
    const { fetchOwnProfile } = await load();
    expect(await fetchOwnProfile()).toBeNull();
    expect(from).not.toHaveBeenCalled();
  });

  it("maps the snake_case row to a Profile", async () => {
    auth.getUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    maybeSingle.mockResolvedValue({ data: row, error: null });
    const { fetchOwnProfile } = await load();
    expect(await fetchOwnProfile()).toEqual({
      id: "u1",
      firstNames: "Ana",
      lastNames: "Quispe",
      email: "a@example.com",
      institution: "IEI 123",
      ugel: "UGEL 01",
      region: "Lima",
      status: "pending",
      role: "teacher",
    });
    expect(from).toHaveBeenCalledWith("profiles");
    expect(select).toHaveBeenCalledWith(expect.not.stringContaining("*"));
    expect(eq).toHaveBeenCalledWith("id", "u1");
  });

  it("rejects a row with an unknown status", async () => {
    auth.getUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    maybeSingle.mockResolvedValue({ data: { ...row, status: "superuser" }, error: null });
    const { fetchOwnProfile } = await load();
    await expect(fetchOwnProfile()).rejects.toThrow();
  });
});

describe("updateOwnProfile", () => {
  it("only sends registration fields", async () => {
    auth.getUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    single.mockResolvedValue({ data: { ...row, institution: "IEI 456" }, error: null });
    const { updateOwnProfile } = await load();
    const patch = { institution: "IEI 456", status: "active", role: "admin" } as unknown as Parameters<
      typeof updateOwnProfile
    >[0];
    const result = await updateOwnProfile(patch);
    expect(update).toHaveBeenCalledWith({ institution: "IEI 456" });
    expect(eq).toHaveBeenCalledWith("id", "u1");
    expect(result.institution).toBe("IEI 456");
  });
});

describe("signIn / signOut / sendPasswordReset", () => {
  it("delegate to supabase auth", async () => {
    auth.signInWithPassword.mockResolvedValue({ data: {}, error: null });
    auth.signOut.mockResolvedValue({ error: null });
    auth.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null });
    const { signIn, signOut, sendPasswordReset } = await load();
    await signIn("a@example.com", "pw");
    await signOut();
    await sendPasswordReset("a@example.com");
    expect(auth.signInWithPassword).toHaveBeenCalledWith({ email: "a@example.com", password: "pw" });
    expect(auth.signOut).toHaveBeenCalled();
    expect(auth.resetPasswordForEmail).toHaveBeenCalledWith("a@example.com", {
      redirectTo: `${window.location.origin}/login/`,
    });
  });
});
