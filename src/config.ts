import "dotenv/config";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`متغير البيئة ${name} مطلوب (شوف .env.example)`);
  return value;
}

function int(name: string, fallback: number): number {
  const n = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(n) ? n : fallback;
}

export const config = {
  botToken: required("BOT_TOKEN"),
  mongoUri: process.env.MONGODB_URI?.trim() || "mongodb://127.0.0.1:27017",
  mongoDb: process.env.MONGODB_DB?.trim() || "tamreer",

  aiEnabled: Boolean(process.env.ANTHROPIC_API_KEY?.trim()),
  aiModel: process.env.AI_MODEL?.trim() || "claude-haiku-4-5",
  aiFailOpen: (process.env.AI_FAIL_OPEN ?? "true").toLowerCase() !== "false",
  aiTimeoutMs: int("AI_TIMEOUT_MS", 6000),

  /** أرقام حسابات مالكي البوت (يكدرون يضيفون ويحذفون كلمات) */
  adminIds: new Set(
    (process.env.BOT_ADMIN_IDS ?? "")
      .split(",")
      .map((s) => Number.parseInt(s.trim(), 10))
      .filter(Number.isFinite),
  ),
  /** منفذ فحص الصحة للاستضافات المجانية مثل Render */
  port: process.env.PORT ? int("PORT", 0) : null,

  brandName: process.env.BRAND_NAME?.trim() || "CLOVER",

  minPlayers: Math.max(2, int("MIN_PLAYERS", 2)),
  maxPlayers: Math.min(30, int("MAX_PLAYERS", 20)),
  turnsPerLevel: Math.max(1, int("TURNS_PER_LEVEL", 6)),
  /** مهلة إضافية صغيرة تعوض تأخير الشبكة */
  graceMs: int("GRACE_MS", 700),
  /** إلغاء الجولة تلقائياً إذا ما بدأت خلال هالمدة */
  lobbyTimeoutMs: int("LOBBY_TIMEOUT_MIN", 10) * 60_000,
};

/** مستويات اللعبة: كل TURNS_PER_LEVEL أسئلة ينزل الوقت 4 ثواني */
export const LEVELS = [
  { name: "المستوى السهل", seconds: 12, color: "#2ecc71" },
  { name: "المستوى المتوسط", seconds: 8, color: "#f5a623" },
  { name: "المستوى الصعب", seconds: 4, color: "#e8493f" },
] as const;

export function levelForTurn(turnNumber: number) {
  const idx = Math.min(LEVELS.length - 1, Math.floor(turnNumber / config.turnsPerLevel));
  return LEVELS[idx];
}
