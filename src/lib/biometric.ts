"use client";

const CREDENTIAL_KEY = "courtflow-biometric-cred";
const PLAYER_KEY = "courtflow-biometric-player";

interface StoredPlayer {
  playerId: string;
  playerName: string;
  phone: string;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

export function storeBiometricPlayer(player: StoredPlayer): void {
  localStorage.setItem(PLAYER_KEY, JSON.stringify(player));
}

export function getBiometricPlayer(): StoredPlayer | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(PLAYER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function hasBiometricCredential(): boolean {
  if (typeof window === "undefined") return false;
  return !!localStorage.getItem(CREDENTIAL_KEY) && !!localStorage.getItem(PLAYER_KEY);
}

export function clearBiometricData(): void {
  localStorage.removeItem(CREDENTIAL_KEY);
  localStorage.removeItem(PLAYER_KEY);
}

export async function isBiometricSupported(): Promise<boolean> {
  if (
    typeof window === "undefined" ||
    !window.PublicKeyCredential ||
    typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable !==
      "function"
  ) {
    return false;
  }
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

export async function requestBiometricVerification(
  userId: string
): Promise<boolean> {
  try {
    const challenge = new Uint8Array(32);
    crypto.getRandomValues(challenge);

    const credential = await navigator.credentials.create({
      publicKey: {
        challenge,
        rp: { name: "CourtFlow", id: window.location.hostname },
        user: {
          id: new TextEncoder().encode(userId),
          name: userId,
          displayName: "CourtFlow Player",
        },
        pubKeyCredParams: [
          { type: "public-key", alg: -7 },
          { type: "public-key", alg: -257 },
        ],
        authenticatorSelection: {
          authenticatorAttachment: "platform",
          userVerification: "required",
        },
        timeout: 60000,
      },
    });

    if (credential) {
      const pkCred = credential as PublicKeyCredential;
      localStorage.setItem(CREDENTIAL_KEY, arrayBufferToBase64(pkCred.rawId));
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export async function authenticateWithBiometric(): Promise<boolean> {
  const credBase64 = localStorage.getItem(CREDENTIAL_KEY);
  if (!credBase64) return false;

  try {
    const challenge = new Uint8Array(32);
    crypto.getRandomValues(challenge);

    const credential = await navigator.credentials.get({
      publicKey: {
        challenge,
        allowCredentials: [
          {
            type: "public-key",
            id: base64ToArrayBuffer(credBase64),
            transports: ["internal"],
          },
        ],
        userVerification: "required",
        timeout: 60000,
      },
    });

    return !!credential;
  } catch {
    return false;
  }
}
