import { prisma } from "@/lib/prisma";
import { verifyCaptchaToken } from "@/lib/raffle";

export const QUIZ_ACCOUNT_WINDOW_MINUTES = 10;
export const QUIZ_ACCOUNT_LIMIT = 12;
export const QUIZ_IP_WINDOW_MINUTES = 10;
export const QUIZ_IP_LIMIT = 40;
export const RAPID_ANSWER_MS = 1200;
export const RAPID_ANSWER_LIMIT = 3;
export const COOLDOWN_MINUTES = 15;

export function getClientIp(req: Request) {
  const forwarded = req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip") || req.headers.get("x-real-ip") || "";
  return String(forwarded.split(",")[0] || "").trim() || null;
}

export function getDeviceFingerprint(req: Request, body?: any) {
  const value = body?.deviceFingerprint || req.headers.get("x-device-fingerprint") || null;
  return value ? String(value).trim().slice(0, 255) : null;
}

function minutesAgo(minutes: number) {
  return new Date(Date.now() - minutes * 60 * 1000);
}

export function countRapidAnswers(answerEvents: any[]) {
  const timestamps = answerEvents
    .map((event) => event?.answeredAt ? new Date(event.answeredAt).getTime() : null)
    .filter((value): value is number => Number.isFinite(value))
    .sort((a, b) => a - b);

  let rapid = 0;
  for (let i = 1; i < timestamps.length; i += 1) {
    if (timestamps[i] - timestamps[i - 1] < RAPID_ANSWER_MS) rapid += 1;
  }
  return rapid;
}

async function createFlag(tx: typeof prisma, input: {
  userId?: string | null;
  ipAddress?: string | null;
  deviceFingerprint?: string | null;
  reason: "RAPID_ANSWERS" | "IP_RATE_LIMIT" | "ACCOUNT_RATE_LIMIT" | "DEVICE_FINGERPRINT_REUSE" | "CAPTCHA_FAILED" | "COOLDOWN_ACTIVE";
  score?: number;
  details?: Record<string, any> | null;
}) {
  await tx.suspiciousAccountFlag.create({
    data: {
      userId: input.userId || undefined,
      ipAddress: input.ipAddress || undefined,
      deviceFingerprint: input.deviceFingerprint || undefined,
      reason: input.reason,
      score: Math.max(1, Number(input.score || 1)),
      details: (input.details || null) as any,
    },
  });

  if (input.userId) {
    await tx.userLearningProfile.upsert({
      where: { userId: input.userId },
      update: { suspiciousScore: { increment: Math.max(1, Number(input.score || 1)) } },
      create: { userId: input.userId, suspiciousScore: Math.max(1, Number(input.score || 1)) },
    });
  }
}

