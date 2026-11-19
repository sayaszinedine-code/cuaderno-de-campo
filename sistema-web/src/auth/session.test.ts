import { beforeEach, describe, expect, it } from "vitest";
import {
  createLocalStorageCache,
  NetworkError,
  resolveAccountState,
  type CachedCheck,
  type LocalSession,
  type Profile,
} from "./session";

const present = (userId: string): LocalSession => ({ kind: "present", userId });
const ABSENT: LocalSession = { kind: "absent" };
const UNKNOWN: LocalSession = { kind: "unknown" };

const NOW = new Date("2026-11-19T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (d: number) => new Date(NOW.getTime() - d * DAY).toISOString();

const profile = (status: Profile["status"], role: Profile["role"] = "teacher"): Profile => ({
  id: "u1",
  firstNames: "Ana",
  lastNames: "Quispe",
  email: "a@example.com",
  institution: "IEI 123",
  ugel: "UGEL 01",
  region: "Lima",
  status,
  role,
});

const check = (status: CachedCheck["status"], days: number, extra: Partial<CachedCheck> = {}): CachedCheck => ({
  userId: "u1",
  status,
  role: "teacher",
  checkedAt: daysAgo(days),
  ...extra,
});

function memoryCache(initial: CachedCheck | null = null) {
  let value = initial;
  const writes: CachedCheck[] = [];
  let clears = 0;
  return {
    writes,
    get clears() {
      return clears;
    },
    get: () => value,
    set: (c: CachedCheck) => {
      value = c;
      writes.push(c);
    },
    clear: () => {
      value = null;
      clears += 1;
    },
  };
}

const neverFetch = () => Promise.reject(new Error("should not fetch offline"));
const networkDown = () => Promise.reject(new NetworkError("sin conexión"));

describe("resolveAccountState online", () => {
  it("active profile → active, and caches the check with role", async () => {
    const cache = memoryCache();
    const state = await resolveAccountState({
      fetchProfile: async () => profile("active"),
      online: true,
      localSession: present("u1"),
      cache,
      now: NOW,
    });
    expect(state).toEqual({ kind: "active", profile: profile("active") });
    expect(cache.writes).toEqual([
      { userId: "u1", status: "active", role: "teacher", checkedAt: NOW.toISOString() },
    ]);
  });

  it("pending profile → pending", async () => {
    const state = await resolveAccountState({
      fetchProfile: async () => profile("pending"),
      online: true,
      localSession: present("u1"),
      cache: memoryCache(),
      now: NOW,
    });
    expect(state.kind).toBe("pending");
  });

  it("no session/profile → signed-out and clears the cache", async () => {
    const cache = memoryCache(check("active", 1));
    const state = await resolveAccountState({
      fetchProfile: async () => null,
      online: true,
      localSession: ABSENT,
      cache,
      now: NOW,
    });
    expect(state).toEqual({ kind: "signed-out" });
    expect(cache.clears).toBe(1);
    expect(cache.get()).toBeNull();
  });

  it("network error with a valid cache → uses the cache", async () => {
    const state = await resolveAccountState({
      fetchProfile: networkDown,
      online: true,
      localSession: present("u1"),
      cache: memoryCache(check("active", 3)),
      now: NOW,
    });
    expect(state.kind).toBe("active");
  });

  it("network error without a cache → offline-expired", async () => {
    const state = await resolveAccountState({
      fetchProfile: networkDown,
      online: true,
      localSession: present("u1"),
      cache: memoryCache(),
      now: NOW,
    });
    expect(state).toEqual({ kind: "offline-expired" });
  });

  it("network error with a stale cache → offline-expired", async () => {
    const state = await resolveAccountState({
      fetchProfile: networkDown,
      online: true,
      localSession: present("u1"),
      cache: memoryCache(check("active", 31)),
      now: NOW,
    });
    expect(state).toEqual({ kind: "offline-expired" });
  });

  it("non-network errors propagate", async () => {
    await expect(
      resolveAccountState({
        fetchProfile: () => Promise.reject(new Error("bug")),
        online: true,
        localSession: present("u1"),
        cache: memoryCache(check("active", 1)),
        now: NOW,
      }),
    ).rejects.toThrow("bug");
  });
});

describe("resolveAccountState offline", () => {
  const offline = (cache: ReturnType<typeof memoryCache>, localSession: LocalSession = present("u1")) =>
    resolveAccountState({ fetchProfile: neverFetch, online: false, localSession, cache, now: NOW });

  it("active check from 29 days ago → active", async () => {
    expect((await offline(memoryCache(check("active", 29)))).kind).toBe("active");
  });

  it("check exactly 30 days ago → still allowed", async () => {
    expect((await offline(memoryCache(check("active", 30)))).kind).toBe("active");
  });

  it("check from 31 days ago → offline-expired", async () => {
    expect(await offline(memoryCache(check("active", 31)))).toEqual({ kind: "offline-expired" });
  });

  it("suspended check → suspended", async () => {
    expect((await offline(memoryCache(check("suspended", 2)))).kind).toBe("suspended");
  });

  it("keeps the admin role from the cache", async () => {
    const state = await offline(memoryCache(check("active", 2, { role: "admin" })));
    expect(state.kind === "active" && state.profile.role).toBe("admin");
  });

  it("cache but no local session (signed out on a shared PC) → signed-out", async () => {
    const cache = memoryCache(check("active", 1));
    expect(await offline(cache, ABSENT)).toEqual({ kind: "signed-out" });
    expect(cache.get()).toBeNull();
  });

  it("cache for another user → signed-out", async () => {
    const cache = memoryCache(check("active", 1));
    expect(await offline(cache, present("someone-else"))).toEqual({ kind: "signed-out" });
    expect(cache.get()).toBeNull();
  });

  it("unreadable local session → signed-out but keeps the cache", async () => {
    const cache = memoryCache(check("active", 1));
    expect(await offline(cache, UNKNOWN)).toEqual({ kind: "signed-out" });
    expect(cache.clears).toBe(0);
    expect(cache.get()).not.toBeNull();
  });

  it("local session but no cached check → offline-expired", async () => {
    expect(await offline(memoryCache())).toEqual({ kind: "offline-expired" });
  });

  it("no session and no cache → signed-out", async () => {
    expect(await offline(memoryCache(), ABSENT)).toEqual({ kind: "signed-out" });
  });

  it("unparseable checkedAt → offline-expired", async () => {
    expect(await offline(memoryCache(check("active", 0, { checkedAt: "garbage" })))).toEqual({
      kind: "offline-expired",
    });
  });

  it("check dated in the future → offline-expired", async () => {
    expect(await offline(memoryCache(check("active", -5)))).toEqual({ kind: "offline-expired" });
  });
});

describe("createLocalStorageCache", () => {
  beforeEach(() => localStorage.clear());

  it("round-trips a check", () => {
    const cache = createLocalStorageCache();
    const c: CachedCheck = { userId: "u1", status: "active", role: "admin", checkedAt: NOW.toISOString() };
    cache.set(c);
    expect(createLocalStorageCache().get()).toEqual(c);
    expect(localStorage.getItem("account-check")).not.toBeNull();
  });

  it("clear() removes the check", () => {
    const cache = createLocalStorageCache();
    cache.set(check("active", 0));
    cache.clear();
    expect(cache.get()).toBeNull();
    expect(localStorage.getItem("account-check")).toBeNull();
  });

  it("treats an old cache without role as teacher", () => {
    localStorage.setItem(
      "account-check",
      JSON.stringify({ userId: "u1", status: "active", checkedAt: NOW.toISOString() }),
    );
    expect(createLocalStorageCache().get()).toEqual({
      userId: "u1",
      status: "active",
      role: "teacher",
      checkedAt: NOW.toISOString(),
    });
  });

  it("returns null for missing or corrupt data", () => {
    const cache = createLocalStorageCache("k");
    expect(cache.get()).toBeNull();
    localStorage.setItem("k", "{not json");
    expect(cache.get()).toBeNull();
    localStorage.setItem("k", JSON.stringify({ userId: "u1", status: "admin", checkedAt: "x" }));
    expect(cache.get()).toBeNull();
    localStorage.setItem("k", JSON.stringify({ userId: "u1", status: "active", role: "root", checkedAt: "x" }));
    expect(cache.get()).toBeNull();
  });
});
