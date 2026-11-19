// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const A = "00000000-0000-0000-0000-00000000000a";
const B = "00000000-0000-0000-0000-00000000000b";
const ADMIN = "00000000-0000-0000-0000-0000000000ad";

// Minimal stand-in for what Supabase provides before user migrations run.
const SUPABASE_BOOTSTRAP = `
  create schema auth;
  create table auth.users (
    id uuid primary key,
    email text,
    raw_user_meta_data jsonb
  );
  create function auth.uid() returns uuid
    language sql stable
    as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create role anon nologin;
  create role authenticated nologin;
  grant usage on schema public to anon, authenticated;
  grant usage on schema auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
`;

const migration = readFileSync(
  path.resolve(__dirname, "migrations/0001_profiles.sql"),
  "utf8",
);

let db: PGlite;

async function asSuperuser(): Promise<void> {
  await db.exec("reset role; select set_config('request.jwt.claim.sub', '', false);");
}

async function asUser(id: string): Promise<void> {
  await db.exec("reset role;");
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id]);
  await db.exec("set role authenticated;");
}

async function asAnon(): Promise<void> {
  await db.exec("reset role; select set_config('request.jwt.claim.sub', '', false); set role anon;");
}

async function createUser(
  id: string,
  email: string,
  meta: Record<string, string> | null,
): Promise<void> {
  await db.query(
    "insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)",
    [id, email, meta === null ? null : JSON.stringify(meta)],
  );
}

type Row = { id: string; status: string; role: string; institution: string | null };

// Booting the WASM Postgres can exceed vitest's default 10 s hook timeout on a cold or busy machine.
const PGLITE_BOOT_TIMEOUT_MS = 60_000;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SUPABASE_BOOTSTRAP);
  await db.exec(migration);
}, PGLITE_BOOT_TIMEOUT_MS);

afterAll(async () => {
  await db.close();
});

beforeEach(async () => {
  await asSuperuser();
  await db.exec("delete from auth.users;");
  await createUser(A, "a@example.com", {
    first_names: "Ana",
    last_names: "Quispe",
    institution: "IEI 123",
    ugel: "UGEL 01",
    region: "Lima",
  });
  await createUser(B, "b@example.com", {
    first_names: "Beatriz",
    last_names: "Mamani",
  });
  await createUser(ADMIN, "admin@example.com", {
    first_names: "Admin",
    last_names: "Root",
  });
  // Bootstrapping the first admin happens as the database owner (SQL editor).
  await db.query("update public.profiles set role = 'admin', status = 'active' where id = $1", [ADMIN]);
});

describe("profiles trigger on auth.users", () => {
  it("creates a pending teacher profile from the metadata", async () => {
    const { rows } = await db.query<Record<string, unknown>>(
      "select * from public.profiles where id = $1",
      [A],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: A,
      email: "a@example.com",
      first_names: "Ana",
      last_names: "Quispe",
      institution: "IEI 123",
      ugel: "UGEL 01",
      region: "Lima",
      status: "pending",
      role: "teacher",
      status_changed_at: null,
    });
    expect(rows[0].created_at).toBeInstanceOf(Date);
  });

  it("does not fail sign-up when metadata is missing", async () => {
    const id = "00000000-0000-0000-0000-0000000000cc";
    await createUser(id, "c@example.com", null);
    const { rows } = await db.query<Record<string, unknown>>(
      "select first_names, last_names, status, role from public.profiles where id = $1",
      [id],
    );
    expect(rows[0]).toEqual({ first_names: "", last_names: "", status: "pending", role: "teacher" });
  });

  it("ignores status/role smuggled in the metadata", async () => {
    const id = "00000000-0000-0000-0000-0000000000dd";
    await createUser(id, "d@example.com", {
      first_names: "X",
      last_names: "Y",
      status: "active",
      role: "admin",
    });
    const { rows } = await db.query<Row>("select status, role from public.profiles where id = $1", [id]);
    expect(rows[0]).toMatchObject({ status: "pending", role: "teacher" });
  });
});

