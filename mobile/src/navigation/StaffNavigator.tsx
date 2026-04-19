import React, { useMemo } from "react";
import { View } from "react-native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createMaterialTopTabNavigator } from "@react-navigation/material-top-tabs";
import type { StaffStackParamList, StaffTabParamList } from "./types";

import { VenueSelectScreen } from "../screens/staff/VenueSelectScreen";
import { SessionTabScreen } from "../screens/staff/SessionTabScreen";
import { CheckInTabScreen } from "../screens/staff/CheckInTabScreen";
import { PaymentTabScreen } from "../screens/staff/PaymentTabScreen";
import { StaffProfileScreen } from "../screens/staff/StaffProfileScreen";
import { StaffSubscriptionsScreen } from "../screens/staff/StaffSubscriptionsScreen";
import { StaffBossDashboardScreen } from "../screens/staff/StaffBossDashboardScreen";
import { StaffDashboardScreen } from "../screens/staff/StaffDashboardScreen";
import { StaffSessionHistoryScreen } from "../screens/staff/StaffSessionHistoryScreen";
import { StaffPaymentSettingsScreen } from "../screens/staff/StaffPaymentSettingsScreen";
import { SessionDetailScreen } from "../screens/staff/SessionDetailScreen";
import { BossSubscriptionDetailScreen } from "../screens/staff/BossSubscriptionDetailScreen";
import { StaffBillingWeekPaymentsScreen } from "../screens/staff/StaffBillingWeekPaymentsScreen";
import { StaffDashboardHeader } from "../components/StaffDashboardHeader";
import { useAppColors } from "../theme/use-app-colors";
import { useAuthStore } from "../stores/auth-store";
import { usePaymentNotificationSound } from "../hooks/usePaymentNotificationSound";

const Stack = createNativeStackNavigator<StaffStackParamList>();
const Tab = createMaterialTopTabNavigator<StaffTabParamList>();

function StaffTabs() {
  const venueId = useAuthStore((s) => s.venueId);
  usePaymentNotificationSound(venueId);
  const theme = useAppColors();
  const tabOptions = useMemo(
    () => ({
      tabBarActiveTintColor: theme.text,
      tabBarInactiveTintColor: theme.muted,
      tabBarIndicatorStyle: {
        backgroundColor: theme.blue500,
        height: 2,
      },
      tabBarStyle: {
        backgroundColor: theme.bg,
        borderBottomColor: theme.border,
        borderBottomWidth: 1,
        elevation: 0,
        shadowOpacity: 0,
      },
      tabBarLabelStyle: {
        fontSize: 13,
        fontWeight: "600" as const,
        textTransform: "none" as const,
      },
    }),
    [theme]
  );

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <StaffDashboardHeader />
      <Tab.Navigator screenOptions={tabOptions}>
        <Tab.Screen
          name="SessionTab"
          component={SessionTabScreen}
          options={{ tabBarLabel: "Session" }}
        />
        <Tab.Screen
          name="CheckInTab"
          component={CheckInTabScreen}
          options={{ tabBarLabel: "Check-in" }}
        />
        <Tab.Screen
          name="PaymentTab"
          component={PaymentTabScreen}
          options={{ tabBarLabel: "Payment" }}
        />
      </Tab.Navigator>
    </View>
  );
}

export function StaffNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="VenueSelect" component={VenueSelectScreen} />
      <Stack.Screen name="StaffTabs" component={StaffTabs} />
      <Stack.Screen
        name="StaffProfile"
        component={StaffProfileScreen}
        options={{ headerShown: true, title: "Profile" }}
      />
      <Stack.Screen
        name="StaffPaymentSettings"
        component={StaffPaymentSettingsScreen}
        options={{ headerShown: true, title: "Payment Settings" }}
      />
      <Stack.Screen
        name="StaffSessionDetail"
        component={SessionDetailScreen}
        options={{ headerShown: true, title: "Session Details", headerBackTitle: "" }}
      />
      <Stack.Screen
        name="StaffSubscriptions"
        component={StaffSubscriptionsScreen}
        options={{ headerShown: true }}
      />
      <Stack.Screen
        name="StaffDashboard"
        component={StaffDashboardScreen}
        options={{ headerShown: true }}
      />
      <Stack.Screen
        name="StaffBossDashboard"
        component={StaffBossDashboardScreen}
        options={{ headerShown: true }}
      />
      <Stack.Screen
        name="StaffSessionHistory"
        component={StaffSessionHistoryScreen}
        options={{ headerShown: true }}
      />
      <Stack.Screen
        name="StaffBillingWeekPayments"
        component={StaffBillingWeekPaymentsScreen}
        options={{ headerShown: true, headerBackTitle: "" }}
      />
      <Stack.Screen
        name="BossSubscriptionDetail"
        component={BossSubscriptionDetailScreen}
        options={{ headerShown: true }}
      />
    </Stack.Navigator>
  );
}
