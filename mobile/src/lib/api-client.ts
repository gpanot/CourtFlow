import { ENV } from "../config/env";
import { useAuthStore } from "../stores/auth-store";

const NETWORK_HINT_DEV =
  "Tips: phone must be on same Wi-Fi as the Mac; open the API URL in the device browser. " +
  "Android often blocks http:// to a LAN IP in Expo Go — try `npx expo run:android` (dev build), " +
  "or USB + `adb reverse tcp:3000 tcp:3000` and use http://127.0.0.1:3000 in EXPO_PUBLIC_API_BASE_URL. " +
  "iOS Simulator: use http://127.0.0.1:3000. If you use `npm run dev:https`, use https:// in EXPO_PUBLIC_*.";

const NETWORK_HINT_RELEASE =
  "Check your internet connection and try again. If it keeps failing, contact support.";

function networkFetchFailureMessage(baseMsg: string): string {
  const isDev = typeof __DEV__ !== "undefined" && __DEV__;
  if (isDev) {
    return `${baseMsg} (API base: ${ENV.API_BASE_URL}). ${NETWORK_HINT_DEV}`;
  }
  return `${baseMsg}. ${NETWORK_HINT_RELEASE}`;
}

export class ApiRequestError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly qualityError?: boolean;

  constructor(
    message: string,
    init: { status: number; code?: string; qualityError?: boolean }
  ) {
    super(message);
    this.name = "ApiRequestError";
    this.status = init.status;
    this.code = init.code;
    this.qualityError = init.qualityError;
  }
}

function parseErrorMessage(
  status: number,
  statusText: string,
  text: string,
  data: Record<string, unknown>
): string {
  if (typeof data.error === "string" && data.error.trim()) return data.error;
  if (typeof data.message === "string" && data.message.trim()) {
    return data.message;
  }
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();
  if (
    lower.startsWith("<!doctype html") ||
    lower.startsWith("<html") ||
    lower.includes("<meta name=\"viewport\"")
  ) {
    return "API returned an HTML page instead of JSON. The endpoint may be missing on this server or the API base URL is incorrect.";
  }
  if (trimmed.length > 0 && trimmed.length < 400) return trimmed;
  if (trimmed.length > 0) return `${trimmed.slice(0, 200)}…`;
  const st = statusText?.trim();
  if (st) return `${st} (${status})`;
  return `HTTP ${status}`;
}

async function request<T>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const token = useAuthStore.getState().token;

  let res: Response;
  try {
    res = await fetch(`${ENV.API_BASE_URL}${url}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers as Record<string, string>),
      },
    });
  } catch (e) {
    const msg =
      e instanceof Error ? e.message : "Could not reach the server";
    throw new ApiRequestError(networkFetchFailureMessage(msg), { status: 0 });
  }

  const text = await res.text();
  let data: Record<string, unknown> = {};
  if (text) {
    try {
      data = JSON.parse(text) as Record<string, unknown>;
    } catch {
      data = {};
    }
  }

  if (!res.ok) {
    const message = parseErrorMessage(
      res.status,
      res.statusText,
      text,
      data
    );
    throw new ApiRequestError(message, {
      status: res.status,
      code: typeof data.code === "string" ? data.code : undefined,
      qualityError: data.qualityError === true,
    });
  }

  return data as T;
}

async function uploadRequest<T>(url: string, formData: FormData): Promise<T> {
  const token = useAuthStore.getState().token;

  let res: Response;
  try {
    res = await fetch(`${ENV.API_BASE_URL}${url}`, {
      method: "POST",
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: formData,
    });
  } catch (e) {
    const msg =
      e instanceof Error ? e.message : "Could not reach the server";
    throw new ApiRequestError(networkFetchFailureMessage(msg), { status: 0 });
  }

  const text = await res.text();
  let data: Record<string, unknown> = {};
  if (text) {
    try {
      data = JSON.parse(text) as Record<string, unknown>;
    } catch {
      data = {};
    }
  }

  if (!res.ok) {
    const message = parseErrorMessage(
      res.status,
      res.statusText,
      text,
      data
    );
    throw new ApiRequestError(message, {
      status: res.status,
      qualityError: data.qualityError === true,
    });
  }

  return data as T;
}

export const api = {
  get: <T>(url: string, init?: RequestInit) =>
    request<T>(url, { method: "GET", ...init }),
  post: <T>(url: string, body?: unknown) =>
    request<T>(url, {
      method: "POST",
      body: body ? JSON.stringify(body) : undefined,
    }),
  patch: <T>(url: string, body: unknown) =>
    request<T>(url, { method: "PATCH", body: JSON.stringify(body) }),
  put: <T>(url: string, body: unknown) =>
    request<T>(url, { method: "PUT", body: JSON.stringify(body) }),
  delete: <T>(url: string, body?: unknown) =>
    request<T>(url, {
      method: "DELETE",
      body: body ? JSON.stringify(body) : undefined,
    }),
  upload: <T>(url: string, formData: FormData) =>
    uploadRequest<T>(url, formData),
};
