import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import type { CoachPortalStackParamList } from "./types";
import { CoachPortalScreen } from "../screens/coach/CoachPortalScreen";
import { CoachLessonsScreen } from "../screens/coach/CoachLessonsScreen";
import { CoachAvailabilityScreen } from "../screens/coach/CoachAvailabilityScreen";
import { useTabletKioskLocale } from "../hooks/useTabletKioskLocale";
import { useAppColors } from "../theme/use-app-colors";

const Stack = createNativeStackNavigator<CoachPortalStackParamList>();

export function CoachPortalNavigator() {
  const { t } = useTabletKioskLocale();
  const theme = useAppColors();
  const headerStyle = {
    backgroundColor: theme.bg,
  };
  const headerTintColor = theme.text;

  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle,
        headerTintColor,
        headerTitleStyle: { color: theme.text },
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen
        name="CoachPortal"
        component={CoachPortalScreen}
        options={{ title: t("coachPortalTitle") }}
      />
      <Stack.Screen
        name="CoachLessons"
        component={CoachLessonsScreen}
        options={{ title: t("coachPortalMyLessons"), headerBackTitle: "" }}
      />
      <Stack.Screen
        name="CoachAvailability"
        component={CoachAvailabilityScreen}
        options={{ title: t("coachPortalMyAvailability"), headerBackTitle: "" }}
      />
    </Stack.Navigator>
  );
}
