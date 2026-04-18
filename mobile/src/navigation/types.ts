import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";

export type RootStackParamList = {
  Splash: undefined;
  Onboarding: undefined;
  StaffLogin: undefined;
  ContinueAs: undefined;
  StaffStack: undefined;
  TabletStack: undefined;
  AdminWebView: undefined;
};

export type StaffStackParamList = {
  VenueSelect: undefined;
  StaffTabs: undefined;
  StaffProfile: undefined;
  StaffPaymentSettings: undefined;
  StaffSubscriptions: undefined;
  StaffBossDashboard: undefined;
  StaffSessionDetail: { sessionId: string; date: string; openedAt: string; closedAt: string | null };
  BossSubscriptionDetail: { subscriptionId: string };
};

export type StaffTabParamList = {
  SessionTab: undefined;
  CheckInTab: undefined;
  PaymentTab: undefined;
};

export type TabletStackParamList = {
  TabletVenueSelect: undefined;
  TabletModeSelect: undefined;
  SelfCheckIn: undefined;
  CourtPayCheckIn: undefined;
};

export type RootStackScreenProps<T extends keyof RootStackParamList> =
  NativeStackScreenProps<RootStackParamList, T>;

export type StaffStackScreenProps<T extends keyof StaffStackParamList> =
  NativeStackScreenProps<StaffStackParamList, T>;

export type StaffTabScreenProps<T extends keyof StaffTabParamList> =
  BottomTabScreenProps<StaffTabParamList, T>;

export type TabletStackScreenProps<T extends keyof TabletStackParamList> =
  NativeStackScreenProps<TabletStackParamList, T>;
