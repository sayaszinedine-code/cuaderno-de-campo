import { getSupabase, mapProfileRow } from "@/auth/client";
import type { Profile, ProfileStatus } from "@/auth/session";

export type TeacherRow = Profile & { createdAt: string };

const COLUMNS =
  "id, first_names, last_names, email, institution, ugel, region, status, role, created_at";

/** Removes characters that would break PostgREST's or()/ilike syntax. */
function sanitizeQuery(q: string): string {
  return q.replace(/[,()%*\\]/g, "").trim();
}

export async function listTeachers(filter: { status?: ProfileStatus; q?: string }): Promise<TeacherRow[]> {
  let query = getSupabase().from("profiles").select(COLUMNS).order("created_at", { ascending: false });
  if (filter.status) query = query.eq("status", filter.status);
  const q = sanitizeQuery(filter.q ?? "");
  if (q) {
    const p = `%${q}%`;
    query = query.or(
      `first_names.ilike.${p},last_names.ilike.${p},email.ilike.${p},institution.ilike.${p}`,
    );
  }
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((row) => ({
    ...mapProfileRow(row),
    createdAt: String((row as { created_at: string }).created_at),
  }));
}

export async function setTeacherStatus(id: string, status: ProfileStatus): Promise<void> {
  const { error } = await getSupabase().from("profiles").update({ status }).eq("id", id);
  if (error) throw error;
}
