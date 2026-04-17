import { Audio } from "expo-av";
import { ENV } from "../config/env";
import {
  getStoredSoundId,
  SOUND_OPTIONS,
  type SoundId,
} from "./sound-options";

/**
 * Plays the staff-selected payment notification sound once (new pending or confirmed).
 */
export async function playPaymentNotificationSound(soundIdOverride?: SoundId): Promise<void> {
  const soundId = soundIdOverride ?? (await getStoredSoundId());
  const opt = SOUND_OPTIONS.find((s) => s.id === soundId);
  if (!opt) return;

  try {
    const { sound } = await Audio.Sound.createAsync(
      {
        uri: `${ENV.API_BASE_URL}/api/sounds/${encodeURIComponent(opt.fileName)}`,
      },
      { shouldPlay: true }
    );
    sound.setOnPlaybackStatusUpdate((status) => {
      if (status.isLoaded && status.didJustFinish) {
        void sound.unloadAsync();
      }
    });
  } catch {
    /* ignore */
  }
}
