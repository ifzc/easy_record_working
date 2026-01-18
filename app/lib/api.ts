import { loadAuthToken } from "./auth";

type ApiRequestOptions = {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
};

export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:5253";

function buildUrl(path: string) {
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }
  return `${API_BASE}${path}`;
}

export async function apiJson<T>(path: string, options: ApiRequestOptions = {}) {
  const token = loadAuthToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers ?? {}),
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(buildUrl(path), {
    method: options.method ?? "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }

  if (!response.ok) {
    const message =
      (payload && typeof payload.message === "string" && payload.message) ||
      `请求失败(${response.status})`;
    throw new Error(message);
  }

  if (
    payload &&
    typeof payload === "object" &&
    "code" in payload &&
    typeof (payload as { code: number }).code === "number" &&
    (payload as { code: number }).code !== 0
  ) {
    const message =
      (payload as { message?: string }).message ?? "请求失败";
    throw new Error(message);
  }

  return payload as T;
}

export async function apiBlob(path: string, options: ApiRequestOptions = {}) {
  const token = loadAuthToken();
  const headers: Record<string, string> = {
    ...(options.headers ?? {}),
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(buildUrl(path), {
    method: options.method ?? "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    throw new Error(`请求失败(${response.status})`);
  }

  return response.blob();
}
