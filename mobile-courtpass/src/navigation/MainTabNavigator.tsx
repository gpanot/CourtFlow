import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { HomeScreen } from "../screens/home/HomeScreen";
import { ProgramsScreen } from "../screens/programs/ProgramsScreen";
import { MyPassScreen } from "../screens/pass/MyPassScreen";
import { ProfileScreen } from "../screens/profile/ProfileScreen";
import type { MainTabParamList } from "./types";

const Tab = createBottomTabNavigator<MainTabParamList>();

export function MainTabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#16a34a",
        tabBarInactiveTintColor: "#9ca3af",
      }}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Programs" component={ProgramsScreen} />
      <Tab.Screen name="MyPass" component={MyPassScreen} options={{ title: "My Pass" }} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}