export async function evaluateQuizAntiCheat(input: {
  tx: typeof prisma;
  req: Request;
  userId: string;
  lane?: "TEST_NOW" | "TRAINING" | "CERTIFICATIONS" | null;
  answerEvents: any[];
  captchaToken?: string | null;
  body?: any;
}) {
  const tx = input.tx;
  const ipAddress = getClientIp(input.req);
  const deviceFingerprint = getDeviceFingerprint(input.req, input.body);
  const answerEvents = Array.isArray(input.answerEvents) ? input.answerEvents : [];
  const rapidAnswerCount = countRapidAnswers(answerEvents);
  const reasons = new Set<string>();
  let blocked = false;
  let captchaRequired = false;
  let captchaPassed = false;

  const profile = await tx.userLearningProfile.upsert({ where: { userId: input.userId }, update: {}, create: { userId: input.userId } });
  if (profile.antiCheatCooldownUntil && profile.antiCheatCooldownUntil > new Date()) {
    reasons.add("COOLDOWN_ACTIVE");
    blocked = true;
    await createFlag(tx, { userId: input.userId, ipAddress, deviceFingerprint, reason: "COOLDOWN_ACTIVE", score: 2, details: { antiCheatCooldownUntil: profile.antiCheatCooldownUntil } });
  }

  const [recentAccountAttempts, recentIpAttempts, sameFingerprintUsers] = await Promise.all([
    tx.quizAttemptAudit.count({ where: { userId: input.userId, createdAt: { gte: minutesAgo(QUIZ_ACCOUNT_WINDOW_MINUTES) } } }),
    ipAddress ? tx.quizAttemptAudit.count({ where: { ipAddress, createdAt: { gte: minutesAgo(QUIZ_IP_WINDOW_MINUTES) } } }) : Promise.resolve(0),
    deviceFingerprint ? tx.quizAttemptAudit.findMany({ where: { deviceFingerprint, createdAt: { gte: minutesAgo(60 * 24 * 7) } }, select: { userId: true }, distinct: ["userId"] }) : Promise.resolve([] as any[]),
  ]);

  if (recentAccountAttempts >= QUIZ_ACCOUNT_LIMIT) {
    reasons.add("ACCOUNT_RATE_LIMIT");
    captchaRequired = true;
    await createFlag(tx, { userId: input.userId, ipAddress, deviceFingerprint, reason: "ACCOUNT_RATE_LIMIT", score: 2, details: { recentAccountAttempts } });
  }
  if (recentIpAttempts >= QUIZ_IP_LIMIT) {
    reasons.add("IP_RATE_LIMIT");
    captchaRequired = true;
    await createFlag(tx, { userId: input.userId, ipAddress, deviceFingerprint, reason: "IP_RATE_LIMIT", score: 2, details: { recentIpAttempts } });
  }
  if (rapidAnswerCount >= RAPID_ANSWER_LIMIT) {
    reasons.add("RAPID_ANSWERS");
    captchaRequired = true;
    await createFlag(tx, { userId: input.userId, ipAddress, deviceFingerprint, reason: "RAPID_ANSWERS", score: 3, details: { rapidAnswerCount } });
  }
  if (deviceFingerprint && sameFingerprintUsers.filter((row) => row.userId).length >= 4) {
    reasons.add("DEVICE_FINGERPRINT_REUSE");
    captchaRequired = true;
    await createFlag(tx, { userId: input.userId, ipAddress, deviceFingerprint, reason: "DEVICE_FINGERPRINT_REUSE", score: 2, details: { distinctUsers: sameFingerprintUsers.length } });
  }

  if (captchaRequired) {
    const captcha = await verifyCaptchaToken(String(input.captchaToken || ""), ipAddress);
    captchaPassed = captcha.ok;
    if (!captcha.ok) {
      reasons.add("CAPTCHA_FAILED");
      blocked = true;
      await createFlag(tx, { userId: input.userId, ipAddress, deviceFingerprint, reason: "CAPTCHA_FAILED", score: 2, details: { provider: captcha.provider } });
    }
  }

  const shouldCooldown = blocked || reasons.has("RAPID_ANSWERS") || reasons.has("ACCOUNT_RATE_LIMIT") || reasons.has("IP_RATE_LIMIT");
  const cooldownUntil = shouldCooldown ? new Date(Date.now() + COOLDOWN_MINUTES * 60 * 1000) : null;

  if (cooldownUntil) {
    await tx.userLearningProfile.upsert({
      where: { userId: input.userId },
      update: { antiCheatCooldownUntil: cooldownUntil },
      create: { userId: input.userId, antiCheatCooldownUntil: cooldownUntil },
    });
  }

  await tx.quizAttemptAudit.create({
    data: {
      userId: input.userId,
      ipAddress: ipAddress || undefined,
      deviceFingerprint: deviceFingerprint || undefined,
      lane: input.lane || undefined,
      answerCount: answerEvents.length,
      rapidAnswerCount,
      durationMs: null,
      captchaRequired,
      captchaPassed,
      blocked,
      reasons: Array.from(reasons),
    },
  });

  const behaviorRisk = deriveBehaviorRisk({
    rapidAnswerCount,
    reasons: Array.from(reasons),
    captchaRequired,
    blocked,
    recentAccountAttempts,
    recentIpAttempts,
    fingerprintReuseCount: sameFingerprintUsers.filter((row) => row.userId).length,
  });

  return {
    ok: !blocked,
    blocked,
    captchaRequired,
    captchaPassed,
    ipAddress,
    deviceFingerprint,
    rapidAnswerCount,
    reasons: Array.from(reasons),
    cooldownUntil,
    behaviorRisk,
  };
}


export function deriveBehaviorRisk(input: { rapidAnswerCount?: number; reasons?: string[]; captchaRequired?: boolean; blocked?: boolean; recentAccountAttempts?: number; recentIpAttempts?: number; fingerprintReuseCount?: number; }) {
  const reasons = new Set((input.reasons || []).map((v) => String(v || "").toUpperCase()));
  let riskScore = 0;
  riskScore += Math.min(40, Number(input.rapidAnswerCount || 0) * 8);
  riskScore += reasons.has("ACCOUNT_RATE_LIMIT") ? 18 : 0;
  riskScore += reasons.has("IP_RATE_LIMIT") ? 18 : 0;
  riskScore += reasons.has("DEVICE_FINGERPRINT_REUSE") ? 14 : 0;
  riskScore += reasons.has("CAPTCHA_FAILED") ? 20 : 0;
  riskScore += input.captchaRequired ? 10 : 0;
  riskScore += input.blocked ? 15 : 0;
  const band = riskScore >= 70 ? "HIGH" : riskScore >= 40 ? "MEDIUM" : "LOW";
  const recommendation = band === "HIGH" ? "Cooldown the user, require CAPTCHA, and review suspicious patterns." : band === "MEDIUM" ? "Require CAPTCHA and watch for repeat rapid answers or device reuse." : "Allow normal flow but keep telemetry for anomaly trends.";
  return { riskScore, band, recommendation };
}
