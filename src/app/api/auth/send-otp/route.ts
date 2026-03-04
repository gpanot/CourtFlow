import { NextRequest } from "next/server";
import { sendOtp } from "@/lib/auth";
import { json, error, parseBody } from "@/lib/api-helpers";

export async function POST(request: NextRequest) {
  try {
    const { phone } = await parseBody<{ phone: string }>(request);
    if (!phone) return error("Phone number is required");

    const result = await sendOtp(phone);
    return json({ success: result.success, ...(result.code ? { code: result.code } : {}) });
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
