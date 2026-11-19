import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { isProfileStatus, type Profile } from "./session";

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
  client = createClient(url, key);
  return client;
}

function loginRedirect(): string {
  return `${window.location.origin}/login/`;
}

export function mapProfileRow(row: ProfileRow): Profile {
  if (!isProfileStatus(row.status)) throw new Error(`Estado de cuenta desconocido: ${row.status}`);
  if (row.role !== "teacher" && row.role !== "admin") {
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

export async function signOut(): Promise<void> {
  const { error } = await getSupabase().auth.signOut();
  if (error) throw error;
}

export async function sendPasswordReset(email: string): Promise<void> {
  const { error } = await getSupabase().auth.resetPasswordForEmail(email, {
    redirectTo: loginRedirect(),
  });
  if (error) throw error;
}

async function currentUserId(): Promise<string | null> {
  const { data, error } = await getSupabase().auth.getUser();
  if (error || !data.user) return null;
  return data.user.id;
}

export async function fetchOwnProfile(): Promise<Profile | null> {
  const userId = await currentUserId();
  if (!userId) return null;
  const { data, error } = await getSupabase()
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .eq("id", userId)
    .maybeSingle<ProfileRow>();
  if (error) throw error;
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
