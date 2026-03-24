"use client";

import { useSessionStore } from "@/stores/session-store";

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

export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function getNotificationPermission(): NotificationPermission | "unsupported" {
  if (!isPushSupported()) return "unsupported";
  return Notification.permission;
}

export type PushSubscribeResult =
  | { ok: true }
  | { ok: false; reason: "unsupported" | "denied" | "dismissed" | "no-vapid" | "sw-timeout" | "subscribe-failed" | "server-error" };

export async function subscribeToPush(playerId: string): Promise<PushSubscribeResult> {
  if (!isPushSupported()) return { ok: false, reason: "unsupported" };

  try {
    // Only prompt when needed. A second requestPermission() right after the user taps Allow
    // can resolve incorrectly on iOS Safari / installed PWA (false "denied" while push still works).
    let permission: NotificationPermission = Notification.permission;
    if (permission !== "granted") {
      permission = await Notification.requestPermission();
    }
    if (permission === "denied") return { ok: false, reason: "denied" };
    if (permission !== "granted") return { ok: false, reason: "dismissed" };

    let vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

    if (!vapidKey) {
      try {
        const res = await fetch("/api/push/vapid-public-key");
        if (res.ok) {
          const data = await res.json();
          vapidKey = data.vapidKey;
        }
      } catch (err) {
        console.error("Failed to fetch dynamic VAPID key:", err);
      }
    }

    if (!vapidKey) {
      console.error("[Push] VAPID public key is not set globally or via API");
      return { ok: false, reason: "no-vapid" };
    }

    const swPromise = navigator.serviceWorker.ready;
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("SW timeout")), 5000)
    );

    let registration: ServiceWorkerRegistration;
    try {
      registration = await Promise.race([swPromise, timeout]);
    } catch {
      console.error("[Push] Service worker not ready within 5s");
      return { ok: false, reason: "sw-timeout" };
    }

    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      try {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidKey),
        });
      } catch (err) {
        console.error("[Push] pushManager.subscribe failed:", err);
        return { ok: false, reason: "subscribe-failed" };
      }
    }

    const subJson = subscription.toJSON();
    const token = useSessionStore.getState().token;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };

    const res = await fetch("/api/push/subscribe", {
      method: "POST",
      headers,
      body: JSON.stringify({
        playerId,
        endpoint: subJson.endpoint,
        p256dh: subJson.keys?.p256dh,
        auth: subJson.keys?.auth,
      }),
    });

    if (!res.ok) {
      console.error("[Push] Server subscribe failed:", res.status);
      return { ok: false, reason: "server-error" };
    }

    await fetch(`/api/players/${playerId}/notifications`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ notificationsEnabled: true }),
    });

    return { ok: true };
  } catch (err) {
    console.error("[Push] Subscribe failed:", err);
    return { ok: false, reason: "subscribe-failed" };
  }
}

export async function unsubscribeFromPush(): Promise<boolean> {
  if (!isPushSupported()) return false;

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return true;

    const token = useSessionStore.getState().token;

    await fetch("/api/push/unsubscribe", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    });

    await subscription.unsubscribe();
    return true;
  } catch (err) {
    console.error("[Push] Unsubscribe failed:", err);
    return false;
  }
}
