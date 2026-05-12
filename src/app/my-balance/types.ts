export interface VenueInfo {
  id: string;
  name: string;
}

export interface BalanceData {
  found: boolean;
  venueName: string;
  playerName: string;
  phone?: string;
  venues?: VenueInfo[];
  subscription: {
    packageName: string;
    sessionsTotal: number | null;
    sessionsRemaining: number | null;
    sessionsUsed: number;
    expiresAt: string;
    daysRemaining: number;
    isUnlimited: boolean;
    isExpiringSoon: boolean;
  } | null;
  lastCheckIn: string | null;
  totalSessions: number;
}

export interface IdentifyResult {
  found: boolean;
  playerName?: string;
  phone?: string;
  venues?: VenueInfo[];
  venueName?: string;
  subscription?: BalanceData["subscription"];
  lastCheckIn?: string | null;
  totalSessions?: number;
}

export interface StickerData {
  playerId: string;
  playerName: string;
  stickers: string[];
  price: number;
  isPaid: boolean;
}
