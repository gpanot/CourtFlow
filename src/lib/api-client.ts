"use client";

import { useSessionStore } from "@/stores/session-store";

const BASE = "";

export class ApiRequestError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly waitingCount?: number;
  readonly suggestAutofill?: boolean;

  constructor(
    message: string,
    init: {
      status: number;
      code?: string;
      waitingCount?: number;
      suggestAutofill?: boolean;
    }
  ) {
    super(message);
    this.name = "ApiRequestError";
    this.status = init.status;
    this.code = init.code;
    this.waitingCount = init.waitingCount;
    this.suggestAutofill = init.suggestAutofill;
  }
}

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const token = typeof window !== "undefined"
    ? useSessionStore.getState().token
    : null;

  const res = await fetch(`${BASE}${url}`, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  let data: Record<string, unknown> = {};
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    try {
      data = (await res.json()) as Record<string, unknown>;
    } catch {
      data = {};
    }
  }

  if (!res.ok) {
    const message = typeof data.error === "string" ? data.error : res.statusText || "Request failed";
    throw new ApiRequestError(message, {
      status: res.status,
      code: typeof data.code === "string" ? data.code : undefined,
      waitingCount: typeof data.waitingCount === "number" ? data.waitingCount : undefined,
      suggestAutofill: typeof data.suggestAutofill === "boolean" ? data.suggestAutofill : undefined,
    });
  }
  return data as T;
}

export const api = {
  get: <T>(url: string) => request<T>(url),
  post: <T>(url: string, body?: unknown) =>
    request<T>(url, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  put: <T>(url: string, body: unknown) =>
    request<T>(url, { method: "PUT", body: JSON.stringify(body) }),
  patch: <T>(url: string, body: unknown) =>
    request<T>(url, { method: "PATCH", body: JSON.stringify(body) }),
  delete: <T>(url: string, body?: unknown) =>
    request<T>(url, { method: "DELETE", body: body ? JSON.stringify(body) : undefined }),
};
