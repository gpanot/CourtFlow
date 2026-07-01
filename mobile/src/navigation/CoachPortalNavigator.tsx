import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import type { CoachPortalStackParamList } from "./types";
import { CoachPortalScreen } from "../screens/coach/CoachPortalScreen";
import { CoachProfileScreen } from "../screens/coach/CoachProfileScreen";
import { CoachPushBootstrap } from "../components/CoachPushBootstrap";

const Stack = createNativeStackNavigator<CoachPortalStackParamList>();

export function CoachPortalNavigator() {
  return (
    <CoachPushBootstrap>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="CoachPortal" component={CoachPortalScreen} />
        <Stack.Screen
          name="CoachProfile"
          component={CoachProfileScreen}
          options={{ presentation: "fullScreenModal" }}
        />
      </Stack.Navigator>
    </CoachPushBootstrap>
  );
}
