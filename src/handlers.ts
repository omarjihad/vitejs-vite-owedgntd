import { Bot, InlineKeyboard, type Context } from "grammy";
import { config, LEVELS } from "./config.js";
import { users } from "./db.js";
import { cleanWord, isArabicWord, normalizeWord } from "./arabic.js";
import { activeGames, displayName, escapeHtml, Game, mention } from "./game.js";
import { inDictionary, isValidWord, setWord } from "./validator.js";

const ADMIN_RIGHTS = "delete_messages+pin_messages+invite_users+manage_chat";

function helpText(): string {
  const times = LEVELS.map((l) => `${l.seconds}`).join(" ← ");
  return (
    "📖 <b>شرح لعبة التمرير</b>\n\n" +
    "1️⃣ بالمجموعة اكتب <b>جولة</b> علمود تبدي جولة جديدة.\n" +
    "2️⃣ اللاعبين يضغطون <b>انضمام</b>، وصاحب الجولة يضغط <b>بدء</b>.\n" +
    "3️⃣ البوت يوزع الأدوار عشوائياً (1، 2، 3 ...).\n" +
    "4️⃣ البوت يختار حرف عشوائي، واللاعب رقم 1 يكتب كلمة تبدأ بهذا الحرف.\n" +
    "5️⃣ اللاعب الي بعده يكمل بكلمة تبدأ بـ<b>آخر حرف</b> من الكلمة السابقة.\n" +
    "   مثال: رمل ← لؤلؤ ← أسد ...\n" +
    "   (كل أشكال الهمزة تنحسب «أ»، والـ«ة» تنحسب «ه»، والـ«ى» تنحسب «ي»)\n" +
    `6️⃣ الوقت يبدأ ${LEVELS[0].seconds} ثانية، وكل ${config.turnsPerLevel} أسئلة يقل: ${times} ثانية.\n` +
    "7️⃣ الي يخلص وقته يطلع من اللعبة، وآخر لاعب يضل هو الفائز 🏆\n\n" +
    "📚 الكلمات تنفحص بقاموس عربي، والكلمة ما تتكرر بنفس الجولة.\n" +
    "👎 = كلمة غلط أو بحرف غلط (تكدر تحاول مرة ثانية ضمن الوقت)\n" +
    "🤔 = الكلمة مستخدمة قبل\n\n" +
    "<b>الأوامر:</b>\n" +
    "• <code>جولة</code> — بدء جولة جديدة\n" +
    "• <code>احصائياتي</code> — إحصائياتك\n" +
    "• <code>المتصدرين</code> — أفضل اللاعبين\n" +
    "• <code>ايقاف</code> — إيقاف الجولة (لصاحبها أو المشرفين)\n" +
    "• <code>افحص كلمة ...</code> — تشوف الكلمة مقبولة لو لا"
  );
}

async function isChatAdmin(ctx: Context, userId: number): Promise<boolean> {
  try {
    const m = await ctx.api.getChatMember(ctx.chat!.id, userId);
    return m.status === "creator" || m.status === "administrator";
  } catch {
    return false;
  }
}

async function statsText(userId: number, fallbackName: string): Promise<string> {
  const s = await users.findOne({ _id: userId });
  if (!s || !s.gamesPlayed) {
    return `📊 ${escapeHtml(fallbackName)}، بعدك ما لعبت ولا جولة! اكتب <b>جولة</b> بالمجموعة وابدي 🎮`;
  }
  const rank = (await users.countDocuments({ wins: { $gt: s.wins } })) + 1;
  const winRate = Math.round((s.wins / s.gamesPlayed) * 100);
  const avg = s.words ? (s.totalResponseMs / s.words / 1000).toFixed(1) : "—";
  const fastest = s.fastestMs != null ? (s.fastestMs / 1000).toFixed(1) : "—";
  return (
    `📊 <b>إحصائيات</b> ${mention({ id: userId, name: s.name })}\n\n` +
    `🎮 الجولات: <b>${s.gamesPlayed}</b>\n` +
    `🏆 الفوز: <b>${s.wins}</b> (${winRate}%)\n` +
    `✍️ الكلمات الصحيحة: <b>${s.words}</b>\n` +
    `⚡ متوسط السرعة: <b>${avg}</b> ث\n` +
    `🚀 أسرع إجابة: <b>${fastest}</b> ث\n` +
    `💀 مرات الإقصاء: <b>${s.eliminations}</b>\n` +
    `🥇 ترتيبك: <b>#${rank}</b>`
  );
}

