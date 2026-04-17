import { useEffect, useRef, useCallback } from "react";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { api } from "../lib/api-client";
import { useAuthStore } from "../stores/auth-store";

async function getDevicePushToken(): Promise<string | null> {
  if (!Device.isDevice) {
    console.warn("[Push] Must use physical device for push notifications");
    return null;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== "granted") return null;

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("courtpay_payments", {
      name: "Payment Notifications",
      importance: Notifications.AndroidImportance.HIGH,
      sound: "default",
      vibrationPattern: [0, 200, 100, 200],
    });
  }

  const projectId = Constants.expoConfig?.extra?.eas?.projectId;

  try {
    const tokenObj = await Notifications.getDevicePushTokenAsync();
    return tokenObj.data;
  } catch {
    if (projectId) {
      const tokenObj = await Notifications.getExpoPushTokenAsync({ projectId });
      return tokenObj.data;
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
    if (!venueId || !token) return;
    try {
      const deviceToken = await getDevicePushToken();
      if (!deviceToken) return;

      await api.post("/api/staff/push/register", {
        token: deviceToken,
        venueId,
        platform: Platform.OS,
      });
      registeredTokenRef.current = deviceToken;
    } catch (err) {
      console.warn("[Push] Registration failed:", err);
    }
  }, [venueId, token]);

  const unregister = useCallback(async () => {
    if (!registeredTokenRef.current) return;
    try {
      await api.post("/api/staff/push/unregister", {
        token: registeredTokenRef.current,
      });
    } catch {
      // best-effort
    }
    registeredTokenRef.current = null;
  }, []);

  useEffect(() => {
    if (pushEnabled && venueId && token) {
      void register();
    } else if (!pushEnabled && registeredTokenRef.current) {
      void unregister();
    }
  }, [pushEnabled, venueId, token, register, unregister]);

  return { unregister };
}
