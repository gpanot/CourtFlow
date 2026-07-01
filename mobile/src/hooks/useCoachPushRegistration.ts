import { useEffect, useRef, useCallback } from "react";
import { Platform } from "react-native";
import { api } from "../lib/api-client";
import { useAuthStore } from "../stores/auth-store";
import { getDevicePushToken } from "./useStaffPushRegistration";

/** Last FCM token registered for the coach device — used to unregister at logout. */
let cachedCoachPushDeviceToken: string | null = null;

function dbg(msg: string, ...args: unknown[]) {
  console.log(`[CoachPush] ${msg}`, ...args);
}

/**
 * Registers the device FCM token for a coach (venueId is omitted).
 * Mirrors useStaffPushRegistration but skips the venue requirement.
 */
export function useCoachPushRegistration(pushEnabled: boolean) {
  const token = useAuthStore((s) => s.token);
  const registeredTokenRef = useRef<string | null>(null);

  const register = useCallback(async () => {
    if (!token) {
      dbg("register skipped — no JWT");
      return;
    }
    dbg("starting registration…");
    const result = await getDevicePushToken();
    if (!result.token) {
      dbg("⚠ No device token — registration aborted:", result.error);
      return;
    }
    try {
      await api.post("/api/staff/push/register", {
        token: result.token,
        // venueId intentionally omitted — server allows null for isCoach accounts
        platform: Platform.OS,
      });
      registeredTokenRef.current = result.token;
      cachedCoachPushDeviceToken = result.token;
      dbg("✓ Token registered");
    } catch (err) {
      dbg("⚠ Registration API call failed:", err);
    }
  }, [token]);

  const unregister = useCallback(async () => {
    const tok = registeredTokenRef.current;
    if (!tok) return;
    dbg("unregistering token…");
    try {
      await api.post("/api/staff/push/unregister", { token: tok });
      dbg("✓ Token unregistered");
    } catch (err) {
      dbg("unregister failed (best-effort):", err);
    }
    registeredTokenRef.current = null;
    cachedCoachPushDeviceToken = null;
  }, []);

  useEffect(() => {
    if (!token) {
      registeredTokenRef.current = null;
      return;
    }
    dbg("effect — pushEnabled:", pushEnabled, "hasToken:", !!token);
    if (pushEnabled) {
      void register();
    } else if (!pushEnabled && registeredTokenRef.current) {
      void unregister();
    }
  }, [pushEnabled, token, register, unregister]);

  return { unregister };
}

export { cachedCoachPushDeviceToken };
