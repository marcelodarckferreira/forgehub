/**
 * Shared fetch wrapper for all backend calls.
 *
 * Convention: every backend resource is mounted at
 *   /api/v1/<resource>   (hyphenated, plural, matching the FastAPI router prefix)
 *
 * Example: GET /api/v1/product-versions, POST /api/v1/planning-items
 *
 * Domain hooks (src/hooks/use<Domain>.ts) should call apiClient.get/post/etc.
 * with that exact path -- do not hardcode the base URL or prepend extra
 * segments elsewhere.
 */

const BASE_URL =
  (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:8000";

export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

type RequestOptions = Omit<RequestInit, "body"> & {
  body?: unknown;
  /** Override or add query params: { page: 1, search: "x" } */
  params?: Record<string, string | number | boolean | undefined>;
};

function buildUrl(path: string, params?: RequestOptions["params"]) {
  const url = new URL(path.replace(/^\//, ""), BASE_URL.endsWith("/") ? BASE_URL : `${BASE_URL}/`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, params, headers, ...rest } = options;

  const res = await fetch(buildUrl(path, params), {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    let parsedBody: unknown = undefined;
    try {
      parsedBody = await res.json();
    } catch {
      // response had no JSON body
    }
    throw new ApiError(`Request to ${path} failed with status ${res.status}`, res.status, parsedBody);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return (await res.json()) as T;
}

/** POST multipart/form-data (file uploads) -- bypasses the JSON request()
 * helper since fetch must set its own multipart boundary header. */
async function postForm<T>(path: string, formData: FormData, params?: RequestOptions["params"]): Promise<T> {
  const res = await fetch(buildUrl(path, params), { method: "POST", body: formData });

  if (!res.ok) {
    let parsedBody: unknown = undefined;
    try {
      parsedBody = await res.json();
    } catch {
      // response had no JSON body
    }
    throw new ApiError(`Request to ${path} failed with status ${res.status}`, res.status, parsedBody);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return (await res.json()) as T;
}

export const apiClient = {
  get: <T>(path: string, options?: RequestOptions) => request<T>(path, { ...options, method: "GET" }),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: "POST", body }),
  postForm,
  put: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: "PUT", body }),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: "PATCH", body }),
  delete: <T>(path: string, options?: RequestOptions) => request<T>(path, { ...options, method: "DELETE" }),
};
