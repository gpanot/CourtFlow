/** @vitest-environment jsdom */

import { forwardRef, useImperativeHandle } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockApiGet, mockApiPost, mockFetch } = vi.hoisted(() => ({
  mockApiGet: vi.fn(),
  mockApiPost: vi.fn(),
  mockFetch: vi.fn(),
}));

vi.mock("@/lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-client")>();
  return {
    ...actual,
    api: {
      get: mockApiGet,
      post: mockApiPost,
    },
  };
});

vi.mock("@/hooks/use-success-chime", () => ({
  useSuccessChime: () => ({
    unlockChime: vi.fn(),
    playSuccessChime: vi.fn(),
  }),
}));

vi.mock("@/hooks/use-socket", () => ({
  useSocket: () => ({
    on: vi.fn(() => vi.fn()),
    emit: vi.fn(),
  }),
}));

vi.mock("@/lib/socket-client", () => ({
  joinVenue: vi.fn(),
}));

vi.mock("@/components/camera-capture", () => {
  const MockCameraCapture = forwardRef<
    { startCamera: () => Promise<boolean>; stopCamera: () => void; captureFrame: () => string | null },
    { className?: string; videoClassName?: string }
  >(function MockCameraCapture(props, ref) {
    useImperativeHandle(ref, () => ({
      startCamera: async () => true,
      stopCamera: () => undefined,
      captureFrame: () => "mock-face-image",
    }));
    return (
      <div className={props.className}>
        <div className={props.videoClassName}>Mock Camera</div>
      </div>
    );
  });

  return {
    CameraCapture: MockCameraCapture,
  };
});

import { CourtPayKiosk } from "./CourtPayKiosk";

describe("CourtPayKiosk UI flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockApiGet.mockResolvedValue({
      name: "CourtPay Arena",
      logoUrl: null,
      settings: {},
    });

    mockApiPost.mockImplementation(async (url: string, body?: Record<string, unknown>) => {
      if (url === "/api/courtpay/check-face") {
        return { existing: false };
      }

      if (url === "/api/courtpay/register") {
        return {
          playerId: "cp-player-1",
          playerName: "Alice",
          pendingPaymentId: "pp-1",
          amount: 150000,
          vietQR: "https://img.vietqr.io/image/mock.png",
          paymentRef: "CF-SES-ABC123",
        };
      }

      throw new Error(`Unexpected api.post call: ${url} ${JSON.stringify(body)}`);
    });

    mockFetch.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes("/api/courtpay/packages/")) {
        return new Response(
          JSON.stringify({
            packages: [
              {
                id: "pkg-1",
                name: "Starter",
                sessions: 5,
                durationDays: 60,
                price: 500000,
                perks: null,
                isActive: true,
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      throw new Error(`Unexpected fetch call: ${url}`);
    });

    vi.stubGlobal("fetch", mockFetch);
  });

  it("first-time face register -> offer -> skip -> shows payment_waiting with VietQR", async () => {
    render(<CourtPayKiosk venueId="venue-1" />);

    fireEvent.click(screen.getByRole("button", { name: /First Time\?/i }));
    fireEvent.click(screen.getByRole("button", { name: "Capture" }));

    await waitFor(() => {
      expect(screen.getByText("Great photo!")).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "Looks good →" }));

    fireEvent.change(screen.getByPlaceholderText("Your Reclub's name"), {
      target: { value: "Alice" },
    });
    fireEvent.change(screen.getByPlaceholderText("0901234567"), {
      target: { value: "0901234567" },
    });
    fireEvent.click(screen.getByRole("button", { name: "F" }));
    fireEvent.click(screen.getByRole("button", { name: "Beginner" }));
    fireEvent.click(screen.getByRole("button", { name: "Next →" }));

    await waitFor(() => {
      expect(screen.getByText("Skip — pay today only")).toBeTruthy();
    });

    fireEvent.click(screen.getByText("Skip — pay today only"));

    await waitFor(() => {
      expect(screen.getByAltText("VietQR")).toBeTruthy();
      expect(screen.getByText(/150[.,]000 VND/)).toBeTruthy();
    });

    const registerCalls = mockApiPost.mock.calls.filter(
      (call) => call[0] === "/api/courtpay/register"
    );
    expect(registerCalls).toHaveLength(1);
    expect(registerCalls[0][1]).toMatchObject({
      venueCode: "venue-1",
      name: "Alice",
      phone: "0901234567",
      imageBase64: "mock-face-image",
    });
    expect(registerCalls[0][1]).not.toHaveProperty("packageId");
  });
});
