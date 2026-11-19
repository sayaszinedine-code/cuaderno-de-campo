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
  role: ProfileRole;
  checkedAt: string;
};

export type AccountCache = {
  get(): CachedCheck | null;
  set(c: CachedCheck): void;
  clear(): void;
};

/** Transport failure (no connectivity, timeout, 5xx): the account state is unknown, not signed-out. */
export class NetworkError extends Error {
  constructor(message = "No se pudo conectar con el servidor.", options?: { cause?: unknown }) {
    super(message, options);
    this.name = "NetworkError";
  }
}

export type AccountState =
  | { kind: "signed-out" }
  | { kind: ProfileStatus; profile: Profile }
  | { kind: "offline-expired" };

/**
 * present: a stored session exists for userId (its token may be expired).
 * absent: confirmed no stored session (signed out).
 * unknown: storage unreadable/corrupt; never treated as a confirmed sign-out.
 */
export type LocalSession =
  | { kind: "present"; userId: string }
  | { kind: "absent" }
  | { kind: "unknown" };

export type ResolveDeps = {
  /** Resolves null when there is no session; throws NetworkError on transport failures. */
  fetchProfile(): Promise<Profile | null>;
  online: boolean;
  /** Locally persisted session, read from storage without any network call. */
  localSession: LocalSession;
  cache: AccountCache;
  now: Date;
};

/** Offline grace period: the last online approval check stays valid this long. */
export const OFFLINE_GRACE_MS = 30 * 24 * 60 * 60 * 1000;

const STATUSES: readonly ProfileStatus[] = ["pending", "active", "suspended"];
const ROLES: readonly ProfileRole[] = ["teacher", "admin"];

export function isProfileStatus(value: unknown): value is ProfileStatus {
  return typeof value === "string" && (STATUSES as readonly string[]).includes(value);
}

export function isProfileRole(value: unknown): value is ProfileRole {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
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
    role: check.role,
  };
}

export async function resolveAccountState(deps: ResolveDeps): Promise<AccountState> {
  const { fetchProfile, online, cache, now } = deps;

  if (online) {
    try {
      const profile = await fetchProfile();
      if (!profile) {
        cache.clear();
        return { kind: "signed-out" };
      }
      cache.set({
        userId: profile.id,
        status: profile.status,
        role: profile.role,
        checkedAt: now.toISOString(),
      });
      return { kind: profile.status, profile };
    } catch (error) {
      if (!(error instanceof NetworkError)) throw error;
      // navigator.onLine lies on flaky connections: fall back to the offline rules.
    }
  }

  return resolveOffline(deps);
}

function resolveOffline({ localSession, cache, now }: ResolveDeps): AccountState {
  if (localSession.kind === "unknown") return { kind: "signed-out" };
  const check = cache.get();
  if (localSession.kind === "absent") {
    if (check) cache.clear();
    return { kind: "signed-out" };
  }
  if (!check) return { kind: "offline-expired" };
  if (check.userId !== localSession.userId) {
    cache.clear();
    return { kind: "signed-out" };
  }

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
    const { userId, status, role = "teacher", checkedAt } = value as Record<string, unknown>;
    if (
      typeof userId !== "string" ||
      typeof checkedAt !== "string" ||
      !isProfileStatus(status) ||
      !isProfileRole(role)
    ) {
      return null;
    }
    return { userId, status, role, checkedAt };
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
    clear() {
      try {
        localStorage.removeItem(key);
      } catch {
        // Storage unavailable: nothing was persisted.
      }
    },
  };
}
