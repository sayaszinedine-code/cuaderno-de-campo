import {
  createClient,
  isAuthRetryableFetchError,
  type SupabaseClient,
} from "@supabase/supabase-js";
import {
  createLocalStorageCache,
  isProfileRole,
  isProfileStatus,
  NetworkError,
  type AccountCache,
  type LocalSession,
  type Profile,
} from "./session";

export type SignUpInput = {
  email: string;
  password: string;
  firstNames: string;
  lastNames: string;
  institution: string;
  ugel: string;
  region: string;
};

/** Fields a teacher may edit on her own profile (status/role are admin-only). */
export type ProfilePatch = Partial<
  Pick<Profile, "firstNames" | "lastNames" | "institution" | "ugel" | "region">
>;

type ProfileRow = {
  id: string;
  first_names: string;
  last_names: string;
  email: string;
  institution: string | null;
  ugel: string | null;
  region: string | null;
  status: string;
  role: string;
};

const PROFILE_COLUMNS = "id, first_names, last_names, email, institution, ugel, region, status, role";

/** Explicit so the persisted session can be read from storage deterministically. */
export const AUTH_STORAGE_KEY = "cuaderno-auth";

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      "Falta configurar Supabase: define NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    );
  }
  client = createClient(url, key, { auth: { storageKey: AUTH_STORAGE_KEY } });
  return client;
}

function loginRedirect(): string {
  return `${window.location.origin}/login/`;
}

export function mapProfileRow(row: ProfileRow): Profile {
  if (!isProfileStatus(row.status)) throw new Error(`Estado de cuenta desconocido: ${row.status}`);
  if (!isProfileRole(row.role)) {
    throw new Error(`Rol de cuenta desconocido: ${row.role}`);
  }
  return {
    id: row.id,
    firstNames: row.first_names,
    lastNames: row.last_names,
    email: row.email,
    institution: row.institution ?? "",
    ugel: row.ugel ?? "",
    region: row.region ?? "",
    status: row.status,
    role: row.role,
  };
}

export async function signUp(input: SignUpInput): Promise<void> {
  const { error } = await getSupabase().auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      data: {
        first_names: input.firstNames,
        last_names: input.lastNames,
        institution: input.institution,
        ugel: input.ugel,
        region: input.region,
      },
      emailRedirectTo: loginRedirect(),
    },
  });
  if (error) throw error;
}

export async function signIn(email: string, password: string): Promise<void> {
  const { error } = await getSupabase().auth.signInWithPassword({ email, password });
  if (error) throw error;
}

/** Signs out and always forgets the offline approval check (shared PCs). */
export async function signOut(cache: AccountCache = createLocalStorageCache()): Promise<void> {
  cache.clear();
  const { error } = await getSupabase().auth.signOut();
  if (error) throw error;
}

export async function sendPasswordReset(email: string): Promise<void> {
  const { error } = await getSupabase().auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/recuperar/`,
  });
  if (error) throw error;
}

/** Server-side status 0 (fetch failed) or 5xx means the server could not be reached. */
function isTransportStatus(status: number | undefined): boolean {
  return status !== undefined && (status === 0 || status >= 500);
}

async function withNetworkGuard<T>(run: () => PromiseLike<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof TypeError) throw new NetworkError(undefined, { cause: error });
    throw error;
  }
}

/** Verifies the session with the server. null = no valid session; NetworkError = unknown. */
async function currentUserId(): Promise<string | null> {
  const { data, error } = await withNetworkGuard(() => getSupabase().auth.getUser());
  if (error) {
    if (isAuthRetryableFetchError(error)) throw new NetworkError(undefined, { cause: error });
    // Missing session, invalid/expired JWT, deleted user…: signed-out.
    return null;
  }
  return data.user?.id ?? null;
}

/** supabase-js default key (`sb-<project-ref>-auth-token`), in case a session predates AUTH_STORAGE_KEY. */
function defaultStorageKey(): string | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return null;
  try {
    const ref = new URL(url).hostname.split(".")[0];
    return ref ? `sb-${ref}-auth-token` : null;
  } catch {
    return null;
  }
}

function userIdFrom(value: unknown): string | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  const user = record.user ?? (record.currentSession as Record<string, unknown> | undefined)?.user;
  if (typeof user !== "object" || user === null) return null;
  const id = (user as Record<string, unknown>).id;
  return typeof id === "string" && id !== "" ? id : null;
}

function readStoredSession(key: string): LocalSession {
  const raw = localStorage.getItem(key);
  if (raw === null) return { kind: "absent" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { kind: "unknown" };
  }
  if (parsed === null) return { kind: "absent" };
  let userId = userIdFrom(parsed);
  if (!userId) {
    // auth-js may keep the user apart when configured with `userStorage`.
    try {
      const rawUser = localStorage.getItem(`${key}-user`);
      userId = rawUser === null ? null : userIdFrom(JSON.parse(rawUser));
    } catch {
      userId = null;
    }
  }
  return userId ? { kind: "present", userId } : { kind: "unknown" };
}

/**
 * Persisted session, read straight from localStorage. Never calls supabase-js
 * (getSession() refreshes expired tokens over the network) so offline access
 * keeps working after the ~1h access token expires.
 */
export function readLocalSession(): LocalSession {
  try {
    const primary = readStoredSession(AUTH_STORAGE_KEY);
    if (primary.kind !== "absent") return primary;
    const fallbackKey = defaultStorageKey();
    return fallbackKey ? readStoredSession(fallbackKey) : primary;
  } catch {
    return { kind: "unknown" };
  }
}

export async function fetchOwnProfile(): Promise<Profile | null> {
  const userId = await currentUserId();
  if (!userId) return null;
  const { data, error, status } = await withNetworkGuard(() =>
    getSupabase()
      .from("profiles")
      .select(PROFILE_COLUMNS)
      .eq("id", userId)
      .maybeSingle<ProfileRow>(),
  );
  if (error) {
    if (isTransportStatus(status)) throw new NetworkError(undefined, { cause: error });
    throw error;
  }
  return data ? mapProfileRow(data) : null;
}

export async function updateOwnProfile(patch: ProfilePatch): Promise<Profile> {
  const userId = await currentUserId();
  if (!userId) throw new Error("No hay una sesión activa.");
  const row: Partial<ProfileRow> = {};
  if (patch.firstNames !== undefined) row.first_names = patch.firstNames;
  if (patch.lastNames !== undefined) row.last_names = patch.lastNames;
  if (patch.institution !== undefined) row.institution = patch.institution;
  if (patch.ugel !== undefined) row.ugel = patch.ugel;
  if (patch.region !== undefined) row.region = patch.region;
  const { data, error } = await getSupabase()
    .from("profiles")
    .update(row)
    .eq("id", userId)
    .select(PROFILE_COLUMNS)
    .single<ProfileRow>();
  if (error) throw error;
  return mapProfileRow(data);
}
