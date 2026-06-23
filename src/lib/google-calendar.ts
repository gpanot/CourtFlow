/**
 * Google Calendar utilities for coach lesson sync.
 *
 * Uses the Google Calendar REST API directly (no SDK) to avoid adding
 * a large dependency. Requires GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET env vars.
 */

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const CALENDAR_API = "https://www.googleapis.com/calendar/v3";

interface TokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

async function getAccessToken(refreshToken: string): Promise<string> {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    client_secret: process.env.GOOGLE_CLIENT_SECRET!,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`[google-calendar] Token refresh failed: ${text}`);
  }

  const data = (await res.json()) as TokenResponse;
  return data.access_token;
}

interface LessonLike {
  id: string;
  startTime: Date;
  endTime: Date;
  player: { name: string };
  package?: { name: string } | null;
  note?: string | null;
}

/**
 * Create a Google Calendar event for a confirmed lesson.
 * Returns the created event ID (stored externally if you need to delete it later).
 */
export async function createCalendarEvent(
  refreshToken: string,
  calendarId: string,
  lesson: LessonLike
): Promise<string> {
  const accessToken = await getAccessToken(refreshToken);

  const summary = `Coaching – ${lesson.player.name}`;
  const description = [
    lesson.package?.name ? `Package: ${lesson.package.name}` : "",
    lesson.note ?? "",
  ]
    .filter(Boolean)
    .join("\n");

  const body = {
    summary,
    description: description || undefined,
    start: { dateTime: lesson.startTime.toISOString() },
    end: { dateTime: lesson.endTime.toISOString() },
    extendedProperties: {
      private: { courtflowLessonId: lesson.id },
    },
  };

  const url = `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`[google-calendar] Create event failed: ${text}`);
  }

  const event = (await res.json()) as { id: string };
  return event.id;
}

/**
 * Delete a Google Calendar event by its Google event ID.
 */
export async function deleteCalendarEvent(
  refreshToken: string,
  calendarId: string,
  googleEventId: string
): Promise<void> {
  const accessToken = await getAccessToken(refreshToken);
  const url = `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(googleEventId)}`;

  const res = await fetch(url, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok && res.status !== 410) {
    // 410 = already deleted; safe to ignore
    const text = await res.text();
    throw new Error(`[google-calendar] Delete event failed: ${text}`);
  }
}

interface FreeBusyResponse {
  calendars: Record<string, { busy: { start: string; end: string }[] }>;
}

/**
 * Check if a calendar has any busy blocks overlapping [start, end].
 * Returns true if the coach is busy during that window.
 */
export async function getFreeBusy(
  refreshToken: string,
  calendarId: string,
  start: Date,
  end: Date
): Promise<boolean> {
  const accessToken = await getAccessToken(refreshToken);

  const body = {
    timeMin: start.toISOString(),
    timeMax: end.toISOString(),
    items: [{ id: calendarId }],
  };

  const res = await fetch(`${CALENDAR_API}/freeBusy`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`[google-calendar] Free/busy check failed: ${text}`);
  }

  const data = (await res.json()) as FreeBusyResponse;
  const busySlots = data.calendars[calendarId]?.busy ?? [];
  return busySlots.length > 0;
}
