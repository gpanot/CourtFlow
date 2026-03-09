import { NextRequest } from "next/server";
import { hashPassword, signToken } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { json, error, parseBody } from "@/lib/api-helpers";

export async function POST(request: NextRequest) {
  try {
    const { name, email, phone, password } = await parseBody<{
      name: string;
      email: string;
      phone: string;
      password: string;
    }>(request);

    if (!name || !email || !phone || !password) {
      return error("All fields are required");
    }

    if (password.length < 6) {
      return error("Password must be at least 6 characters");
    }

    const existingPhone = await prisma.staffMember.findUnique({ where: { phone } });
    if (existingPhone) return error("Phone number already registered");

    const existingEmail = await prisma.staffMember.findFirst({ where: { email } });
    if (existingEmail) return error("Email already registered");

    const staff = await prisma.staffMember.create({
      data: {
        name,
        email,
        phone,
        role: "superadmin",
        passwordHash: hashPassword(password),
        onboardingCompleted: false,
      },
    });

    const token = signToken({ id: staff.id, role: staff.role });

    return json({
      token,
      staff: {
        id: staff.id,
        name: staff.name,
        role: staff.role,
        onboardingCompleted: staff.onboardingCompleted,
      },
    });
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
