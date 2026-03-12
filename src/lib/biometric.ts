"use client";

const PLAYER_CRED_KEY = "courtflow-biometric-cred";
const PLAYER_KEY = "courtflow-biometric-player";
const STAFF_CRED_KEY = "courtflow-biometric-staff-cred";
const STAFF_KEY = "courtflow-biometric-staff";

interface StoredUser {
  id: string;
  name: string;
}

export interface BiometricAuthResult {
  success: boolean;
  userId: string | null;
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

function getStored(key: string): StoredUser | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// --- Player helpers ---

export function storeBiometricPlayer(player: { playerId: string; playerName: string; phone?: string }): void {
  localStorage.setItem(PLAYER_KEY, JSON.stringify({ id: player.playerId, name: player.playerName }));
}

export function getBiometricPlayer(): { playerId: string; playerName: string } | null {
  const s = getStored(PLAYER_KEY);
  if (!s) return null;
  return { playerId: s.id, playerName: s.name };
}

export function clearBiometricPlayer(): void {
  localStorage.removeItem(PLAYER_CRED_KEY);
  localStorage.removeItem(PLAYER_KEY);
}

// --- Staff helpers ---

export function storeBiometricStaff(staff: { staffId: string; staffName: string }): void {
  localStorage.setItem(STAFF_KEY, JSON.stringify({ id: staff.staffId, name: staff.staffName }));
}

export function getBiometricStaff(): { staffId: string; staffName: string } | null {
  const s = getStored(STAFF_KEY);
  if (!s) return null;
  return { staffId: s.id, staffName: s.name };
}

export function clearBiometricStaff(): void {
  localStorage.removeItem(STAFF_CRED_KEY);
  localStorage.removeItem(STAFF_KEY);
}

// Keep backward compat alias
export function clearBiometricData(): void {
  clearBiometricPlayer();
}

// --- Shared ---

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

export async function registerBiometric(
  userId: string,
  displayName: string,
  credKey: string,
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
          displayName,
        },
        pubKeyCredParams: [
          { type: "public-key", alg: -7 },
          { type: "public-key", alg: -257 },
        ],
        authenticatorSelection: {
          authenticatorAttachment: "platform",
          userVerification: "required",
          residentKey: "preferred",
        },
        timeout: 60000,
      },
    });

    if (credential) {
      const pkCred = credential as PublicKeyCredential;
      localStorage.setItem(credKey, arrayBufferToBase64(pkCred.rawId));
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export async function requestBiometricVerification(userId: string): Promise<boolean> {
  return registerBiometric(userId, "CourtFlow Player", PLAYER_CRED_KEY);
}

export async function registerStaffBiometric(userId: string, displayName: string): Promise<boolean> {
  return registerBiometric(userId, displayName, STAFF_CRED_KEY);
}

async function authenticateGeneric(credKey: string, userKey: string): Promise<BiometricAuthResult> {
  const fail: BiometricAuthResult = { success: false, userId: null };

  try {
    const challenge = new Uint8Array(32);
    crypto.getRandomValues(challenge);

    const credBase64 = localStorage.getItem(credKey);
    const allowCredentials: PublicKeyCredentialDescriptor[] = credBase64
      ? [{ type: "public-key", id: base64ToArrayBuffer(credBase64), transports: ["internal"] as AuthenticatorTransport[] }]
      : [];

    const credential = await navigator.credentials.get({
      publicKey: {
        challenge,
        ...(allowCredentials.length > 0 ? { allowCredentials } : {}),
        userVerification: "required",
        rpId: window.location.hostname,
        timeout: 60000,
      },
    });

    if (!credential) return fail;

    const pkCred = credential as PublicKeyCredential;
    const response = pkCred.response as AuthenticatorAssertionResponse;

    if (response.userHandle && response.userHandle.byteLength > 0) {
      const userId = new TextDecoder().decode(response.userHandle);
      return { success: true, userId };
    }

    const stored = getStored(userKey);
    return { success: true, userId: stored?.id ?? null };
  } catch {
    return fail;
  }
}

export async function authenticateWithBiometric(): Promise<BiometricAuthResult> {
  return authenticateGeneric(PLAYER_CRED_KEY, PLAYER_KEY);
}

export async function authenticateStaffBiometric(): Promise<BiometricAuthResult> {
  return authenticateGeneric(STAFF_CRED_KEY, STAFF_KEY);
}
