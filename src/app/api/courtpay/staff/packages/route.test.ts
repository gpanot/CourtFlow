import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockRequireStaff, mockPrisma } = vi.hoisted(() => {
  return {
    mockRequireStaff: vi.fn(),
    mockPrisma: {
      subscriptionPackage: {
        count: vi.fn(),
        create: vi.fn(),
        findMany: vi.fn(),
      },
    },
  };
});

vi.mock("@/lib/auth", () => ({
  requireStaff: mockRequireStaff,
}));

vi.mock("@/lib/db", () => ({
  prisma: mockPrisma,
}));

import { GET, POST } from "./route";

const BASE_URL = "http://localhost/api/courtpay/staff/packages";

function makePostReq(body: Record<string, unknown>) {
  return new Request(BASE_URL, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("GET /api/courtpay/staff/packages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 when venueId is missing", async () => {
    mockRequireStaff.mockReturnValue({ id: "staff-1", venueId: undefined });

    const req = new Request(`${BASE_URL}`, { method: "GET" });
    const res = await GET(req);
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "venueId required" });
  });

  it("returns packages for the staff member's venue", async () => {
    mockRequireStaff.mockReturnValue({ id: "staff-1", venueId: "venue-1" });
    const mockPackages = [
      {
        id: "p1",
        name: "Morning Pass",
        sessions: 10,
        durationDays: 30,
        price: 500000,
        validDays: "Mon,Tue,Wed,Thu,Fri",
        timeStart: "07:00",
        timeEnd: "09:00",
        _count: { subscriptions: 2 },
      },
    ];
    mockPrisma.subscriptionPackage.findMany.mockResolvedValue(mockPackages);

    const req = new Request(`${BASE_URL}`, { method: "GET" });
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.packages).toHaveLength(1);
    expect(body.packages[0].validDays).toBe("Mon,Tue,Wed,Thu,Fri");
  });
});

describe("POST /api/courtpay/staff/packages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 when required field 'name' is missing", async () => {
    mockRequireStaff.mockReturnValue({ id: "staff-1", venueId: "venue-1" });
    mockPrisma.subscriptionPackage.count.mockResolvedValue(0);

    const req = makePostReq({
      venueId: "venue-1",
      durationDays: 30,
      price: 500000,
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "name, durationDays, and price are required",
    });
  });

  it("creates a package with day and time restrictions", async () => {
    mockRequireStaff.mockReturnValue({ id: "staff-1", venueId: "venue-1" });
    mockPrisma.subscriptionPackage.count.mockResolvedValue(0);
    const created = {
      id: "p-new",
      venueId: "venue-1",
      name: "Morning Pass",
      sessions: 10,
      durationDays: 90,
      price: 900000,
      validDays: "Mon,Tue,Wed,Thu,Fri",
      timeStart: "09:00",
      timeEnd: "10:00",
      fixedStartDate: null,
      fixedEndDate: null,
      notes: "Weekday mornings only",
    };
    mockPrisma.subscriptionPackage.create.mockResolvedValue(created);

    const req = makePostReq({
      venueId: "venue-1",
      name: "Morning Pass",
      sessions: 10,
      durationDays: 90,
      price: 900000,
      validDays: "Mon,Tue,Wed,Thu,Fri",
      timeStart: "09:00",
      timeEnd: "10:00",
      notes: "Weekday mornings only",
    });

    const res = await POST(req);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.package.validDays).toBe("Mon,Tue,Wed,Thu,Fri");
    expect(body.package.timeStart).toBe("09:00");
    expect(body.package.timeEnd).toBe("10:00");
    expect(body.package.notes).toBe("Weekday mornings only");

    expect(mockPrisma.subscriptionPackage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          venueId: "venue-1",
          name: "Morning Pass",
          validDays: "Mon,Tue,Wed,Thu,Fri",
          timeStart: "09:00",
          timeEnd: "10:00",
          notes: "Weekday mornings only",
        }),
      })
    );
  });

  it("creates a package with a fixed date range", async () => {
    mockRequireStaff.mockReturnValue({ id: "staff-1", venueId: "venue-1" });
    mockPrisma.subscriptionPackage.count.mockResolvedValue(0);
    const fixedStart = new Date("2026-07-01T12:00:00+07:00");
    const fixedEnd = new Date("2026-12-31T12:00:00+07:00");
    const created = {
      id: "p-fixed",
      venueId: "venue-1",
      name: "Half-Year Unlimited",
      sessions: null,
      durationDays: 30,
      price: 5000000,
      validDays: null,
      timeStart: null,
      timeEnd: null,
      fixedStartDate: fixedStart,
      fixedEndDate: fixedEnd,
      notes: null,
    };
    mockPrisma.subscriptionPackage.create.mockResolvedValue(created);

    const req = makePostReq({
      venueId: "venue-1",
      name: "Half-Year Unlimited",
      sessions: null,
      durationDays: 30,
      price: 5000000,
      fixedStartDate: "2026-07-01",
      fixedEndDate: "2026-12-31",
    });

    const res = await POST(req);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.package.name).toBe("Half-Year Unlimited");
    expect(body.package.fixedStartDate).toBeDefined();
    expect(body.package.fixedEndDate).toBeDefined();

    // The API should have converted the date strings to noon-local Date objects
    const call = mockPrisma.subscriptionPackage.create.mock.calls[0][0];
    expect(call.data.fixedStartDate).toBeInstanceOf(Date);
    expect(call.data.fixedEndDate).toBeInstanceOf(Date);
  });

  it("returns 409 when the package limit (10) is reached", async () => {
    mockRequireStaff.mockReturnValue({ id: "staff-1", venueId: "venue-1" });
    mockPrisma.subscriptionPackage.count.mockResolvedValue(10);

    const req = makePostReq({
      venueId: "venue-1",
      name: "Extra Package",
      durationDays: 30,
      price: 100000,
    });

    const res = await POST(req);
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({
      error: "Maximum 10 active packages allowed",
    });
  });

  it("creates an all-day, anytime package with no restrictions (null fields)", async () => {
    mockRequireStaff.mockReturnValue({ id: "staff-1", venueId: "venue-1" });
    mockPrisma.subscriptionPackage.count.mockResolvedValue(0);
    const created = {
      id: "p-all",
      venueId: "venue-1",
      name: "Unlimited All-Access",
      sessions: null,
      durationDays: 30,
      price: 2000000,
      validDays: null,
      timeStart: null,
      timeEnd: null,
      fixedStartDate: null,
      fixedEndDate: null,
      notes: null,
    };
    mockPrisma.subscriptionPackage.create.mockResolvedValue(created);

    const req = makePostReq({
      venueId: "venue-1",
      name: "Unlimited All-Access",
      durationDays: 30,
      price: 2000000,
    });

    const res = await POST(req);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.package.validDays).toBeNull();
    expect(body.package.timeStart).toBeNull();
    expect(body.package.fixedEndDate).toBeNull();
  });
});
