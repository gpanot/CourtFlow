import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";

// Root stack — handles auth gating
export type RootStackParamList = {
  AuthStack: undefined;
  MainTabs: undefined;
};

// Auth screens
export type AuthStackParamList = {
  Login: undefined;
  Signup: undefined;
  ForgotPassword: undefined;
};

// Main bottom tabs (authenticated)
export type MainTabParamList = {
  Home: undefined;
  Programs: undefined;
  MyPass: undefined;
  Profile: undefined;
};

// Screen prop helpers
export type RootStackScreenProps<T extends keyof RootStackParamList> =
  NativeStackScreenProps<RootStackParamList, T>;

export type AuthStackScreenProps<T extends keyof AuthStackParamList> =
  NativeStackScreenProps<AuthStackParamList, T>;

export type MainTabScreenProps<T extends keyof MainTabParamList> =
  BottomTabScreenProps<MainTabParamList, T>;
