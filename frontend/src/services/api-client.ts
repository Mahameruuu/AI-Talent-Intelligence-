import { z, type ZodType } from "zod";
import type { ApiErrorBody } from "@/types/api";
import { toQueryString, type QueryValue } from "@/utils/query-string";

const envBaseUrl: unknown = import.meta.env.VITE_API_BASE_URL;
export const API_BASE_URL: string =
  typeof envBaseUrl === "string" && envBaseUrl.trim() !== "" ? envBaseUrl.replace(/\/+$/, "") : "/api/v1/talent";

/** Error thrown for every failed API call. `status` is 0 for network failures. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }

  get isNotFound(): boolean {
    return this.status === 404;
  }

  get isNetworkError(): boolean {
    return this.status === 0;
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

export function isNotFoundError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404;
}

const apiErrorBodySchema: ZodType<ApiErrorBody> = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});

function defaultMessageForStatus(status: number): string {
  if (status === 400) return "The request was not valid.";
  if (status === 401) return "This link or token is not valid.";
  if (status === 403) return "You don't have permission to perform this action.";
  if (status === 404) return "The requested item was not found.";
  if (status === 409) return "This action conflicts with the current state.";
  if (status === 410) return "This item is no longer available.";
  if (status === 413) return "The file is too large.";
  if (status === 415) return "This file type is not supported.";
  if (status === 422) return "Some fields are not valid.";
  if (status === 429) return "Too many requests. Please wait a moment and try again.";
  if (status === 502 || status === 503 || status === 504) return "The API server is not reachable right now.";
  if (status >= 500) return "The server ran into an error. Please try again.";
  return `Request failed (HTTP ${status}).`;
}

/** Turn a non-2xx response body into an ApiError, accepting the documented ApiErrorBody shape. */
export function parseApiError(status: number, body: unknown): ApiError {
  const parsed = apiErrorBodySchema.safeParse(body);
  if (parsed.success) {
    const { code, message, details } = parsed.data.error;
    return new ApiError(status, code, message || defaultMessageForStatus(status), details);
  }
  return new ApiError(status, `http_${status}`, defaultMessageForStatus(status), body ?? undefined);
}

/** User-facing message for any thrown value. */
/** Field-level validation details from the backend: `[{field, message}]`. */
function describeValidationDetails(details: unknown): string | null {
  if (!Array.isArray(details)) return null;
  const parts = details
    .filter((item): item is { field?: unknown; message: string } =>
      typeof item === "object" && item !== null && typeof (item as { message?: unknown }).message === "string",
    )
    .slice(0, 3)
    .map((item) => {
      const field = typeof item.field === "string" && item.field ? item.field.replace(/[._]/g, " ") : "";
      return field ? `${field.charAt(0).toUpperCase()}${field.slice(1)}: ${item.message}` : item.message;
    });
  return parts.length ? parts.join("; ") : null;
}

export function getErrorMessage(error: unknown, fallback = "Something went wrong."): string {
  if (error instanceof ApiError) {
    const details = describeValidationDetails(error.details);
    return details ? `${error.message} ${details}.` : error.message;
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

export type HttpMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

export interface RequestOptions<T> {
  method?: HttpMethod;
  query?: Record<string, QueryValue>;
  /** JSON body */
  body?: unknown;
  formData?: FormData;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  /** Optional runtime validation of the success payload. */
  schema?: ZodType<T>;
}

export function buildUrl(path: string, query?: Record<string, QueryValue>): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE_URL}${normalized}${toQueryString(query)}`;
}

function parseText(text: string): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function validatePayload<T>(payload: unknown, status: number, schema?: ZodType<T>): T {
  if (!schema) return payload as T;
  const result = schema.safeParse(payload);
  if (!result.success) {
    if (import.meta.env.DEV) {
      console.error("[api] response failed validation", result.error.issues);
    }
    throw new ApiError(status, "invalid_response", "The server returned data in an unexpected format.", result.error.issues);
  }
  return result.data;
}

/**
 * There is no HR login in this app: authentication and permissions are handled by the central system
 * (the API sits behind its gateway), so requests never carry an Authorization header.
 */
function buildHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return { Accept: "application/json", ...extra };
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

export async function apiRequest<T>(path: string, options: RequestOptions<T> = {}): Promise<T> {
  const { method = "GET", query, body, formData, headers, signal, schema } = options;
  const finalHeaders = buildHeaders(headers);
  let requestBody: BodyInit | undefined;
  if (formData) {
    requestBody = formData;
  } else if (body !== undefined) {
    finalHeaders["Content-Type"] = "application/json";
    requestBody = JSON.stringify(body);
  }

  let response: Response;
  try {
    response = await fetch(buildUrl(path, query), { method, headers: finalHeaders, body: requestBody, signal });
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw new ApiError(0, "network_error", "Cannot reach the server. Check your connection and try again.");
  }

  const payload = response.status === 204 ? null : parseText(await response.text());
  if (!response.ok) throw parseApiError(response.status, payload);
  return validatePayload(payload, response.status, schema);
}

export interface UploadOptions<T> {
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
  schema?: ZodType<T>;
}

/** Multipart upload via XHR so the UI can show real upload progress. */
export function apiUpload<T>(path: string, formData: FormData, options: UploadOptions<T> = {}): Promise<T> {
  const { onProgress, signal, schema } = options;
  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", buildUrl(path));
    for (const [key, value] of Object.entries(buildHeaders())) xhr.setRequestHeader(key, value);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) onProgress(event.loaded / event.total);
    };
    xhr.onload = () => {
      const payload = parseText(xhr.responseText);
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(validatePayload(payload, xhr.status, schema));
        } catch (error) {
          reject(error instanceof Error ? error : new Error(String(error)));
        }
        return;
      }
      reject(parseApiError(xhr.status, payload));
    };
    xhr.onerror = () => reject(new ApiError(0, "network_error", "Upload failed: cannot reach the server."));
    xhr.onabort = () => reject(new DOMException("Upload cancelled", "AbortError"));
    signal?.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(formData);
  });
}

export const api = {
  get: <T>(path: string, options?: Omit<RequestOptions<T>, "method" | "body">) =>
    apiRequest<T>(path, { ...options, method: "GET" }),
  post: <T>(path: string, body?: unknown, options?: Omit<RequestOptions<T>, "method" | "body">) =>
    apiRequest<T>(path, { ...options, method: "POST", body }),
  patch: <T>(path: string, body?: unknown, options?: Omit<RequestOptions<T>, "method" | "body">) =>
    apiRequest<T>(path, { ...options, method: "PATCH", body }),
  put: <T>(path: string, body?: unknown, options?: Omit<RequestOptions<T>, "method" | "body">) =>
    apiRequest<T>(path, { ...options, method: "PUT", body }),
  delete: <T = null>(path: string, options?: Omit<RequestOptions<T>, "method" | "body">) =>
    apiRequest<T>(path, { ...options, method: "DELETE" }),
};
