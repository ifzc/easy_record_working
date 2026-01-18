export type AuthUser = {
  id?: string;
  account: string;
  display_name?: string;
  role?: string;
};

export type AuthTenant = {
  id?: string;
  code?: string;
  name?: string;
};

export type AuthSession = {
  token: string;
  user?: AuthUser;
  tenant?: AuthTenant;
};

const AUTH_SESSION_KEY = "easy-record-session";

export function loadAuthSession(): AuthSession | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(AUTH_SESSION_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<AuthSession>;
    if (!parsed.token || typeof parsed.token !== "string") {
      return null;
    }
    return parsed as AuthSession;
  } catch {
    return null;
  }
}

export function saveAuthSession(session: AuthSession) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(session));
}

export function clearAuthSession() {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.removeItem(AUTH_SESSION_KEY);
}

export function loadAuthToken() {
  return loadAuthSession()?.token ?? null;
}

export function loadAuthUser() {
  return loadAuthSession()?.user ?? null;
}

export function loadAuthTenant() {
  return loadAuthSession()?.tenant ?? null;
}
