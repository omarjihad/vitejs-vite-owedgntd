import { Bot, InlineKeyboard, InputFile, type Context } from "grammy";
import { config, LEVELS } from "./config.js";
import { getAvatar } from "./avatar.js";
import { users, type UserStats } from "./db.js";
import { renderStats } from "./render/stats.js";
import { earnedTitles, hasTitle, mainTitle, titleLabel, TITLES } from "./titles.js";
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
    "7️⃣ كل لاعب عنده <b>بطاقة تخطي</b> وحدة 🃏: يضغط زر «تخطي» ويعبر دوره للي بعده بنفس الحرف. وإذا خلص وقته وبعده عنده البطاقة تنستخدم تلقائياً.\n" +
    "8️⃣ الي يخلص وقته وما عنده بطاقة يطلع، وآخر لاعب يضل هو الفائز 🏆\n\n" +
    "📚 الكلمات تنفحص بقاموس عربي، والكلمة ما تتكرر بنفس الجولة.\n" +
    "👎 = كلمة غلط أو بحرف غلط (تكدر تحاول مرة ثانية ضمن الوقت)\n" +
    "🤔 = الكلمة مستخدمة قبل\n\n" +
    "<b>الأوامر:</b>\n" +
    "• <code>جولة</code> — بدء جولة جديدة\n" +
    "• <code>احصائياتي</code> — إحصائياتك\n" +
    "• <code>المتصدرين</code> — أفضل اللاعبين\n" +
    "• <code>الالقاب</code> — ألقابك وشلون تحصل الباقي\n" +
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

/** يدز بطاقة الإحصائيات كصورة */
async function sendStats(ctx: Context): Promise<void> {
  const from = ctx.from!;
  const replyTo = ctx.msg ? { reply_parameters: { message_id: ctx.msg.message_id } } : {};
  const s = await users.findOne({ _id: from.id });
  if (!s || !s.gamesPlayed) {
    await ctx.reply(`📊 ${escapeHtml(displayName(from))}، بعدك ما لعبت ولا جولة! اكتب <b>جولة</b> بالمجموعة وابدي 🎮`, {
      parse_mode: "HTML",
      ...replyTo,
    });
    return;
  }
  const name = displayName(from);
  const rank = (await users.countDocuments({ wins: { $gt: s.wins } })) + 1;
  const winRate = Math.round((s.wins / s.gamesPlayed) * 100);
  const avg = s.words ? (s.totalResponseMs / s.words / 1000).toFixed(1) : "—";
  const fastest = s.fastestMs != null ? (s.fastestMs / 1000).toFixed(1) : "—";
  const earned = earnedTitles(s);
  const main = mainTitle(s);

  const image = renderStats({
    name,
    avatar: await getAvatar(ctx.api, from.id, name),
    title: main ? titleLabel(main) : null,
    titlesEarned: earned.length,
    titlesTotal: TITLES.length,
    rank,
    tiles: [
      { icon: "🎮", label: "الجولات", value: String(s.gamesPlayed), color: "#65aadd" },
      { icon: "🏆", label: "الفوز", value: String(s.wins), color: "#c9922b" },
      { icon: "📈", label: "نسبة الفوز", value: `${winRate}%`, color: "#2ecc71" },
      { icon: "✍️", label: "الكلمات الصحيحة", value: String(s.words), color: "#a695e7" },
      { icon: "⚡", label: "متوسط السرعة", value: `${avg} ث`, color: "#f5a623" },
      { icon: "🚀", label: "أسرع إجابة", value: `${fastest} ث`, color: "#6ec9cb" },
      { icon: "🔥", label: "أفضل سلسلة فوز", value: String(s.bestWinStreak ?? 0), color: "#ee7aae" },
      { icon: "💀", label: "مرات الإقصاء", value: String(s.eliminations), color: "#e8493f" },
    ],
  });
  const caption =
    `📊 إحصائيات ${mention({ id: from.id, name })}` +
    (s.longestWord ? `\n📏 أطول كلمة: <b>${escapeHtml(s.longestWord)}</b>` : "") +
    "\n🏅 اكتب <b>الالقاب</b> علمود تشوف ألقابك";
  await ctx.replyWithPhoto(new InputFile(image, "stats.png"), { caption, parse_mode: "HTML", ...replyTo });
}

/** قائمة الألقاب: المحصلة والباقية وشلون تحصلها */
async function titlesText(userId: number, name: string): Promise<string> {
  const s = (await users.findOne({ _id: userId })) ?? ({} as Partial<UserStats>);
  const stats = s as UserStats;
  const earned = TITLES.filter((t) => hasTitle(t, stats));
  const locked = TITLES.filter((t) => !hasTitle(t, stats));
  let text = `🏅 <b>ألقاب</b> ${mention({ id: userId, name })} (${earned.length}/${TITLES.length})\n`;
  text += "\n✅ <b>المحصلة:</b>\n";
  text += earned.length ? earned.map((t) => `${titleLabel(t)}`).join("\n") : "ولا لقب بعد، العب جولة وابدي 💪";
  if (locked.length) {
    text += "\n\n🔒 <b>الباقية:</b>\n";
    text += locked
      .map((t) => {
        const [cur, target] = t.progress(stats);
        const prog = target > 1 ? ` (${Math.min(cur, target)}/${target})` : "";
        return `${titleLabel(t)} — ${t.how}${prog}`;
      })
      .join("\n");
  }
  return text;
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
    await sendStats(ctx);
  });

  bot.hears(/^(الالقاب|الألقاب|القابي|ألقابي)$/, async (ctx) => {
    if (!ctx.from) return;
    const game = ctx.chat && activeGames.get(ctx.chat.id);
    if (game?.isCurrentPlayer(ctx.from.id)) return; // دوره باللعب، نخليها تنحسب كلمة
    await ctx.reply(await titlesText(ctx.from.id, displayName(ctx.from)), {
      parse_mode: "HTML",
      reply_parameters: { message_id: ctx.msg!.message_id },
    });
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
        await sendStats(ctx);
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
  // زر بطاقة التخطي
  bot.callbackQuery("g:skip", async (ctx) => {
    const game = ctx.chat ? activeGames.get(ctx.chat.id) : undefined;
    if (!game) return void (await ctx.answerCallbackQuery({ text: "ماكو جولة شغالة", show_alert: true }));
    const error = await game.useSkip(ctx.from.id);
    await ctx.answerCallbackQuery(error ? { text: error, show_alert: true } : { text: "تم استخدام بطاقة التخطي 🃏" });
  });

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
