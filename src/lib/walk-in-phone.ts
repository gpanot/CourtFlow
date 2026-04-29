export function isWalkInSyntheticPhone(raw: string | null | undefined): boolean {
  const value = (raw ?? "").trim();
  return value.endsWith("+");
}

export function isLegacyWalkInPhone(raw: string | null | undefined): boolean {
  const value = (raw ?? "").trim().toLowerCase();
  return value.startsWith("walkin:");
}

export function isAnyWalkInPhone(raw: string | null | undefined): boolean {
  return isWalkInSyntheticPhone(raw) || isLegacyWalkInPhone(raw);
}

/**
 * Generates synthetic walk-in phone in the requested format.
 * Example: "1714369145123+"
 */
export function generateWalkInSyntheticPhone(): string {
  return `${Date.now()}+`;
}
