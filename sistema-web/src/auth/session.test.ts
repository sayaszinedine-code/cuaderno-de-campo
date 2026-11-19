import { beforeEach, describe, expect, it } from "vitest";
import {
  createLocalStorageCache,
  resolveAccountState,
  type CachedCheck,
  type Profile,
} from "./session";

const NOW = new Date("2026-11-19T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (d: number) => new Date(NOW.getTime() - d * DAY).toISOString();

const profile = (status: Profile["status"]): Profile => ({
  id: "u1",
  firstNames: "Ana",
  lastNames: "Quispe",
  email: "a@example.com",
  institution: "IEI 123",
  ugel: "UGEL 01",
  region: "Lima",
  status,
  role: "teacher",
});

function memoryCache(initial: CachedCheck | null = null) {
  let value = initial;
  const writes: CachedCheck[] = [];
  return {
    writes,
    get: () => value,
    set: (c: CachedCheck) => {
      value = c;
      writes.push(c);
    },
  };
}

const neverFetch = () => Promise.reject(new Error("should not fetch offline"));

describe("resolveAccountState", () => {
  it("online with an active profile → active, and caches the check", async () => {
    const cache = memoryCache();
    const state = await resolveAccountState({
      fetchProfile: async () => profile("active"),
      online: true,
      cache,
      now: NOW,
    });
    expect(state).toEqual({ kind: "active", profile: profile("active") });
    expect(cache.writes).toEqual([{ userId: "u1", status: "active", checkedAt: NOW.toISOString() }]);
  });

  it("online with a pending profile → pending", async () => {
    const state = await resolveAccountState({
      fetchProfile: async () => profile("pending"),
      online: true,
      cache: memoryCache(),
      now: NOW,
    });
    expect(state.kind).toBe("pending");
  });

  it("online without a session/profile → signed-out", async () => {
    const state = await resolveAccountState({
      fetchProfile: async () => null,
      online: true,
      cache: memoryCache({ userId: "u1", status: "active", checkedAt: daysAgo(1) }),
      now: NOW,
    });
    expect(state).toEqual({ kind: "signed-out" });
  });

  it("offline with an active check from 29 days ago → active", async () => {
    const state = await resolveAccountState({
      fetchProfile: neverFetch,
      online: false,
      cache: memoryCache({ userId: "u1", status: "active", checkedAt: daysAgo(29) }),
      now: NOW,
    });
    expect(state.kind).toBe("active");
  });

  it("offline with a check exactly 30 days ago → still allowed", async () => {
    const state = await resolveAccountState({
      fetchProfile: neverFetch,
      online: false,
      cache: memoryCache({ userId: "u1", status: "active", checkedAt: daysAgo(30) }),
      now: NOW,
    });
    expect(state.kind).toBe("active");
  });

  it("offline with a check from 31 days ago → offline-expired", async () => {
    const state = await resolveAccountState({
      fetchProfile: neverFetch,
      online: false,
      cache: memoryCache({ userId: "u1", status: "active", checkedAt: daysAgo(31) }),
      now: NOW,
    });
    expect(state).toEqual({ kind: "offline-expired" });
  });

  it("offline with a suspended check → suspended", async () => {
    const state = await resolveAccountState({
      fetchProfile: neverFetch,
      online: false,
      cache: memoryCache({ userId: "u1", status: "suspended", checkedAt: daysAgo(2) }),
      now: NOW,
    });
    expect(state.kind).toBe("suspended");
  });

  it("offline without a cached check → signed-out", async () => {
    const state = await resolveAccountState({
      fetchProfile: neverFetch,
      online: false,
      cache: memoryCache(),
      now: NOW,
    });
    expect(state).toEqual({ kind: "signed-out" });
  });

  it("offline with an unparseable checkedAt → offline-expired", async () => {
    const state = await resolveAccountState({
      fetchProfile: neverFetch,
      online: false,
      cache: memoryCache({ userId: "u1", status: "active", checkedAt: "garbage" }),
      now: NOW,
    });
    expect(state).toEqual({ kind: "offline-expired" });
  });

  it("offline with a check dated in the future → offline-expired", async () => {
    const state = await resolveAccountState({
      fetchProfile: neverFetch,
      online: false,
      cache: memoryCache({ userId: "u1", status: "active", checkedAt: daysAgo(-5) }),
      now: NOW,
    });
    expect(state).toEqual({ kind: "offline-expired" });
  });
});

describe("createLocalStorageCache", () => {
  beforeEach(() => localStorage.clear());

  it("round-trips a check", () => {
    const cache = createLocalStorageCache();
    const check: CachedCheck = { userId: "u1", status: "active", checkedAt: NOW.toISOString() };
    cache.set(check);
    expect(createLocalStorageCache().get()).toEqual(check);
    expect(localStorage.getItem("account-check")).not.toBeNull();
  });

  it("returns null for missing or corrupt data", () => {
    const cache = createLocalStorageCache("k");
    expect(cache.get()).toBeNull();
    localStorage.setItem("k", "{not json");
    expect(cache.get()).toBeNull();
    localStorage.setItem("k", JSON.stringify({ userId: "u1", status: "admin", checkedAt: "x" }));
    expect(cache.get()).toBeNull();
  });
});
