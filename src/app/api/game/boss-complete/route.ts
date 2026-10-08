import { POST as settleSavedSession } from "@/app/api/game/session/route";

/** Compatibility entrypoint. Boss encounters are owned saved learning sessions. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  return settleSavedSession(new Request(req.url, {
    method: "POST", headers: req.headers,
    body: JSON.stringify({ ...body, rewardClaimKey: body.sessionId || body.encounterId || body.rewardClaimKey }),
  }));
}
