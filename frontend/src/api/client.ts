const BASE = import.meta.env.VITE_API_URL ?? "/api";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
  }
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (res.status === 204) return undefined as T;
  const data = await res.json();
  if (!res.ok) {
    const err = data?.error ?? {};
    throw new ApiError(res.status, err.code ?? "UNKNOWN", err.message ?? res.statusText, err.details);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string) =>
    fetch(`${BASE}${path}`).then((r) => handleResponse<T>(r)),

  post: <T>(path: string, body: unknown) =>
    fetch(`${BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then((r) => handleResponse<T>(r)),

  put: <T>(path: string, body: unknown) =>
    fetch(`${BASE}${path}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then((r) => handleResponse<T>(r)),

  delete: <T>(path: string) =>
    fetch(`${BASE}${path}`, { method: "DELETE" }).then((r) => handleResponse<T>(r)),

  postRaw: (path: string, body: BodyInit, headers?: HeadersInit) =>
    fetch(`${BASE}${path}`, { method: "POST", headers, body }),
};
