/**
 * CourtFlow MCP Server — coach availability + booking tools.
 *
 * Exposes five tools over the MCP Streamable HTTP transport:
 *   Read-only:
 *     - check_coach_availability
 *     - list_available_coaches
 *     - get_default_package_for_coach
 *   Write:
 *     - create_player_account
 *     - create_coach_lesson
 *
 * Mounted by server.ts at POST /mcp (stateless, one transport per request).
 * Protected by a Bearer token check using MCP_SERVER_SECRET.
 * No business logic here — this file only calls the existing lib functions.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import {
  isCoachAvailable,
  findNextAvailableSlot,
  findAvailableCoachesForSport,
} from "./src/lib/coach-availability";
import { toDateKey, parseDateKey } from "./src/lib/date";
import { createPhonePlayer } from "./src/lib/player-signup";
import { createCoachLesson, getDefaultPackageForCoach } from "./src/lib/coach-lesson";
import { createMagicLoginToken } from "./src/lib/player-magic-link";

// ---------------------------------------------------------------------------
// Timezone helper — all times are serialized in Asia/Ho_Chi_Minh (UTC+7).
// Vietnam does not observe DST so the offset is always +07:00.
// ---------------------------------------------------------------------------

function toVietnamISO(date: Date): string {
  const VN_OFFSET_MS = 7 * 60 * 60_000;
  const local = new Date(date.getTime() + VN_OFFSET_MS);
  return local.toISOString().replace("Z", "+07:00");
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

/**
 * Returns "ok" if the request carries the correct bearer token,
 * "missing_secret" if MCP_SERVER_SECRET is not configured in the environment,
 * or "unauthorized" if the token is wrong or absent.
 *
 * Fails closed: an unconfigured secret is treated as a server-side error, not
 * a pass-through. This mirrors the SePay webhook auth pattern.
 */
function checkAuth(req: IncomingMessage): "ok" | "missing_secret" | "unauthorized" {
  const secret = process.env.MCP_SERVER_SECRET;
  if (!secret) return "missing_secret";
  const auth = req.headers["authorization"] ?? "";
  return auth === `Bearer ${secret}` ? "ok" : "unauthorized";
}

// ---------------------------------------------------------------------------
// Tool handler factory — builds a fresh McpServer + transport per request.
// Stateless mode: no session ID, safe for Railway's serverless-style restarts.
// ---------------------------------------------------------------------------

