import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function fmtICS(iso: string): string {
  // Convert ISO string to iCal YYYYMMDDTHHMMSSZ format
  return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function escapeICS(str: string): string {
  return str.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const title = searchParams.get("title") ?? "Coaching Lesson";
  const start = searchParams.get("start");
  const end = searchParams.get("end");
  const location = searchParams.get("location") ?? "";
  const ref = searchParams.get("ref") ?? "";

  if (!start || !end) {
    return new NextResponse("Missing start or end", { status: 400 });
  }

  const uid = `${ref || Date.now()}@courtflow`;
  const now = fmtICS(new Date().toISOString());

  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//CourtFlow//CourtFlow//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${now}`,
    `DTSTART:${fmtICS(start)}`,
    `DTEND:${fmtICS(end)}`,
    `SUMMARY:${escapeICS(decodeURIComponent(title))}`,
    ...(location ? [`LOCATION:${escapeICS(decodeURIComponent(location))}`] : []),
    ...(ref ? [`DESCRIPTION:Booking ref: ${escapeICS(ref)}`] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  const filename = `courtflow-${ref || "lesson"}.ics`;

  return new NextResponse(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
