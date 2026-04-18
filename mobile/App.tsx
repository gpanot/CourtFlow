import React, { useEffect, useRef } from "react";
import { StatusBar } from "expo-status-bar";
import {
  NavigationContainer,
  NavigationContainerRef,
} from "@react-navigation/native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import * as Notifications from "expo-notifications";
import { RootNavigator } from "./src/navigation/RootNavigator";
import { useThemeStore } from "./src/stores/theme-store";
import { useAuthStore } from "./src/stores/auth-store";
import { ENV } from "./src/config/env";
import type { RootStackParamList } from "./src/navigation/types";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/** Fire-and-forget API call using the stored staff auth token. */
async function callStaffApi(path: string, body: Record<string, string>) {
  const token = useAuthStore.getState().token;
  if (!token) return;
  try {
    await fetch(`${ENV.API_BASE_URL}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
  } catch {
    // Best-effort — staff can always act from within the app
  }
}

export default function App() {
  const mode = useThemeStore((s) => s.mode);
  const navigationRef = useRef<NavigationContainerRef<RootStackParamList>>(null);

  useEffect(() => {
    void useThemeStore.getState().hydrate();
  }, []);

  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const data = response.notification.request.content.data as
          | Record<string, string>
          | undefined;
        const actionId = response.actionIdentifier;
        const pendingPaymentId = data?.pendingPaymentId;

        // Action button: Confirm — calls the staff confirm endpoint without opening the app
        if (actionId === "confirm_payment" && pendingPaymentId && pendingPaymentId !== "test") {
          void callStaffApi("/api/staff/confirm-payment", { pendingPaymentId });
          return;
        }

        // Action button: Cancel — calls the staff cancel endpoint without opening the app
        if (actionId === "cancel_payment" && pendingPaymentId && pendingPaymentId !== "test") {
          void callStaffApi("/api/staff/cancel-payment", { pendingPaymentId });
          return;
        }

        // Default tap (no action button) → navigate to PaymentTab
        if (data?.screen === "PaymentTab") {
          const nav = navigationRef.current;
          if (!nav?.isReady()) return;
          nav.navigate(
            "StaffStack" as never,
            {
              screen: "StaffTabs",
              params: { screen: "PaymentTab" },
            } as never
          );
        }
      }
    );
    return () => sub.remove();
  }, []);

  return (
    <SafeAreaProvider>
      <NavigationContainer ref={navigationRef}>
        <StatusBar style={mode === "dark" ? "light" : "dark"} />
        <RootNavigator />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
