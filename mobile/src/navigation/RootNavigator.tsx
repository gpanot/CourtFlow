import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import type { RootStackParamList } from "./types";

import { SplashScreen } from "../screens/auth/SplashScreen";
import { OnboardingScreen } from "../screens/auth/OnboardingScreen";
import { StaffLoginScreen } from "../screens/auth/StaffLoginScreen";
import { ContinueAsScreen } from "../screens/auth/ContinueAsScreen";
import { StaffNavigator } from "./StaffNavigator";
import { TabletNavigator } from "./TabletNavigator";
import { AdminWebViewScreen } from "../screens/admin/AdminWebViewScreen";

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  return (
    <Stack.Navigator
      initialRouteName="Splash"
      screenOptions={{ headerShown: false, animation: "fade" }}
    >
      <Stack.Screen name="Splash" component={SplashScreen} />
      <Stack.Screen name="Onboarding" component={OnboardingScreen} />
      <Stack.Screen name="StaffLogin" component={StaffLoginScreen} />
      <Stack.Screen name="ContinueAs" component={ContinueAsScreen} />
      <Stack.Screen name="StaffStack" component={StaffNavigator} />
      <Stack.Screen name="TabletStack" component={TabletNavigator} />
      <Stack.Screen name="AdminWebView" component={AdminWebViewScreen} />
    </Stack.Navigator>
  );
}
