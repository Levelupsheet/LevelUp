import { awardRaffleEntries } from "@/lib/raffle";
/** Reserve one Golden question reward in the same transaction as the entry. */
export async function awardGoldenQuestion(tx: any, args: { userId: string; sessionId: string; questionId: string; campaignId: string }, grant = awardRaffleEntries) {
  const reserved = await tx.$queryRawUnsafe(
    `UPDATE "GoldenQuestionHistory" SET "awarded" = TRUE WHERE "sessionId" = $1 AND "questionId" = $2 AND "awarded" = FALSE RETURNING "id"`,
    args.sessionId, args.questionId,
  );
  if (!reserved.length) return false;
  const reward = await grant(tx, {
    userId: args.userId, source: "GOLDEN_QUESTION", quantity: 1, campaignId: args.campaignId,
    sourceRefType: "QUESTION", sourceRefId: args.questionId,
    auditKey: `golden-question:${args.questionId}:${args.sessionId}`,
    meta: { sessionId: args.sessionId, questionId: args.questionId },
  });
  if (Number(reward?.awarded || 0) <= 0) {
    await tx.$executeRawUnsafe(`UPDATE "GoldenQuestionHistory" SET "awarded" = FALSE WHERE "sessionId" = $1 AND "questionId" = $2`, args.sessionId, args.questionId);
    return false;
  }
  await tx.notification.create({ data: { userId: args.userId, type: "SWEEPSTAKES_ENTRY", title: "Golden sweepstakes entry added", body: `+${reward.awarded} golden entry added to the active golden sweepstakes.` } });
  return true;
}
