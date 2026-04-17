import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import type { TabletStackParamList } from "./types";

import { TabletVenueSelectScreen } from "../screens/tablet/TabletVenueSelectScreen";
import { TabletModeSelectScreen } from "../screens/tablet/TabletModeSelectScreen";
import { SelfCheckInScreen } from "../screens/tablet/SelfCheckInScreen";
import { CourtPayCheckInScreen } from "../screens/tablet/CourtPayCheckInScreen";

const Stack = createNativeStackNavigator<TabletStackParamList>();

export function TabletNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen
        name="TabletVenueSelect"
        component={TabletVenueSelectScreen}
      />
      <Stack.Screen
        name="TabletModeSelect"
        component={TabletModeSelectScreen}
      />
      <Stack.Screen name="SelfCheckIn" component={SelfCheckInScreen} />
      <Stack.Screen name="CourtPayCheckIn" component={CourtPayCheckInScreen} />
    </Stack.Navigator>
  );
}
