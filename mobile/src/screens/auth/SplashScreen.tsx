import React, { useEffect } from "react";
import { View, Text, ActivityIndicator, StyleSheet } from "react-native";
import { useAuthStore } from "../../stores/auth-store";
import { usePinStore } from "../../stores/pin-store";
import { C } from "../../theme/colors";
import type { RootStackScreenProps } from "../../navigation/types";

export function SplashScreen({
  navigation,
}: RootStackScreenProps<"Splash">) {
  const hydrate = useAuthStore((s) => s.hydrate);
  const hydrated = useAuthStore((s) => s.hydrated);
  const hydratePin = usePinStore((s) => s.hydrate);
  const token = useAuthStore((s) => s.token);
  const onboardingSeen = useAuthStore((s) => s.onboardingSeen);
  const venueId = useAuthStore((s) => s.venueId);

  useEffect(() => {
    hydrate();
    hydratePin();
  }, [hydrate, hydratePin]);

  useEffect(() => {
    if (!hydrated) return;

    const timer = setTimeout(() => {
      if (!onboardingSeen) {
        navigation.replace("Onboarding");
      } else if (!token) {
        navigation.replace("StaffLogin");
      } else if (venueId) {
        navigation.replace("ContinueAs");
      } else {
        navigation.replace("ContinueAs");
      }
    }, 800);

    return () => clearTimeout(timer);
  }, [hydrated, token, onboardingSeen, venueId, navigation]);

  return (
    <View style={styles.container}>
      <Text style={styles.brand}>CourtPay</Text>
      <Text style={styles.tagline}>Check-in & Payment</Text>
      <ActivityIndicator
        size="large"
        color={C.blue500}
        style={styles.spinner}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.bg,
    justifyContent: "center",
    alignItems: "center",
  },
  brand: {
    fontSize: 42,
    fontWeight: "800",
    color: C.text,
    letterSpacing: 1,
  },
  tagline: {
    fontSize: 16,
    color: C.muted,
    marginTop: 8,
  },
  spinner: {
    marginTop: 48,
  },
});
