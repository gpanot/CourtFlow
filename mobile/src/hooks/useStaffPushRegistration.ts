import { useEffect, useRef, useCallback } from "react";
import { Platform, NativeModules } from "react-native";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { api } from "../lib/api-client";
import { useAuthStore } from "../stores/auth-store";

const IS_EXPO_GO = Constants.appOwnership === "expo";

const MAX_RETRIES = 5;
const INITIAL_DELAY_MS = 2_000;

function dbg(msg: string, ...args: unknown[]) {
  console.log(`[Push] ${msg}`, ...args);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export interface PushTokenResult {
  token: string | null;
  error: string | null;
  debug: string[];
}

export async function getDevicePushToken(): Promise<PushTokenResult> {
  const debug: string[] = [];
  const log = (msg: string) => {
    dbg(msg);
    debug.push(msg);
  };

  log(`Device: ${Device.manufacturer} ${Device.modelName} (Android ${Device.osVersion})`);
  log(`isDevice: ${Device.isDevice}, OS: ${Platform.OS}`);
  log(`appOwnership: ${Constants.appOwnership ?? "null (standalone)"}`);
  log(`executionEnv: ${Constants.executionEnvironment}`);

  if (IS_EXPO_GO) {
    const msg = "Expo Go — FCM not supported.";
    log(msg);
    return { token: null, error: msg, debug };
  }

  // Check Google Play Services availability via native module
  try {
    const gps = NativeModules.RNGooglePlayServicesAvailability;
    if (gps) {
      log(`Google Play Services module found`);
    } else {
      log("No RNGooglePlayServicesAvailability module (expected in Expo)");
    }
  } catch {
    log("Could not check Google Play Services module");
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  log(`Permission status: ${existingStatus}`);

  let finalStatus = existingStatus;
  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
    log(`Permission after request: ${finalStatus}`);
  }

  if (finalStatus !== "granted") {
    const msg = "Notification permission denied.";
    log(msg);
    return { token: null, error: msg, debug };
  }

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("courtpay_payments", {
      name: "Payment Notifications",
      importance: Notifications.AndroidImportance.HIGH,
      sound: "default",
      vibrationPattern: [0, 200, 100, 200],
    });
    log("Notification channel created");
  }

  // Retry loop — SERVICE_NOT_AVAILABLE is transient after fresh install
  let lastErr = "";
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      log(`getDevicePushTokenAsync() attempt ${attempt}/${MAX_RETRIES}…`);
      const tokenObj = await Notifications.getDevicePushTokenAsync();
      log(`✓ FCM token: ${tokenObj.data.slice(0, 30)}…`);
      return { token: tokenObj.data, error: null, debug };
    } catch (err: unknown) {
      lastErr = err instanceof Error ? err.message : String(err);
      log(`✗ Attempt ${attempt} failed: ${lastErr}`);

      const isRetryable =
        lastErr.includes("SERVICE_NOT_AVAILABLE") ||
        lastErr.includes("INTERNAL_ERROR") ||
        lastErr.includes("TOO_MANY_REGISTRATIONS");

      if (!isRetryable || attempt === MAX_RETRIES) break;

      const delayMs = INITIAL_DELAY_MS * Math.pow(2, attempt - 1);
      log(`  Retrying in ${delayMs / 1000}s…`);
      await sleep(delayMs);
    }
  }

  return { token: null, error: `FCM failed after ${MAX_RETRIES} attempts: ${lastErr}`, debug };
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
    const result = await getDevicePushToken();
    if (!result.token) {
      dbg("⚠ No device token — registration aborted:", result.error);
      return;
    }
    try {
      await api.post("/api/staff/push/register", {
        token: result.token,
        venueId,
        platform: Platform.OS,
      });
      registeredTokenRef.current = result.token;
      dbg("✓ Token registered with backend");
    } catch (err) {
      dbg("⚠ Registration API call failed:", err);
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