async function leaderboardText(): Promise<string> {
  const top = await users.find({ gamesPlayed: { $gt: 0 } }).sort({ wins: -1, words: -1 }).limit(10).toArray();
  if (!top.length) return "ماكو لاعبين بعد 🤷";
  const medals = ["🥇", "🥈", "🥉"];
  return (
    "🏆 <b>المتصدرين</b>\n\n" +
    top
      .map((u, i) => `${medals[i] ?? `${i + 1}.`} ${mention({ id: u._id, name: u.name })} — ${u.wins} فوز`)
      .join("\n")
  );
}

export function registerHandlers(bot: Bot) {
  const priv = bot.chatType("private");
  const group = bot.chatType(["group", "supergroup"]);

  // ───────── الخاص ─────────
  priv.command("start", async (ctx) => {
    const kb = new InlineKeyboard().url(
      "➕ أضفني لمجموعتك",
      `https://t.me/${ctx.me.username}?startgroup=true&admin=${ADMIN_RIGHTS}`,
    );
    await ctx.reply(
      `👋 أهلاً ${escapeHtml(ctx.from.first_name)}!\n\n` +
        `أنا بوت <b>لعبة التمرير</b> 🔤\n` +
        `كل لاعب يكتب كلمة تبدأ بآخر حرف من كلمة الي قبله، والوقت يقل كل شوية ⏱\n` +
        `آخر واحد يضل هو البطل 🏆\n\n` +
        `ضيفني لمجموعتك كمشرف واكتبوا <b>جولة</b> علمود تبدون.\n` +
        `للشرح الكامل: /help`,
      { parse_mode: "HTML", reply_markup: kb },
    );
  });

  priv.command("help", (ctx) => ctx.reply(helpText(), { parse_mode: "HTML" }));

  bot.command("stats", async (ctx) => {
    if (!ctx.from) return;
    await ctx.reply(await statsText(ctx.from.id, displayName(ctx.from)), { parse_mode: "HTML" });
  });

  // ───────── إدارة الكلمات ─────────
  bot.hears(/^(اضف|أضف|احذف|افحص) كلمة (\S+)$/, async (ctx) => {
    if (!ctx.from || !ctx.chat) return;
    const [, action, raw] = ctx.match;
    const word = cleanWord(raw);
    if (!isArabicWord(word)) return void (await ctx.reply("اكتب كلمة عربية وحدة بس."));
    const key = normalizeWord(word);

    if (action === "افحص") {
      const game = activeGames.get(ctx.chat.id);
      if (game && game.state !== "lobby" && game.state !== "ended") return; // ما نساعد أحد أثناء اللعب
      const ok = await isValidWord(key, word);
      await ctx.reply(ok ? `✅ «${escapeHtml(word)}» كلمة مقبولة` : `❌ «${escapeHtml(word)}» مو موجودة بالقاموس`, {
        parse_mode: "HTML",
      });
      return;
    }

    if (!config.adminIds.has(ctx.from.id)) {
      await ctx.reply("⛔ بس مالك البوت يكدر يعدل القاموس.");
      return;
    }
    const valid = action !== "احذف";
    await setWord(key, valid);
    await ctx.reply(
      valid
        ? `✅ تمت إضافة «${escapeHtml(word)}» للقاموس`
        : `🗑 «${escapeHtml(word)}» صارت ممنوعة${inDictionary(key) ? " (كانت بالقاموس المدمج)" : ""}`,
      { parse_mode: "HTML" },
    );
  });

  // ───────── المجموعات ─────────
  group.command("help", (ctx) =>
    ctx.reply(helpText(), { parse_mode: "HTML", reply_parameters: { message_id: ctx.msg.message_id } }),
  );

  group.on("message:text", async (ctx, next) => {
    const text = ctx.msg.text.trim();
    const chatId = ctx.chat.id;
    const game = activeGames.get(chatId);

    // رسائل اللاعب الي دوره تنحسب كلمات حتى لو تشبه أمر (مثلاً «جولة» أو «ايقاف»)
    // وما ننتظر الفحص علمود ما نعطل باقي المجموعات
    if (game?.isCurrentPlayer(ctx.from.id)) {
      void game
        .handleMessage(ctx.from.id, ctx.msg.message_id, text)
        .catch((e) => console.error("[Game] خطأ بمعالجة الرسالة:", e));
      return;
    }

    switch (text) {
      case "جولة": {
        if (game) {
          if (game.state === "lobby") {
            await game.repostLobby();
          } else {
            await ctx.reply("⚠️ في جولة شغالة هسه، انتظروا لحد ما تخلص.");
          }
          return;
        }
        const owner = { id: ctx.from.id, name: displayName(ctx.from) };
        const g = new Game(ctx.api, chatId, owner);
        g.addPlayer(ctx.from);
        activeGames.set(chatId, g);
        await g.sendLobby();
        return;
      }
      case "احصائياتي":
        await ctx.reply(await statsText(ctx.from.id, displayName(ctx.from)), {
          parse_mode: "HTML",
          reply_parameters: { message_id: ctx.msg.message_id },
        });
        return;
      case "المتصدرين":
        await ctx.reply(await leaderboardText(), { parse_mode: "HTML" });
        return;
      case "ايقاف":
      case "إيقاف": {
        if (!game) return;
        if (game.owner.id !== ctx.from.id && !(await isChatAdmin(ctx, ctx.from.id))) {
          await ctx.reply("⛔ بس صاحب الجولة أو المشرفين يكدرون يوقفونها.");
          return;
        }
        await game.stop(displayName(ctx.from));
        return;
      }
    }
    await next();
  });

  // ───────── الأزرار ─────────
  bot.callbackQuery(/^g:(join|leave|start|repost)$/, async (ctx) => {
    const action = ctx.match[1];
    const chatId = ctx.chat?.id;
    const game = chatId !== undefined ? activeGames.get(chatId) : undefined;
    const msgId = ctx.callbackQuery.message?.message_id;

    if (!game || game.state !== "lobby" || (game.lobbyMessageId && msgId !== game.lobbyMessageId)) {
      await ctx.answerCallbackQuery({ text: "هاي الجولة منتهية أو بدأت ❌", show_alert: true });
      return;
    }

    const isOwner = ctx.from.id === game.owner.id;

    switch (action) {
      case "join": {
        const r = game.addPlayer(ctx.from);
        if (r === "exists") return void (await ctx.answerCallbackQuery({ text: "انت منضم ✅", show_alert: true }));
        if (r === "full")
          return void (await ctx.answerCallbackQuery({ text: `الجولة ممتلئة (${config.maxPlayers} لاعب) 😅`, show_alert: true }));
        await ctx.answerCallbackQuery({ text: "تم انضمامك للجولة 🎮" });
        await game.refreshLobby();
        return;
      }
      case "leave": {
        if (!game.removePlayer(ctx.from.id))
          return void (await ctx.answerCallbackQuery({ text: "انت مو منضم ❌", show_alert: true }));
        await ctx.answerCallbackQuery({ text: "غادرت الجولة 👋" });
        await game.refreshLobby();
        return;
      }
      case "start": {
        if (!isOwner)
          return void (await ctx.answerCallbackQuery({ text: "هذا الزر لصاحب الجولة فقط ⛔", show_alert: true }));
        if (game.players.size < config.minPlayers)
          return void (await ctx.answerCallbackQuery({
            text: `لازم ${config.minPlayers} لاعبين على الأقل 👥`,
            show_alert: true,
          }));
        await ctx.answerCallbackQuery({ text: "يلا نبدي! 🚀" });
        void game.start().catch(async (e) => {
          console.error("[Game] فشل بدء الجولة:", e);
          await game.stop("البوت (صار خطأ)");
        });
        return;
      }
      case "repost": {
        if (!isOwner)
          return void (await ctx.answerCallbackQuery({ text: "هذا الزر لصاحب الجولة فقط ⛔", show_alert: true }));
        await ctx.answerCallbackQuery();
        await game.repostLobby();
        return;
      }
    }
  });
}
