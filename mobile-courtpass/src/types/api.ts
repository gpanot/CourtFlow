// CourtPass Player-facing API types
// These are contracts with the CourtFlow backend API.
// Extend as endpoints are implemented.

export interface Player {
  id: string;
  name: string;
  email: string;
  phone?: string;
  avatarUrl?: string;
}

export interface AuthLoginResponse {
  token: string;
  player: Player;
}

export interface CourtPassProgram {
  id: string;
  name: string;
  description?: string;
  venueId: string;
  venueName: string;
  startDate: string;
  endDate: string;
  maxEnrollments?: number;
  enrolledCount: number;
}

export interface CourtPassEnrollment {
  id: string;
  programId: string;
  program: CourtPassProgram;
  enrolledAt: string;
  status: "active" | "expired" | "cancelled";
  sessionsUsed: number;
  sessionsTotal?: number;
}

export interface ApiErrorBody {
  error: string;
}
