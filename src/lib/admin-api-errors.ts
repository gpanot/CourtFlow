import type { TFunction } from "i18next";

const KNOWN_ERROR_KEYS: Record<string, string> = {
  "Manager or super admin access required": "common.managerOrSuperAdminRequired",
  "Super admin access required": "common.superAdminRequired",
  "Access denied to this venue": "common.accessDeniedVenue",
};

/** Map known API error strings to admin i18n keys for alert() dialogs. */
export function translateAdminApiError(message: string, t: TFunction): string {
  const key = KNOWN_ERROR_KEYS[message];
  return key ? t(key) : message;
}