function buildMcpServer(): McpServer {
  const server = new McpServer({
    name: "courtflow-availability",
    version: "1.0.0",
  });

  // ── Tool 1: check_coach_availability ───────────────────────────────────────
  server.tool(
    "check_coach_availability",
    "Check whether a coach is available for a given time slot and return the next open slot if not.",
    {
      coachId: z.string().describe("StaffMember ID of the coach"),
      date: z.string().describe("Date in YYYY-MM-DD format (local venue time)"),
      startTime: z.string().describe("ISO 8601 datetime string for the slot start"),
      endTime: z.string().describe("ISO 8601 datetime string for the slot end"),
      venueId: z.string().describe("Venue ID (used by findNextAvailableSlot for booking config)"),
    },
    async ({ coachId, date, startTime, endTime, venueId }) => {
      const dateObj = parseDateKey(date);
      const startObj = new Date(startTime);
      const endObj = new Date(endTime);

      const avail = await isCoachAvailable(coachId, dateObj, startObj, endObj);

      let nextAvailableSlot: { date: string; startTime: string; endTime: string } | null = null;

      if (!avail.available) {
        // Derive duration from the requested slot; use 60 min as fallback.
        const durationMin = Math.round((endObj.getTime() - startObj.getTime()) / 60_000) || 60;
        const next = await findNextAvailableSlot(coachId, dateObj, durationMin);
        if (next) {
          nextAvailableSlot = {
            date: toDateKey(next.date),
            startTime: toVietnamISO(next.startTime),
            endTime: toVietnamISO(next.endTime),
          };
        }
      }

      // Silence unused-variable warning — venueId is accepted so callers can
      // pass it for future use (e.g. per-venue booking hours) without breaking
      // the API contract, but the current lib functions derive hours from DB.
      void venueId;

      const result = {
        available: avail.available,
        ...(avail.reason ? { reason: avail.reason } : {}),
        ...(nextAvailableSlot ? { nextAvailableSlot } : {}),
      };

      return {
        content: [{ type: "text" as const, text: JSON.stringify(result) }],
      };
    }
  );

  // ── Tool 2: list_available_coaches ─────────────────────────────────────────
  server.tool(
    "list_available_coaches",
    "List coaches at a venue who teach a given sport, sorted by soonest availability.",
    {
      sport: z.string().describe("Sport name to match against coach specialties (case-insensitive substring match)"),
      venueId: z.string().describe("Venue ID"),
      date: z.string().optional().describe("Optional date in YYYY-MM-DD format to check availability on"),
      timeWindow: z
        .object({
          startHour: z.number().int().min(0).max(23),
          endHour: z.number().int().min(1).max(24),
        })
        .optional()
        .describe("Optional hour window to check on the given date (requires date)"),
      limit: z.number().int().min(1).max(20).optional().describe("Max coaches to return (default 3)"),
    },
    async ({ sport, venueId, date, timeWindow, limit }) => {
      const coaches = await findAvailableCoachesForSport(venueId, sport, {
        date: date ? parseDateKey(date) : undefined,
        timeWindow,
        limit,
      });

      // Serialize Date objects in nextAvailableSlot to ISO strings for transport
      const serialized = coaches.map((c) => ({
        coachId: c.coachId,
        coachName: c.coachName,
        specialization: c.specialization,
        hourlyRate: c.hourlyRate,
        nextAvailableSlot: c.nextAvailableSlot
          ? {
              date: toDateKey(c.nextAvailableSlot.date),
              startTime: toVietnamISO(c.nextAvailableSlot.startTime),
              endTime: toVietnamISO(c.nextAvailableSlot.endTime),
            }
          : null,
      }));

      return {
        content: [{ type: "text" as const, text: JSON.stringify(serialized) }],
      };
    }
  );

  // ── Tool 3: get_default_package_for_coach ──────────────────────────────────
  server.tool(
    "get_default_package_for_coach",
    "Return the default single-session package for a coach at a venue. Call this before create_coach_lesson whenever the agent only knows coachId — never ask the player for a package ID.",
    {
      coachId: z.string().describe("StaffMember ID of the coach"),
      venueId: z.string().describe("Venue ID"),
    },
    async ({ coachId, venueId }) => {
      const pkg = await getDefaultPackageForCoach(coachId, venueId);

      if (!pkg) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ package: null, error: "No active packages found for this coach" }) }],
        };
      }

      return {
        content: [{ type: "text" as const, text: JSON.stringify({ package: pkg }) }],
      };
    }
  );

  // ── Tool 4: create_player_account ──────────────────────────────────────────
  server.tool(
    "create_player_account",
    "Find or create a player account using phone + email. Creates a complete CourtPass account (Player row + email credentials) so the player can log in later. Returns playerId immediately — a random internal password is generated server-side, the player never sets one. If an account for this phone or email already exists, returns the existing playerId with created: false.",
    {
      name: z.string().min(2).describe("Player's full name (minimum 2 characters)"),
      phone: z.string().min(8).describe("Player's phone number (digits and optional spaces, minimum 8 digits)"),
      email: z.string().email().describe("Player's email address — used as the CourtPass login identifier"),
      venueId: z.string().describe("Venue ID to register the player against"),
    },
    async ({ name, phone, email, venueId }) => {
      const result = await createPhonePlayer(name, phone, email, venueId);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result) }],
      };
    }
  );

  // ── Tool 5: create_coach_lesson ────────────────────────────────────────────
  server.tool(
    "create_coach_lesson",
    "Book a coach lesson for a player. Use get_default_package_for_coach first to resolve packageId if you only have coachId. Returns lesson details plus VietQR payment info (VietQR path) or paidWithCredit=true (credit path).",
    {
      playerId: z.string().describe("Player ID returned by create_player_account"),
      coachId: z.string().describe("StaffMember ID of the coach"),
      packageId: z.string().describe("CoachPackage ID — use get_default_package_for_coach if unknown"),
      date: z.string().describe("Date in YYYY-MM-DD format (local venue time)"),
      startTime: z.string().describe("ISO 8601 datetime string for the lesson start"),
      venueId: z.string().describe("Venue ID"),
      slotCount: z.number().int().min(1).max(4).optional().describe("Number of consecutive slots (default 1)"),
      payWithCredit: z.boolean().optional().describe("Set true to deduct from an existing credit package"),
      creditId: z.string().optional().describe("PlayerCoachCredit ID — required when payWithCredit is true"),
      playerCount: z.number().int().min(2).optional().describe("Number of players — required for scalable group packages"),
    },
    async ({ playerId, coachId, packageId, date, startTime, venueId, slotCount, payWithCredit, creditId, playerCount }) => {
      const result = await createCoachLesson(playerId, {
        coachId,
        packageId,
        date,
        startTime,
        venueId,
        slotCount,
        payWithCredit,
        creditId,
        playerCount,
      });

      // Serialize any Date objects that may be present in the lesson record
      const serialized = JSON.parse(JSON.stringify(result, (_key, value) => {
        if (value instanceof Date) return value.toISOString();
        return value;
      }));

      return {
        content: [{ type: "text" as const, text: JSON.stringify(serialized) }],
      };
    }
  );

  // ── Tool 6: generate_login_link ────────────────────────────────────────────
  server.tool(
    "generate_login_link",
    "Generate a one-time magic login URL for a player. Call this after create_coach_lesson succeeds and include the URL in the booking confirmation. The link is valid for 5 minutes and single-use — the player must click it right away to view their booking.",
    {
      playerId: z.string().describe("Player ID returned by create_player_account"),
      venueId: z.string().describe("Venue ID"),
    },
    async ({ playerId, venueId }) => {
      void venueId;
      const { url } = await createMagicLoginToken(playerId);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ url, expiresInSeconds: 300, singleUse: true }),
          },
        ],
      };
    }
  );

  return server;
}

// ---------------------------------------------------------------------------
// Request handler — called by server.ts for every POST /mcp request
// ---------------------------------------------------------------------------

export async function handleMcpRequest(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  const authResult = checkAuth(req);
  if (authResult === "missing_secret") {
    console.error(
      "[MCP] MCP_SERVER_SECRET is not set — rejecting request to prevent unauthenticated access"
    );
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "MCP server is not configured (missing secret)" }));
    return;
  }
  if (authResult === "unauthorized") {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Unauthorized" }));
    return;
  }

  const mcpServer = buildMcpServer();

  // Stateless transport: a fresh transport is created for each request so no
  // session state accumulates between calls. Safe for Railway's ephemeral
  // container model and trivially horizontally scalable.
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  await mcpServer.connect(transport);

  // Collect the raw body before handing off to the transport
  const body = await new Promise<string>((resolve, reject) => {
    let data = "";
    req.on("data", (chunk: Buffer) => { data += chunk.toString(); });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });

  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(body);
  } catch {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Invalid JSON body" }));
    await transport.close();
    return;
  }

  await transport.handleRequest(req, res, parsedBody);
}
