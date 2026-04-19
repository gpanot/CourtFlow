import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma, mockRequireSuperAdmin } = vi.hoisted(() => ({
  mockPrisma: {
    billingConfig: {
      findUnique: vi.fn(),
      create: vi.fn(),
      upsert: vi.fn(),
    },
  },
  mockRequireSuperAdmin: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/auth", () => ({
  requireSuperAdmin: mockRequireSuperAdmin,
  requireStaff: vi.fn(),
}));

import { GET, PUT } from "./config/route";

const DEFAULT_CONFIG = {
  id: "default",
  bankBin: "970436",
  bankAccount: "1234567890",
  bankOwner: "NGUYEN VAN A",
  defaultBaseRate: 5000,
  defaultSubAddon: 1000,
  defaultSepayAddon: 1000,
};

describe("GET /api/admin/billing/config", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when auth fails", async () => {
    mockRequireSuperAdmin.mockImplementation(() => {
      throw new Error("No access token");
    });

    const req = new Request("http://localhost/api/admin/billing/config");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns existing config", async () => {
    mockRequireSuperAdmin.mockReturnValue(undefined);
    mockPrisma.billingConfig.findUnique.mockResolvedValue(DEFAULT_CONFIG);

    const req = new Request("http://localhost/api/admin/billing/config");
    const res = await GET(req);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      bankBin: "970436",
      defaultBaseRate: 5000,
    });
    expect(mockPrisma.billingConfig.create).not.toHaveBeenCalled();
  });

  it("auto-creates default config when none exists", async () => {
    mockRequireSuperAdmin.mockReturnValue(undefined);
    mockPrisma.billingConfig.findUnique.mockResolvedValue(null);
    mockPrisma.billingConfig.create.mockResolvedValue({
      id: "default",
      bankBin: "",
      bankAccount: "",
      bankOwner: "",
      defaultBaseRate: 5000,
      defaultSubAddon: 1000,
      defaultSepayAddon: 1000,
    });

    const req = new Request("http://localhost/api/admin/billing/config");
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(mockPrisma.billingConfig.create).toHaveBeenCalledWith({
      data: { id: "default" },
    });
  });
});

describe("PUT /api/admin/billing/config", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when auth fails", async () => {
    mockRequireSuperAdmin.mockImplementation(() => {
      throw new Error("No access token");
    });

    const req = new Request("http://localhost/api/admin/billing/config", {
      method: "PUT",
      body: JSON.stringify({ bankBin: "970436" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await PUT(req);
    expect(res.status).toBe(401);
  });

  it("persists all billing config fields", async () => {
    mockRequireSuperAdmin.mockReturnValue(undefined);
    mockPrisma.billingConfig.upsert.mockResolvedValue(DEFAULT_CONFIG);

    const req = new Request("http://localhost/api/admin/billing/config", {
      method: "PUT",
      body: JSON.stringify({
        bankBin: "970436",
        bankAccount: "1234567890",
        bankOwner: "NGUYEN VAN A",
        defaultBaseRate: 5000,
        defaultSubAddon: 1000,
        defaultSepayAddon: 1000,
      }),
      headers: { "Content-Type": "application/json" },
    });

    const res = await PUT(req);
    expect(res.status).toBe(200);

    const upsertCall = mockPrisma.billingConfig.upsert.mock.calls[0][0];
    expect(upsertCall.where).toEqual({ id: "default" });
    expect(upsertCall.create).toMatchObject({
      bankBin: "970436",
      bankAccount: "1234567890",
      defaultBaseRate: 5000,
    });
    expect(upsertCall.update).toMatchObject({
      bankBin: "970436",
      defaultBaseRate: 5000,
    });
  });

  it("only updates provided fields (partial update)", async () => {
    mockRequireSuperAdmin.mockReturnValue(undefined);
    mockPrisma.billingConfig.upsert.mockResolvedValue(DEFAULT_CONFIG);

    const req = new Request("http://localhost/api/admin/billing/config", {
      method: "PUT",
      body: JSON.stringify({ defaultBaseRate: 8000 }),
      headers: { "Content-Type": "application/json" },
    });

    await PUT(req);

    const upsertCall = mockPrisma.billingConfig.upsert.mock.calls[0][0];
    // Only defaultBaseRate should be in the update object
    expect(upsertCall.update).toEqual({ defaultBaseRate: 8000 });
    expect(upsertCall.update.bankBin).toBeUndefined();
  });
});