describe("profiles RLS for a teacher", () => {
  it("sees only her own profile", async () => {
    await asUser(A);
    const { rows } = await db.query<Row>("select id from public.profiles");
    expect(rows.map((r) => r.id)).toEqual([A]);
  });

  it("cannot read another teacher's profile by id", async () => {
    await asUser(A);
    const { rows } = await db.query<Row>("select id from public.profiles where id = $1", [B]);
    expect(rows).toHaveLength(0);
  });

  it("cannot approve herself", async () => {
    await asUser(A);
    await expect(
      db.query("update public.profiles set status = 'active' where id = $1", [A]),
    ).rejects.toThrow(/only an administrator/);
    await asSuperuser();
    const { rows } = await db.query<Row>("select status from public.profiles where id = $1", [A]);
    expect(rows[0].status).toBe("pending");
  });

  it("cannot make herself admin", async () => {
    await asUser(A);
    await expect(
      db.query("update public.profiles set role = 'admin' where id = $1", [A]),
    ).rejects.toThrow(/only an administrator/);
    await asSuperuser();
    const { rows } = await db.query<Row>("select role from public.profiles where id = $1", [A]);
    expect(rows[0].role).toBe("teacher");
  });

  it("cannot change her email", async () => {
    await asUser(A);
    await expect(
      db.query("update public.profiles set email = 'x@evil.com' where id = $1", [A]),
    ).rejects.toThrow(/read-only/);
  });

  it("cannot forge status_changed_at", async () => {
    await asUser(A);
    await db.query("update public.profiles set status_changed_at = now() where id = $1", [A]);
    await asSuperuser();
    const { rows } = await db.query<{ status_changed_at: Date | null }>(
      "select status_changed_at from public.profiles where id = $1",
      [A],
    );
    expect(rows[0].status_changed_at).toBeNull();
  });

  it("can update her own registration fields", async () => {
    await asUser(A);
    await db.query("update public.profiles set institution = 'IEI 456' where id = $1", [A]);
    await asSuperuser();
    const { rows } = await db.query<Row>("select institution from public.profiles where id = $1", [A]);
    expect(rows[0].institution).toBe("IEI 456");
  });

  it("cannot update another teacher's profile", async () => {
    await asUser(A);
    const res = await db.query("update public.profiles set institution = 'hack' where id = $1", [B]);
    expect(res.affectedRows ?? 0).toBe(0);
    await asSuperuser();
    const { rows } = await db.query<Row>("select institution from public.profiles where id = $1", [B]);
    expect(rows[0].institution).toBeNull();
  });

  it("cannot insert or delete profiles", async () => {
    await asUser(A);
    await expect(
      db.query(
        "insert into public.profiles (id, first_names, last_names, email) values ($1, 'x', 'y', 'z')",
        ["00000000-0000-0000-0000-0000000000ee"],
      ),
    ).rejects.toThrow();
    await expect(db.query("delete from public.profiles where id = $1", [A])).rejects.toThrow();
  });
});

describe("profiles RLS for the admin", () => {
  it("sees every profile", async () => {
    await asUser(ADMIN);
    const { rows } = await db.query<Row>("select id from public.profiles");
    expect(rows.map((r) => r.id).sort()).toEqual([A, B, ADMIN].sort());
  });

  it("approves a teacher and stamps status_changed_at", async () => {
    await asUser(ADMIN);
    await db.query("update public.profiles set status = 'active' where id = $1", [A]);
    await asSuperuser();
    const { rows } = await db.query<{ status: string; status_changed_at: Date | null }>(
      "select status, status_changed_at from public.profiles where id = $1",
      [A],
    );
    expect(rows[0].status).toBe("active");
    expect(rows[0].status_changed_at).toBeInstanceOf(Date);
  });

  it("can suspend a teacher, and a suspended teacher cannot reactivate herself", async () => {
    await asUser(ADMIN);
    await db.query("update public.profiles set status = 'suspended' where id = $1", [A]);
    await asUser(A);
    await expect(
      db.query("update public.profiles set status = 'active' where id = $1", [A]),
    ).rejects.toThrow(/only an administrator/);
  });
});

describe("profiles RLS for anon", () => {
  it("sees nothing", async () => {
    await asAnon();
    await expect(db.query("select id from public.profiles")).rejects.toThrow();
  });

  it("cannot update", async () => {
    await asAnon();
    await expect(
      db.query("update public.profiles set status = 'active' where id = $1", [A]),
    ).rejects.toThrow();
  });
});
