import React, { useEffect } from "react";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { api } from "../lib/api-client";
import { useAuthStore } from "../stores/auth-store";
import { useCoachPushRegistration } from "../hooks/useCoachPushRegistration";

/**
 * Mount inside CoachPortalNavigator to:
 * 1. Sync the server-side pushNotificationsEnabled flag.
 * 2. Create the "coach_lessons" notification channel (Android).
 * 3. Keep FCM registration in sync via useCoachPushRegistration.
 */
export function CoachPushBootstrap({ children }: { children: React.ReactNode }) {
  const authToken = useAuthStore((s) => s.token);
  const pushEnabled = useAuthStore((s) => s.pushNotificationsEnabled);
  const setAuth = useAuthStore((s) => s.setAuth);

  // Create notification channel for coach lesson events
  useEffect(() => {
    if (Platform.OS !== "android") return;
    void Notifications.setNotificationChannelAsync("coach_lessons", {
      name: "Lesson Notifications",
      importance: Notifications.AndroidImportance.HIGH,
      sound: "default",
      vibrationPattern: [0, 200, 100, 200],
    });
  }, []);

  // Sync push preference from server
  useEffect(() => {
    if (!authToken) return;
    let cancelled = false;
    api
      .get<{ pushNotificationsEnabled: boolean }>("/api/auth/staff-me")
      .then((data) => {
        if (!cancelled && typeof data.pushNotificationsEnabled === "boolean") {
          setAuth({ pushNotificationsEnabled: data.pushNotificationsEnabled });
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [authToken, setAuth]);

  useCoachPushRegistration(pushEnabled);

  return <>{children}</>;
}
