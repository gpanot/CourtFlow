import React, { useEffect } from "react";
import { api } from "../lib/api-client";
import { useAuthStore } from "../stores/auth-store";
import { useStaffPushRegistration } from "../hooks/useStaffPushRegistration";

/**
 * Loads push preference from the API and keeps FCM registration in sync with the
 * selected venue whenever staff are logged in (staff tablet + phone flows).
 */
export function StaffPushBootstrap({ children }: { children: React.ReactNode }) {
  const authToken = useAuthStore((s) => s.token);
  const pushEnabled = useAuthStore((s) => s.pushNotificationsEnabled);
  const setAuth = useAuthStore((s) => s.setAuth);

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

  useStaffPushRegistration(pushEnabled);

  return <>{children}</>;
}
