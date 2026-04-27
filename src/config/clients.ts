/**
 * PWA client feature configuration. Production uses runtime selection from staff
 * venue `appAccess` (see use-client-config). `NEXT_PUBLIC_CLIENT_ID` is for local overrides only.
 */

import type { StaffAppAccessKind } from "@/lib/staff-app-access";

export type StaffLegacyPanelId = "courts" | "checkin" | "queue" | "qr" | "payment" | "profile";

/** Keys used in componentMap.ts */
export type StaffDashboardComponentName =
  | "SessionCourtFlow"
  | "SessionCourtPay"
  | "CheckInCourtFlow"
  | "CheckInCourtPay"
  | "CourtsCourtFlow"
  | "QueueCourtFlow"
  | "RotationCourtFlow"
  | "PaymentCourtPay"
  | "QrCourtFlow"
  | "ProfileCourtPay";

export interface ClientConfig {
  name: string;
  venueId: string;
  primaryColor: string;
  tabs: readonly string[];
  components: Record<string, StaffDashboardComponentName>;
  legacyPanelByTab: Record<string, StaffLegacyPanelId>;
}

const clientConfigsDefinition = {
  courtflow_default: {
    name: "CourtFlow",
    venueId: "xxx",
    primaryColor: "#B8F200",
    tabs: ["session", "checkin", "courts", "queue", "rotation"],
    components: {
      session: "SessionCourtFlow",
      checkin: "CheckInCourtFlow",
      courts: "CourtsCourtFlow",
      queue: "QueueCourtFlow",
      rotation: "RotationCourtFlow",
    },
    legacyPanelByTab: {
      session: "courts",
      checkin: "checkin",
      courts: "courts",
      queue: "queue",
      rotation: "queue",
    },
  },
  courtpay_client2: {
    name: "CourtPay",
    venueId: "yyy",
    primaryColor: "#534AB7",
    tabs: ["session", "checkin", "payment"],
    components: {
      session: "SessionCourtPay",
      checkin: "CheckInCourtPay",
      payment: "PaymentCourtPay",
    },
    legacyPanelByTab: {
      session: "courts",
      checkin: "checkin",
      payment: "payment",
    },
  },
} as const satisfies Record<"courtflow_default" | "courtpay_client2", ClientConfig>;

export type ClientId = keyof typeof clientConfigsDefinition;

export const clientConfigs: Record<ClientId, ClientConfig> = clientConfigsDefinition;

export const DEFAULT_CLIENT_ID: ClientId = "courtflow_default";

/** localStorage key for staff-selected PWA client (set after login / app picker). */
export const SELECTED_CLIENT_STORAGE_KEY = "courtflow-selected-client";

export function mapAppAccessKindToClientId(kind: StaffAppAccessKind): ClientId {
  return kind === "courtpay" ? "courtpay_client2" : "courtflow_default";
}

export function clientIdAllowedForAppAccess(clientId: ClientId, access: StaffAppAccessKind[]): boolean {
  const allowed = new Set(access.map(mapAppAccessKindToClientId));
  return allowed.has(clientId);
}

export function readStoredRuntimeClientId(): ClientId | null {
  if (typeof window === "undefined") return null;
  try {
    const v = localStorage.getItem(SELECTED_CLIENT_STORAGE_KEY);
    if (v && v in clientConfigs) return v as ClientId;
  } catch {
    /* private mode / SSR */
  }
  return null;
}

/** Staff profile route (avatar / back navigation). */
export function staffProfileHomeHref(): string {
  return "/staff/profile";
}

export function resolveClientId(raw: string | undefined): ClientId {
  if (raw && raw in clientConfigs) return raw as ClientId;
  return DEFAULT_CLIENT_ID;
}

/**
 * Effective client id: runtime staff selection → env (local dev) → default.
 */
export function resolveEffectiveClientId(): ClientId {
  const stored = readStoredRuntimeClientId();
  if (stored) return stored;
  const envRaw =
    typeof process !== "undefined" && process.env.NEXT_PUBLIC_CLIENT_ID
      ? process.env.NEXT_PUBLIC_CLIENT_ID
      : undefined;
  const fromEnv = resolveClientId(envRaw);
  if (typeof process !== "undefined" && envRaw && fromEnv === DEFAULT_CLIENT_ID && envRaw !== DEFAULT_CLIENT_ID) {
    console.warn(`[CourtFlow] Unknown NEXT_PUBLIC_CLIENT_ID "${envRaw}", using ${DEFAULT_CLIENT_ID}`);
  }
  return fromEnv;
}

export function getResolvedClientConfig(): ClientConfig {
  const id = resolveEffectiveClientId();
  return clientConfigs[id];
}
