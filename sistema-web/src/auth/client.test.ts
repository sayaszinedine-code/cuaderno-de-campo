import { beforeEach, describe, expect, it, vi } from "vitest";

const { auth, single, maybeSingle, eq, select, update, from, createClient } = vi.hoisted(() => {
  const auth = {
    signUp: vi.fn(),
    signInWithPassword: vi.fn(),
    signOut: vi.fn(),
    resetPasswordForEmail: vi.fn(),
    getUser: vi.fn(),
    getSession: vi.fn(),
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

vi.mock("@supabase/supabase-js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@supabase/supabase-js")>()),
  createClient,
}));

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
  localStorage.clear();
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
    expect(createClient).toHaveBeenCalledWith("https://example.supabase.co", "anon-key", expect.anything());
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
      redirectTo: `${window.location.origin}/recuperar/`,
    });
  });
});

describe("sign-out and network handling", () => {
  it("signOut clears the offline account check, even if Supabase fails", async () => {
    localStorage.setItem(
      "account-check",
      JSON.stringify({ userId: "u1", status: "active", role: "teacher", checkedAt: "2026-11-19T00:00:00Z" }),
    );
    auth.signOut.mockResolvedValue({ error: new Error("offline") });
    const { signOut } = await load();
    await expect(signOut()).rejects.toThrow("offline");
    expect(localStorage.getItem("account-check")).toBeNull();
  });

  it("fetchOwnProfile throws NetworkError when getUser cannot reach the server", async () => {
    const { AuthRetryableFetchError } = await import("@supabase/supabase-js");
    auth.getUser.mockResolvedValue({
      data: { user: null },
      error: new AuthRetryableFetchError("Failed to fetch", 0),
    });
    const { fetchOwnProfile } = await load();
    const { NetworkError } = await import("./session");
    await expect(fetchOwnProfile()).rejects.toBeInstanceOf(NetworkError);
  });

  it("fetchOwnProfile returns null when the session is missing", async () => {
    const { AuthSessionMissingError } = await import("@supabase/supabase-js");
    auth.getUser.mockResolvedValue({ data: { user: null }, error: new AuthSessionMissingError() });
    const { fetchOwnProfile } = await load();
    expect(await fetchOwnProfile()).toBeNull();
  });

  it("fetchOwnProfile throws NetworkError when the profiles request fails in transport", async () => {
    auth.getUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    maybeSingle.mockResolvedValue({
      data: null,
      error: { message: "TypeError: Failed to fetch", details: "", hint: "", code: "" },
      status: 0,
    });
    const { fetchOwnProfile } = await load();
    const { NetworkError } = await import("./session");
    await expect(fetchOwnProfile()).rejects.toBeInstanceOf(NetworkError);
  });

  it("fetchOwnProfile throws NetworkError when fetch itself rejects", async () => {
    auth.getUser.mockRejectedValue(new TypeError("Failed to fetch"));
    const { fetchOwnProfile } = await load();
    const { NetworkError } = await import("./session");
    await expect(fetchOwnProfile()).rejects.toBeInstanceOf(NetworkError);
  });

  it("configures a deterministic auth storage key", async () => {
    const { getSupabase, AUTH_STORAGE_KEY } = await load();
    getSupabase();
    expect(createClient).toHaveBeenCalledWith("https://example.supabase.co", "anon-key", {
      auth: { storageKey: AUTH_STORAGE_KEY },
    });
  });
});

describe("readLocalSession (no network)", () => {
  const expired = {
    access_token: "expired",
    refresh_token: "r",
    expires_at: 1, // 1970: long expired
    user: { id: "u1" },
  };

  it("reads the user id from a stored session with an expired token, without touching supabase", async () => {
    const { readLocalSession, AUTH_STORAGE_KEY } = await load();
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(expired));
    expect(readLocalSession()).toEqual({ kind: "present", userId: "u1" });
    expect(createClient).not.toHaveBeenCalled();
    expect(auth.getSession).not.toHaveBeenCalled();
    expect(auth.getUser).not.toHaveBeenCalled();
  });

  it("offline with an expired stored token and a valid cache → cached state, no refresh", async () => {
    const { readLocalSession, AUTH_STORAGE_KEY } = await load();
    const { resolveAccountState, createLocalStorageCache } = await import("./session");
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(expired));
    const cache = createLocalStorageCache();
    cache.set({ userId: "u1", status: "active", role: "teacher", checkedAt: "2026-11-10T00:00:00Z" });
    const state = await resolveAccountState({
      fetchProfile: () => Promise.reject(new Error("no network expected")),
      online: false,
      localSession: readLocalSession(),
      cache,
      now: new Date("2026-11-19T00:00:00Z"),
    });
    expect(state.kind).toBe("active");
    expect(auth.getSession).not.toHaveBeenCalled();
    expect(createClient).not.toHaveBeenCalled();
  });

  it("supports the default sb-<ref>-auth-token key and the legacy currentSession shape", async () => {
    const { readLocalSession } = await load();
    localStorage.setItem(
      "sb-example-auth-token",
      JSON.stringify({ currentSession: { user: { id: "u2" } }, expiresAt: 1 }),
    );
    expect(readLocalSession()).toEqual({ kind: "present", userId: "u2" });
  });

  it("no stored session → absent", async () => {
    const { readLocalSession } = await load();
    expect(readLocalSession()).toEqual({ kind: "absent" });
  });

  it("corrupt stored session → unknown, without throwing", async () => {
    const { readLocalSession, AUTH_STORAGE_KEY } = await load();
    localStorage.setItem(AUTH_STORAGE_KEY, "{corrupt");
    expect(readLocalSession()).toEqual({ kind: "unknown" });
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ user: { id: 42 } }));
    expect(readLocalSession()).toEqual({ kind: "unknown" });
  });

  it("corrupt stored session + offline → signed-out and keeps the cache", async () => {
    const { readLocalSession, AUTH_STORAGE_KEY } = await load();
    const { resolveAccountState, createLocalStorageCache } = await import("./session");
    localStorage.setItem(AUTH_STORAGE_KEY, "{corrupt");
    const cache = createLocalStorageCache();
    cache.set({ userId: "u1", status: "active", role: "teacher", checkedAt: "2026-11-18T00:00:00Z" });
    const state = await resolveAccountState({
      fetchProfile: () => Promise.reject(new Error("no network expected")),
      online: false,
      localSession: readLocalSession(),
      cache,
      now: new Date("2026-11-19T00:00:00Z"),
    });
    expect(state).toEqual({ kind: "signed-out" });
    expect(cache.get()).not.toBeNull();
  });
});
