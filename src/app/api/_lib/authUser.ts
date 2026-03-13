import { prisma } from "./prisma";
import { getSessionUser, type SessionUser } from "@/lib/auth/session";

export async function getRequestUserId(req: Request, fieldNames: string[] = ["userId", "uid"]) {
  try {
    const url = new URL(req.url);
    for (const field of fieldNames) {
      const value = url.searchParams.get(field);
      if (value) return value;
    }
  } catch {}

  try {
    const body = await req.clone().json();
    for (const field of fieldNames) {
      const value = body?.[field];
      if (typeof value === "string" && value.trim()) return value.trim();
    }
  } catch {}

  const sessionUser = await getSessionUser();
  return sessionUser?.id ?? null;
}

export async function upsertGoogleUser(sessionUser: SessionUser) {
  const user = await prisma.user.upsert({
    where: { id: sessionUser.id },
    update: {
      email: sessionUser.email,
      displayName: sessionUser.name,
      avatarUrl: sessionUser.picture ?? null,
      authProvider: "GOOGLE",
      authProviderId: sessionUser.id.replace(/^google:/, ""),
      lastActiveAt: new Date(),
    },
    create: {
      id: sessionUser.id,
      email: sessionUser.email,
      displayName: sessionUser.name,
      avatarUrl: sessionUser.picture ?? null,
      authProvider: "GOOGLE",
      authProviderId: sessionUser.id.replace(/^google:/, ""),
      xp: 0,
      lootGrantedUpToLevel: 0,
      rank: "STUDENT",
      lastActiveAt: new Date(),
    },
  });

  await prisma.wallet.upsert({
    where: { userId: user.id },
    update: {},
    create: { userId: user.id, tokenBalance: 0 },
  });

  return user;
}
