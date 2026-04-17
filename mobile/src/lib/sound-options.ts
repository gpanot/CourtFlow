import * as SecureStore from "expo-secure-store";

export type SoundId =
  | "notification_chime"
  | "doorbell_notification"
  | "cash_register_purchase";

export interface SoundOption {
  id: SoundId;
  name: string;
  fileName: string;
}

export const SOUND_OPTIONS: SoundOption[] = [
  {
    id: "notification_chime",
    name: "Notification Chime",
    fileName: "202029__hykenfreak__notification-chime.mp3",
  },
  {
    id: "doorbell_notification",
    name: "Doorbell Notification",
    fileName: "415763__thebuilder15__doorbell-notification.mp3",
  },
  {
    id: "cash_register_purchase",
    name: "Cash Register Purchase",
    fileName: "209578__zott820__cash-register-purchase.mp3",
  },
];

const STORAGE_KEY = "courtflow-payment-notification-sound-id";
const LEGACY_STORAGE_KEY = "courtflow-assignment-sound-id";
const HAPTIC_STORAGE_KEY = "courtflow-payment-notification-haptics-enabled";
export const DEFAULT_SOUND_ID: SoundId = "cash_register_purchase";

function isValidSoundId(raw: string | null): raw is SoundId {
  return !!raw && SOUND_OPTIONS.some((s) => s.id === raw);
}

export async function getStoredSoundId(): Promise<SoundId> {
  try {
    const primary = await SecureStore.getItemAsync(STORAGE_KEY);
    if (isValidSoundId(primary)) return primary;

    const legacy = await SecureStore.getItemAsync(LEGACY_STORAGE_KEY);
    if (isValidSoundId(legacy)) {
      await SecureStore.setItemAsync(STORAGE_KEY, legacy).catch(() => {});
      return legacy;
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_SOUND_ID;
}

export async function setStoredSoundId(id: SoundId): Promise<void> {
  try {
    await SecureStore.setItemAsync(STORAGE_KEY, id);
  } catch {
    /* ignore */
  }
}

export async function getStoredPaymentHapticsEnabled(): Promise<boolean> {
  try {
    const raw = await SecureStore.getItemAsync(HAPTIC_STORAGE_KEY);
    return raw === "1";
  } catch {
    return false;
  }
}

export async function setStoredPaymentHapticsEnabled(enabled: boolean): Promise<void> {
  try {
    await SecureStore.setItemAsync(HAPTIC_STORAGE_KEY, enabled ? "1" : "0");
  } catch {
    /* ignore */
  }
}
