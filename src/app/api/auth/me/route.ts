import { getSessionUser } from "@/lib/auth/session";
import { upsertGoogleUser } from "../../_lib/authUser";
import { isAdminEmail } from "@/lib/adminAuth";

export async function GET() {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return Response.json({ ok: false, authenticated: false }, { status: 401 });
  }

  const user = await upsertGoogleUser(sessionUser);
  return Response.json({
    ok: true,
    authenticated: true,
    user: {
      id: user.id,
      email: user.email,
      name: user.displayName || sessionUser.name,
      picture: user.avatarUrl,
      xp: user.xp,
      startingPosition: user.startingPosition,
      moduleChoice: user.moduleChoice,
      isAdmin: isAdminEmail(user.email),
    },
  });
}
