import { autoRetry } from "@grammyjs/auto-retry";
import { Bot, GrammyError, HttpError } from "grammy";
import { config } from "./config.js";
import { closeDb, connectDb } from "./db.js";
import { activeGames } from "./game.js";
import { registerHandlers } from "./handlers.js";

async function main() {
  await connectDb();
  console.log("✔ اتصلت بقاعدة MongoDB");
  if (!config.aiEnabled) {
    console.warn("⚠ ANTHROPIC_API_KEY مو موجود: كل كلمة عربية سليمة الشكل راح تنقبل بدون فحص ذكي");
  }

  const bot = new Bot(config.botToken);
  bot.api.config.use(autoRetry({ maxRetryAttempts: 3, maxDelaySeconds: 10 }));
  registerHandlers(bot);

  bot.catch((err) => {
    const e = err.error;
    if (e instanceof GrammyError) console.error("[Telegram] خطأ:", e.description);
    else if (e instanceof HttpError) console.error("[Telegram] مشكلة اتصال:", e);
    else console.error("[Bot] خطأ غير متوقع:", e);
  });

  await bot.api.setMyCommands(
    [
      { command: "start", description: "رسالة الترحيب" },
      { command: "help", description: "شرح اللعبة" },
      { command: "stats", description: "إحصائياتي" },
    ],
    { scope: { type: "all_private_chats" } },
  );
  await bot.api.setMyCommands(
    [
      { command: "help", description: "شرح اللعبة" },
      { command: "stats", description: "إحصائياتي" },
    ],
    { scope: { type: "all_group_chats" } },
  );

  const shutdown = async () => {
    console.log("… جاري الإيقاف");
    for (const game of activeGames.values()) await game.stop("إعادة تشغيل البوت").catch(() => {});
    await bot.stop();
    await closeDb();
    process.exit(0);
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);

  await bot.start({
    drop_pending_updates: true,
    allowed_updates: ["message", "callback_query"],
    onStart: (me) => console.log(`✔ البوت شغال: @${me.username}`),
  });
}

main().catch((err) => {
  console.error("✖ فشل التشغيل:", err);
  process.exit(1);
});
