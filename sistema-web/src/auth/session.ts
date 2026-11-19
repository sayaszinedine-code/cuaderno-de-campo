export type ProfileStatus = "pending" | "active" | "suspended";
export type ProfileRole = "teacher" | "admin";

export type Profile = {
  id: string;
  firstNames: string;
  lastNames: string;
  email: string;
  institution: string;
  ugel: string;
  region: string;
  status: ProfileStatus;
  role: ProfileRole;
};

export type CachedCheck = {
  userId: string;
  status: ProfileStatus;
  checkedAt: string;
};

export type AccountCache = {
  get(): CachedCheck | null;
  set(c: CachedCheck): void;
};

export type AccountState =
  | { kind: "signed-out" }
  | { kind: ProfileStatus; profile: Profile }
  | { kind: "offline-expired" };

export type ResolveDeps = {
  fetchProfile(): Promise<Profile | null>;
  online: boolean;
  cache: AccountCache;
  now: Date;
};

/** Offline grace period: the last online approval check stays valid this long. */
export const OFFLINE_GRACE_MS = 30 * 24 * 60 * 60 * 1000;

const STATUSES: readonly ProfileStatus[] = ["pending", "active", "suspended"];

export function isProfileStatus(value: unknown): value is ProfileStatus {
  return typeof value === "string" && (STATUSES as readonly string[]).includes(value);
}

function profileFromCache(check: CachedCheck): Profile {
  return {
    id: check.userId,
    firstNames: "",
    lastNames: "",
    email: "",
    institution: "",
    ugel: "",
    region: "",
    status: check.status,
    role: "teacher",
  };
}

export async function resolveAccountState(deps: ResolveDeps): Promise<AccountState> {
  const { fetchProfile, online, cache, now } = deps;

  if (online) {
    const profile = await fetchProfile();
    if (!profile) return { kind: "signed-out" };
    cache.set({ userId: profile.id, status: profile.status, checkedAt: now.toISOString() });
    return { kind: profile.status, profile };
  }

  const check = cache.get();
  if (!check) return { kind: "signed-out" };

  const checkedAt = Date.parse(check.checkedAt);
  const age = now.getTime() - checkedAt;
  if (Number.isNaN(checkedAt) || age < 0 || age > OFFLINE_GRACE_MS) {
    return { kind: "offline-expired" };
  }
  return { kind: check.status, profile: profileFromCache(check) };
}

function parseCachedCheck(raw: string | null): CachedCheck | null {
  if (raw === null) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null) return null;
    const { userId, status, checkedAt } = value as Record<string, unknown>;
    if (typeof userId !== "string" || typeof checkedAt !== "string" || !isProfileStatus(status)) {
      return null;
    }
    return { userId, status, checkedAt };
  } catch {
    return null;
  }
}

export function createLocalStorageCache(key = "account-check"): AccountCache {
  return {
    get() {
      try {
        return parseCachedCheck(localStorage.getItem(key));
      } catch {
        return null;
      }
    },
    set(c) {
      try {
        localStorage.setItem(key, JSON.stringify(c));
      } catch {
        // Storage unavailable (private mode, quota): the next online check retries.
      }
    },
  };
}
