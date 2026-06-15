import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Apple from "next-auth/providers/apple";
import { prisma } from "@/lib/db";

function isRealPhone(phone: string | null | undefined): boolean {
  if (!phone) return false;
  return !phone.startsWith("oauth_") && !phone.startsWith("email_");
}

function isOnboardingComplete(phone: string | null | undefined, registrationVenueId: string | null | undefined): boolean {
  return isRealPhone(phone) && !!registrationVenueId;
}

declare module "next-auth" {
  interface Session {
    playerId?: string;
    onboardingComplete?: boolean;
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    playerId?: string;
    onboardingComplete?: boolean;
  }
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  trustHost: true,
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      checks: ["state"],
    }),
    ...(process.env.APPLE_CLIENT_ID
      ? [
          Apple({
            clientId: process.env.APPLE_CLIENT_ID!,
            clientSecret: process.env.APPLE_CLIENT_SECRET!,
          }),
        ]
      : []),
  ],
  session: { strategy: "jwt" },
  pages: {
    signIn: "/book/login",
  },
  callbacks: {
    async redirect({ url, baseUrl }) {
      // OAuth callbacks (Apple/Google) always land here.
      // Force every post-OAuth redirect into /book/onboarding — the onboarding
      // page itself decides whether to show the form or skip to /book.
      const onboarding = `${baseUrl}/book/onboarding`;

      // Already targeting a /book/* path — allow it
      if (url.startsWith(`${baseUrl}/book`)) return url;
      if (url.startsWith("/book")) return `${baseUrl}${url}`;

      // Everything else (root, staff, admin, external) → onboarding
      return onboarding;
    },

    async signIn({ account, profile }) {
      if (!account?.providerAccountId) return false;

      const provider = account.provider;
      const providerAccountId = account.providerAccountId;

      try {
        const existing = await prisma.playerAccount.findUnique({
          where: { provider_providerAccountId: { provider, providerAccountId } },
        });

        if (existing) return true;

        const name =
          profile?.name ??
          (profile?.given_name && profile?.family_name
            ? `${profile.given_name} ${profile.family_name}`
            : null) ??
          "Player";
        const email = profile?.email ?? null;
        const image =
          (profile?.picture as string | undefined) ??
          (profile?.image as string | undefined) ??
          null;

        const player = await prisma.player.create({
          data: {
            name,
            email,
            phone: `oauth_${provider}_${providerAccountId}`,
            gender: "male",
            skillLevel: "beginner",
          },
        });

        await prisma.playerAccount.create({
          data: {
            playerId: player.id,
            provider,
            providerAccountId,
            email,
            name,
            image,
          },
        });

        return true;
      } catch (err) {
        console.error("[NextAuth signIn] failed to create player:", err);
        return false;
      }
    },

    async jwt({ token, account, trigger, session: updateData }) {
      if (trigger === "update" && updateData?.playerId) {
        token.playerId = updateData.playerId as string;
        const player = await prisma.player.findUnique({
          where: { id: token.playerId },
          select: { phone: true, registrationVenueId: true },
        });
        token.onboardingComplete = isOnboardingComplete(player?.phone, player?.registrationVenueId);
        return token;
      }

      if (account?.providerAccountId) {
        const pa = await prisma.playerAccount.findUnique({
          where: {
            provider_providerAccountId: {
              provider: account.provider,
              providerAccountId: account.providerAccountId,
            },
          },
          include: { player: { select: { id: true, phone: true, registrationVenueId: true } } },
        });
        if (pa) {
          token.playerId = pa.player.id;
          token.onboardingComplete = isOnboardingComplete(pa.player.phone, pa.player.registrationVenueId);
        }
      }

      return token;
    },

    async session({ session, token }) {
      session.playerId = token.playerId;
      session.onboardingComplete = token.onboardingComplete;
      return session;
    },
  },
});
