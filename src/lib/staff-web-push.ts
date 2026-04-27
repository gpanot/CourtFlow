"use client";

import { api } from "@/lib/api-client";
import { isPushSupported, getNotificationPermission } from "@/lib/push-client";

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray.buffer as ArrayBuffer;
}

async function getVapidPublicKey(): Promise<string | null> {
  let vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (vapidKey) return vapidKey;
  try {
    const res = await fetch("/api/push/vapid-public-key");
    if (!res.ok) return null;
    const data = (await res.json()) as { vapidKey?: string };
    return data.vapidKey ?? null;
  } catch {
    return null;
  }
}

/**
 * Ensures a Web Push subscription exists and registers its endpoint as `token`
 * with `/api/staff/push/register` (same table as native FCM tokens).
 */
export async function registerStaffWebPush(venueId: string): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!isPushSupported()) return { ok: false, message: "Push not supported in this browser." };

  let permission = getNotificationPermission();
  if (permission === "unsupported") return { ok: false, message: "Notifications unsupported." };
  if (permission !== "granted") {
    permission = await Notification.requestPermission();
  }
  if (permission === "denied") return { ok: false, message: "Notification permission denied." };
  if (permission !== "granted") return { ok: false, message: "Notification permission was not granted." };

  const vapidKey = await getVapidPublicKey();
  if (!vapidKey) return { ok: false, message: "Push is not configured (missing VAPID key)." };

  let registration: ServiceWorkerRegistration;
  try {
    registration = await navigator.serviceWorker.ready;
  } catch {
    return { ok: false, message: "Service worker is not ready yet." };
  }

  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    try {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not subscribe to push.";
      return { ok: false, message: msg };
    }
  }

  const endpoint = subscription.endpoint;
  if (!endpoint?.trim()) return { ok: false, message: "No push subscription endpoint." };

  try {
    await api.post("/api/staff/push/register", {
      token: endpoint,
      venueId,
      platform: "web",
    });
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Registration failed.";
    return { ok: false, message: msg };
  }
}

export async function unregisterStaffWebPush(): Promise<void> {
  if (!isPushSupported()) return;
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return;
    const endpoint = subscription.endpoint;
    try {
      await api.post("/api/staff/push/unregister", { token: endpoint });
    } catch {
      /* best-effort */
    }
    await subscription.unsubscribe().catch(() => {});
  } catch {
    /* noop */
  }
}
