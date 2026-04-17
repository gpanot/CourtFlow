import { useEffect, useRef, useCallback } from "react";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { api } from "../lib/api-client";
import { useAuthStore } from "../stores/auth-store";

// Expo Go removes remote push since SDK 53. A dev build (expo-dev-client) is required.
const IS_EXPO_GO = Constants.appOwnership === "expo";

// ── debug helper ─────────────────────────────────────────────────────────────
function dbg(msg: string, ...args: unknown[]) {
  console.log(`[Push] ${msg}`, ...args);
}
// ─────────────────────────────────────────────────────────────────────────────

export async function getDevicePushToken(): Promise<string | null> {
  dbg("isDevice:", Device.isDevice, "OS:", Platform.OS, "isExpoGo:", IS_EXPO_GO);

  if (IS_EXPO_GO) {
    dbg("⚠ Running in Expo Go — remote push (FCM) is NOT supported since SDK 53.");
    dbg("  → Build a dev client: cd mobile && npx expo run:android");
    return null;
  }

  if (!Device.isDevice) {
    dbg("⚠ Not a physical device — FCM tokens unavailable in emulators/simulators");
    return null;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  dbg("existing permission status:", existingStatus);

  let finalStatus = existingStatus;
  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
    dbg("permission after request:", finalStatus);
  }

  if (finalStatus !== "granted") {
    dbg("⚠ Permission denied — cannot get push token");
    return null;
  }

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("courtpay_payments", {
      name: "Payment Notifications",
      importance: Notifications.AndroidImportance.HIGH,
      sound: "default",
      vibrationPattern: [0, 200, 100, 200],
    });
    dbg("Android notification channel ensured");
  }

  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  dbg("EAS projectId from config:", projectId ?? "(not set — using native FCM token)");

  try {
    const tokenObj = await Notifications.getDevicePushTokenAsync();
    dbg("✓ native FCM token obtained:", tokenObj.data.slice(0, 20) + "…");
    return tokenObj.data;
  } catch (nativeErr) {
    dbg("native token failed:", nativeErr);
    if (projectId) {
      try {
        const tokenObj = await Notifications.getExpoPushTokenAsync({ projectId });
        dbg("✓ Expo push token obtained:", tokenObj.data);
        return tokenObj.data;
      } catch (expoErr) {
        dbg("Expo push token also failed:", expoErr);
      }
    }
    return null;
  }
}

/**
 * Registers the device FCM token with the backend when push is enabled,
 * and unregisters when disabled or on logout.
 */
export function useStaffPushRegistration(pushEnabled: boolean) {
  const venueId = useAuthStore((s) => s.venueId);
  const token = useAuthStore((s) => s.token);
  const registeredTokenRef = useRef<string | null>(null);

  const register = useCallback(async () => {
    if (!venueId || !token) {
      dbg("register skipped — venueId or token missing");
      return;
    }
    dbg("starting registration for venueId:", venueId);
    try {
      const deviceToken = await getDevicePushToken();
      if (!deviceToken) {
        dbg("⚠ No device token — registration aborted");
        return;
      }

      await api.post("/api/staff/push/register", {
        token: deviceToken,
        venueId,
        platform: Platform.OS,
      });
      registeredTokenRef.current = deviceToken;
      dbg("✓ Token registered with backend");
    } catch (err) {
      dbg("⚠ Registration failed:", err);
    }
  }, [venueId, token]);

  const unregister = useCallback(async () => {
    if (!registeredTokenRef.current) return;
    dbg("unregistering token…");
    try {
      await api.post("/api/staff/push/unregister", {
        token: registeredTokenRef.current,
      });
      dbg("✓ Token unregistered");
    } catch (err) {
      dbg("unregister failed (best-effort):", err);
    }
    registeredTokenRef.current = null;
  }, []);

  useEffect(() => {
    dbg("effect — pushEnabled:", pushEnabled, "venueId:", venueId, "hasToken:", !!token);
    if (pushEnabled && venueId && token) {
      void register();
    } else if (!pushEnabled && registeredTokenRef.current) {
      void unregister();
    }
  }, [pushEnabled, venueId, token, register, unregister]);

  return { unregister };
}
