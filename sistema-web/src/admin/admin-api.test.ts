import { beforeEach, describe, expect, it, vi } from "vitest";

const { builder, from, getSupabase } = vi.hoisted(() => {
  const result = { data: [] as unknown[], error: null as unknown };
  const builder: Record<string, unknown> = {};
  for (const m of ["select", "order", "eq", "or", "update"]) builder[m] = vi.fn(() => builder);
  builder.then = (resolve: (v: unknown) => unknown) => resolve(result);
  builder.__result = result;
  const from = vi.fn(() => builder);
  return { builder, from, getSupabase: vi.fn(() => ({ from })) };
});
vi.mock("@/auth/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/auth/client")>()),
  getSupabase,
}));

import { listTeachers, setTeacherStatus } from "./admin-api";

const result = (builder as { __result: { data: unknown[]; error: unknown } }).__result;
const fn = (name: string) => builder[name] as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  result.data = [];
  result.error = null;
});

describe("listTeachers", () => {
  it("queries profiles with no filters", async () => {
    await listTeachers({});
    expect(from).toHaveBeenCalledWith("profiles");
    expect(fn("eq")).not.toHaveBeenCalled();
    expect(fn("or")).not.toHaveBeenCalled();
  });

  it("filters by status", async () => {
    await listTeachers({ status: "pending" });
    expect(fn("eq")).toHaveBeenCalledWith("status", "pending");
  });

  it("searches name, last names, email and institution with ilike", async () => {
    await listTeachers({ q: " ana " });
    expect(fn("or")).toHaveBeenCalledWith(
      "first_names.ilike.%ana%,last_names.ilike.%ana%,email.ilike.%ana%,institution.ilike.%ana%",
    );
  });

  it("strips characters that break the or() filter syntax", async () => {
    await listTeachers({ q: "a,b(c)%" });
    expect(fn("or")).toHaveBeenCalledWith(
      "first_names.ilike.%abc%,last_names.ilike.%abc%,email.ilike.%abc%,institution.ilike.%abc%",
    );
  });

  it("maps rows to profiles with createdAt", async () => {
    result.data = [
      {
        id: "u1", first_names: "Ana", last_names: "Paz", email: "a@x.pe", institution: null,
        ugel: "UGEL 01", region: "Lima Metropolitana", status: "pending", role: "teacher",
        created_at: "2026-11-01T00:00:00Z",
      },
    ];
    const rows = await listTeachers({});
    expect(rows[0]).toMatchObject({ id: "u1", firstNames: "Ana", institution: "", createdAt: "2026-11-01T00:00:00Z" });
  });

  it("throws when supabase fails", async () => {
    result.error = new Error("fail");
    await expect(listTeachers({})).rejects.toThrow("fail");
  });
});

describe("setTeacherStatus", () => {
  it("updates the status of one profile", async () => {
    await setTeacherStatus("u1", "active");
    expect(fn("update")).toHaveBeenCalledWith({ status: "active" });
    expect(fn("eq")).toHaveBeenCalledWith("id", "u1");
  });
  it("throws on error", async () => {
    result.error = new Error("denied");
    await expect(setTeacherStatus("u1", "active")).rejects.toThrow("denied");
  });
});
