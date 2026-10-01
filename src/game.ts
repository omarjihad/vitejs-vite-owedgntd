import type { Image } from "@napi-rs/canvas";
import { InlineKeyboard, InputFile, type Api } from "grammy";
import type { ReactionTypeEmoji, User } from "grammy/types";
import {
  cleanWord,
  displayLetter,
  firstLetter,
  isArabicWord,
  lastLetter,
  normalizeWord,
  randomLetter,
} from "./arabic.js";
import { getAvatar } from "./avatar.js";
import { config, levelForTurn } from "./config.js";
import { games as gamesDb, users, type UserStats } from "./db.js";
import { renderLineup } from "./render/lineup.js";
import { renderTeams, renderTeamWinner, TEAM_STYLE, type TeamView } from "./render/teams.js";
import { renderTurn } from "./render/turn.js";
import { renderWinner } from "./render/winner.js";
import { earnedTitles, titleLabel, type Title } from "./titles.js";
import { isValidWord } from "./validator.js";

export interface Player {
  id: number;
  name: string;
  username?: string;
  avatar?: Image;
  alive: boolean;
  words: number;
  totalMs: number;
  fastestMs: number | null;
  eliminated: boolean;
  /** بطاقة التخطي: وحدة لكل لاعب بالجولة */
  skipCard: boolean;
  skipsUsed: number;
  longestWord: string;
  /** بوضع الفرق: 0 الفريق الأول، 1 الفريق الثاني */
  team?: 0 | 1;
}

/** فردي، فرق، أو تحدي 1 ضد 1 */
export type Mode = "solo" | "team" | "duel";
export const TEAM_MIN_PLAYERS = 4;

interface Turn {
  player: Player;
  letter: string;
  startedAt: number;
  deadline: number;
  timer?: NodeJS.Timeout;
  checking: boolean;
  expiredWhileChecking: boolean;
  done: boolean;
}

type State = "lobby" | "starting" | "playing" | "ended";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function displayName(u: Pick<User, "first_name" | "last_name">): string {
  return [u.first_name, u.last_name].filter(Boolean).join(" ").trim() || "لاعب";
}

export function mention(p: { id: number; name: string }): string {
  return `<a href="tg://user?id=${p.id}">${escapeHtml(p.name)}</a>`;
}

/** كل الجولات الشغالة: جولة وحدة لكل مجموعة */
export const activeGames = new Map<number, Game>();

export class Game {
  state: State = "lobby";
  readonly players = new Map<number, Player>();
  order: Player[] = [];
  lobbyMessageId?: number;
  private lobbyTimer?: NodeJS.Timeout;
  private turn?: Turn;
  private turnNumber = 0;
  private usedWords = new Set<string>();
  private notes: string[] = [];
  private log: { userId: number; word: string; ms: number }[] = [];
  private startedAt = new Date();
  /** null = صاحب الجولة بعده ما اختار النوع */
  mode: Mode | null = null;

  constructor(
    private readonly api: Api,
    readonly chatId: number,
    readonly owner: { id: number; name: string },
    mode: Mode | null = null,
  ) {
    this.mode = mode;
  }

  minPlayers(): number {
    return this.mode === "team" ? Math.max(TEAM_MIN_PLAYERS, config.minPlayers) : config.minPlayers;
  }

  // ───────────── اختيار نوع الجولة ─────────────

  private modeChoiceText(): string {
    return `🎮 ${mention(this.owner)} اختار نوع الجولة:\n\n👤 <b>فردي</b>: كل واحد يلعب لنفسه\n👥 <b>فرق</b>: فريقين، والبوت يوزعهم تلقائياً (أقل شي ${TEAM_MIN_PLAYERS} لاعبين)`;
  }

  private modeKeyboard(): InlineKeyboard {
    return new InlineKeyboard().text("👤 فردي", "g:mode:solo").text("👥 فرق", "g:mode:team");
  }

  async sendModeChoice(): Promise<void> {
    const msg = await this.api.sendMessage(this.chatId, this.modeChoiceText(), {
      parse_mode: "HTML",
      reply_markup: this.modeKeyboard(),
      link_preview_options: { is_disabled: true },
    });
    this.lobbyMessageId = msg.message_id;
    this.armLobbyTimeout();
  }

  /** صاحب الجولة اختار النوع: نحول نفس الرسالة لرسالة الانضمام */
  async chooseMode(mode: "solo" | "team"): Promise<void> {
    if (this.mode || this.state !== "lobby") return;
    this.mode = mode;
    await this.refreshLobby();
  }

  // ───────────── مرحلة الانضمام ─────────────

  addPlayer(u: User): "added" | "exists" | "full" {
    if (this.players.has(u.id)) return "exists";
    if (this.players.size >= config.maxPlayers) return "full";
    this.players.set(u.id, {
      id: u.id,
      name: displayName(u),
      username: u.username,
      alive: true,
      words: 0,
      totalMs: 0,
      fastestMs: null,
      eliminated: false,
      skipCard: true,
      skipsUsed: 0,
      longestWord: "",
    });
    return "added";
  }

  removePlayer(userId: number): boolean {
    return this.players.delete(userId);
  }

  lobbyText(): string {
    const list = [...this.players.values()].map(mention).join(" | ") || "—";
    const modeLine = this.mode === "team" ? "👥 النوع: <b>فرق</b> (البوت يوزع الفريقين تلقائياً)" : "👤 النوع: <b>فردي</b>";
    return (
      `🎮 تم بدء جولة بواسطة ${mention(this.owner)}\n` +
      `${modeLine}\n\n` +
      `👥 المشاركين: ${this.players.size}\n` +
      `${list}\n\n` +
      `⚡ اضغط «انضمام» علمود تشارك (الحد الأدنى ${this.minPlayers()} لاعبين)`
    );
  }

  lobbyKeyboard(): InlineKeyboard {
    return new InlineKeyboard()
      .text("✅ انضمام", "g:join")
      .text("🚪 مغادرة", "g:leave")
      .row()
      .text("▶️ بدء", "g:start")
      .text("🔁 إعادة النشر", "g:repost");
  }

  async sendLobby(): Promise<void> {
    const msg = await this.api.sendMessage(this.chatId, this.lobbyText(), {
      parse_mode: "HTML",
      reply_markup: this.lobbyKeyboard(),
      link_preview_options: { is_disabled: true },
    });
    this.lobbyMessageId = msg.message_id;
    this.armLobbyTimeout();
  }

  async refreshLobby(): Promise<void> {
    if (!this.lobbyMessageId || this.state !== "lobby" || !this.mode) return;
    await this.api
      .editMessageText(this.chatId, this.lobbyMessageId, this.lobbyText(), {
        parse_mode: "HTML",
        reply_markup: this.lobbyKeyboard(),
        link_preview_options: { is_disabled: true },
      })
      .catch(() => {});
  }

  async repostLobby(): Promise<void> {
    const old = this.lobbyMessageId;
    if (this.mode) await this.sendLobby();
    else await this.sendModeChoice();
    if (old) await this.api.deleteMessage(this.chatId, old).catch(() => {});
  }

  private armLobbyTimeout() {
    clearTimeout(this.lobbyTimer);
    this.lobbyTimer = setTimeout(() => {
      if (this.state !== "lobby") return;
      this.dispose();
      if (this.lobbyMessageId) {
        this.api
          .editMessageText(this.chatId, this.lobbyMessageId, "⌛ انتهت مهلة الجولة لأن ما أحد بدأها.")
          .catch(() => {});
      }
    }, config.lobbyTimeoutMs);
  }

  // ───────────── بدء اللعبة ─────────────

  async start(): Promise<void> {
    if (this.state !== "lobby") return;
    this.state = "starting";
    clearTimeout(this.lobbyTimer);
    this.startedAt = new Date();

    if (this.lobbyMessageId) {
      const started =
        this.mode === "duel"
          ? `⚔️ بدأ التحدي بين ${[...this.players.values()].map(mention).join(" و ")}!`
          : `🎮 بدأت الجولة! عدد المشاركين: ${this.players.size}`;
      await this.api.editMessageText(this.chatId, this.lobbyMessageId, started, { parse_mode: "HTML" }).catch(() => {});
    }
    const wait = await this.api.sendMessage(this.chatId, "⏳ يتم توزيع الأدوار، انتظر قليلاً...");

    // توزيع عشوائي (Fisher–Yates)
    const order = [...this.players.values()];
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    if (this.mode === "team") {
      // نقسمهم فريقين بالتساوي، والأدوار بالتناوب: فريق أول، فريق ثاني، فريق أول...
      const t0 = order.filter((_, i) => i % 2 === 0);
      const t1 = order.filter((_, i) => i % 2 === 1);
      t0.forEach((p) => (p.team = 0));
      t1.forEach((p) => (p.team = 1));
      const alt: Player[] = [];
      for (let i = 0; i < Math.max(t0.length, t1.length); i++) {
        if (t0[i]) alt.push(t0[i]);
        if (t1[i]) alt.push(t1[i]);
      }
      this.order = alt;
    } else {
      this.order = order;
    }

    await Promise.all(
      order.map(async (p) => {
        p.avatar = await getAvatar(this.api, p.id, p.name);
      }),
    );
    if (this.isOver()) return;

    const lv = levelForTurn(0);
    let image: Buffer;
    let caption: string;
    if (this.mode === "team") {
      const views = this.teamViews();
      image = renderTeams(views, lv.name, lv.color);
      caption =
        "📋 <b>توزيع الفرق</b>\n\n" +
        ([0, 1] as const)
          .map(
            (t) =>
              `${TEAM_STYLE[t].emoji} <b>${TEAM_STYLE[t].name}</b>\n` +
              this.order
                .map((p, i) => (p.team === t ? `${i + 1}. ${mention(p)}` : null))
                .filter(Boolean)
                .join("\n"),
          )
          .join("\n\n") +
        "\n\n🔗 الأدوار بالتناوب بين الفريقين، والفريق الي يطلعون كل لاعبيه يخسر!";
    } else {
      image = renderLineup(
        this.order.map((p) => ({ name: p.name, avatar: p.avatar! })),
        lv.name,
        lv.color,
      );
      caption =
        (this.mode === "duel" ? "⚔️ <b>تحدي</b>\n\n" : "📋 <b>ترتيب اللاعبين</b>\n\n") +
        this.order.map((p, i) => `${i + 1}. ${mention(p)}`).join("\n") +
        "\n\n🔗 كمّل من آخر حرف بكلمة اللاعب الي قبلك!";
    }
    await this.api.deleteMessage(this.chatId, wait.message_id).catch(() => {});
    await this.api.sendPhoto(this.chatId, new InputFile(image, "lineup.png"), {
      caption,
      parse_mode: "HTML",
    });

    this.state = "playing";
    await sleep(3000);
    if (this.isOver()) return;
    await this.beginTurn(this.order[0], randomLetter());
  }

  private teamViews(alive = false): [TeamView, TeamView] {
    return ([0, 1] as const).map((t) => ({
      name: TEAM_STYLE[t].name,
      color: TEAM_STYLE[t].color,
      players: this.order
        .map((p, i) => ({ p, number: i + 1 }))
        .filter(({ p }) => p.team === t && (!alive || p.alive))
        .map(({ p, number }) => ({ name: p.name, avatar: p.avatar!, number })),
    })) as [TeamView, TeamView];
  }

  // ───────────── الأدوار ─────────────

  private isOver() {
    return this.state === "ended";
  }

  private alivePlayers() {
    return this.order.filter((p) => p.alive);
  }

  private nextAliveAfter(player: Player): Player {
    const idx = this.order.indexOf(player);
    if (this.mode === "team") {
      // الدور يروح للفريق الثاني إذا بيه أحد باقي
      for (let step = 1; step <= this.order.length; step++) {
        const p = this.order[(idx + step) % this.order.length];
        if (p.alive && p.team !== player.team) return p;
      }
    }
    for (let step = 1; step <= this.order.length; step++) {
      const p = this.order[(idx + step) % this.order.length];
      if (p.alive) return p;
    }
    return player;
  }

  private async beginTurn(player: Player, letter: string): Promise<void> {
    if (this.isOver()) return;
    const level = levelForTurn(this.turnNumber);
    const shown = displayLetter(letter);
    const image = renderTurn({
      name: player.name,
      avatar: player.avatar!,
      letter: shown,
      seconds: level.seconds,
      levelName: level.name,
      accent: level.color,
      number: this.order.indexOf(player) + 1,
      team: player.team !== undefined ? { name: TEAM_STYLE[player.team].name, color: TEAM_STYLE[player.team].color } : undefined,
    });

    const header = this.notes.length ? this.notes.join("\n") + "\n\n" : "";
    this.notes = [];
    const caption =
      header +
      `🎯 دورك يا ${mention(player)}` +
      (player.team !== undefined ? ` (${TEAM_STYLE[player.team].emoji} ${TEAM_STYLE[player.team].name})` : "") +
      "\n" +
      `🔤 اكتب كلمة تبدأ بحرف « <b>${shown}</b> »\n` +
      `⏱ عندك ${level.seconds} ثانية — ${level.name}\n` +
      (player.skipCard
        ? "🃏 عندك بطاقة تخطي وحدة (إذا خلص الوقت تنستخدم تلقائياً)"
        : "⚠️ ما عندك بطاقة تخطي، إذا خلص الوقت تطلع");

    try {
      await this.api.sendPhoto(this.chatId, new InputFile(image, "turn.png"), {
        caption,
        parse_mode: "HTML",
        reply_markup: player.skipCard ? new InlineKeyboard().text("🃏 تخطي", "g:skip") : undefined,
      });
    } catch (err) {
      console.error("[Game] فشل إرسال الدور:", err);
    }
    if (this.isOver()) return;

    const startedAt = Date.now();
    const turn: Turn = {
      player,
      letter,
      startedAt,
      deadline: startedAt + level.seconds * 1000 + config.graceMs,
      checking: false,
      expiredWhileChecking: false,
      done: false,
    };
    turn.timer = setTimeout(() => this.onTimeout(turn), turn.deadline - startedAt);
    this.turn = turn;
  }

  /** هل هذا اللاعب دوره هسه؟ (رسائله تنحسب كلمات مو أوامر) */
  isCurrentPlayer(userId: number): boolean {
    return this.state === "playing" && !!this.turn && !this.turn.done && this.turn.player.id === userId;
  }

  /** يستقبل رسائل المجموعة أثناء اللعب */
  async handleMessage(userId: number, messageId: number, text: string): Promise<void> {
    const turn = this.turn;
    if (this.state !== "playing" || !turn || turn.done || turn.player.id !== userId) return;
    const receivedAt = Date.now();
    if (receivedAt > turn.deadline || turn.checking) return;

    const word = cleanWord(text);
    if (!word || /\s/.test(word) || !isArabicWord(word)) return; // مو كلمة عربية، نتجاهلها

    const key = normalizeWord(word);
    if (firstLetter(key) !== turn.letter || key.length < 2) {
      await this.react(messageId, "👎");
      return;
    }
    if (this.usedWords.has(key)) {
      await this.react(messageId, "🤔");
      return;
    }

    turn.checking = true;
    let valid: boolean;
    try {
      valid = await isValidWord(key, word);
    } catch (err) {
      console.error("[Game] فشل فحص الكلمة:", err);
      valid = config.aiFailOpen;
    } finally {
      turn.checking = false;
    }
    if (turn.done || this.isOver() || this.turn !== turn) return;

    if (!valid) {
      await this.react(messageId, "👎");
      if (turn.expiredWhileChecking || Date.now() > turn.deadline) await this.expire(turn);
      return;
    }

    // ✅ كلمة صحيحة
    turn.done = true;
    clearTimeout(turn.timer);
    const ms = receivedAt - turn.startedAt;
    const p = turn.player;
    p.words++;
    p.totalMs += ms;
    p.fastestMs = p.fastestMs === null ? ms : Math.min(p.fastestMs, ms);
    if ([...key].length > [...normalizeWord(p.longestWord)].length) p.longestWord = word;
    this.usedWords.add(key);
    this.log.push({ userId: p.id, word, ms });
    this.turnNumber++;
    void this.react(messageId, ms < 3000 ? "⚡" : "👍");

    this.notes.push(`✅ ${escapeHtml(p.name)}: <b>${escapeHtml(word)}</b> (${(ms / 1000).toFixed(1)} ث)`);
    await this.beginTurn(this.nextAliveAfter(p), lastLetter(key));
  }

  private onTimeout(turn: Turn) {
    if (turn.done || this.turn !== turn || this.isOver()) return;
    if (turn.checking) {
      // اللاعب كتب قبل انتهاء الوقت والكلمة بعدها تنفحص؛ ننتظر النتيجة
      turn.expiredWhileChecking = true;
      return;
    }
    void this.expire(turn).catch((e) => console.error("[Game] خطأ بانتهاء الوقت:", e));
  }

  /** انتهى الوقت: إذا عنده بطاقة تخطي تنستخدم تلقائياً، وإلا يطلع */
  private async expire(turn: Turn): Promise<void> {
    if (turn.player.skipCard) await this.skip(turn, true);
    else await this.eliminate(turn);
  }

  /** اللاعب ضغط زر التخطي */
  async useSkip(userId: number): Promise<string | null> {
    const turn = this.turn;
    if (this.state !== "playing" || !turn || turn.done) return "ماكو دور شغال هسه";
    if (turn.player.id !== userId) return "مو دورك ✋";
    if (!turn.player.skipCard) return "استخدمت بطاقتك من قبل 🃏";
    if (turn.checking) return "انتظر، كلمتك دا تنفحص ⏳";
    await this.skip(turn, false);
    return null;
  }

  private async skip(turn: Turn, auto: boolean): Promise<void> {
    if (turn.done) return;
    turn.done = true;
    clearTimeout(turn.timer);
    const p = turn.player;
    p.skipCard = false;
    p.skipsUsed++;
    this.turnNumber++;
    this.notes.push(
      auto
        ? `⏰ خلص وقت ${mention(p)} — انستخدمت بطاقة التخطي تلقائياً 🃏`
        : `🃏 ${mention(p)} استخدم بطاقة التخطي`,
    );
    // نفس الحرف ينتقل للاعب الي بعده
    await this.beginTurn(this.nextAliveAfter(p), turn.letter);
  }

  private async eliminate(turn: Turn): Promise<void> {
    if (turn.done) return;
    turn.done = true;
    clearTimeout(turn.timer);
    const p = turn.player;
    p.alive = false;
    p.eliminated = true;
    this.turnNumber++;
    this.notes.push(`⏰ انتهى الوقت! تم إقصاء ${mention(p)}`);

    const alive = this.alivePlayers();
    if (this.mode === "team") {
      const left = new Set(alive.map((x) => x.team));
      if (left.size <= 1) {
        const team = alive[0]?.team;
        await this.finish(team === undefined ? [] : this.order.filter((x) => x.team === team), team);
        return;
      }
    } else if (alive.length <= 1) {
      await this.finish(alive[0] ? [alive[0]] : []);
      return;
    }
    await this.beginTurn(this.nextAliveAfter(p), randomLetter());
  }

  // ───────────── النهاية ─────────────

  private async finish(winners: Player[], team?: 0 | 1): Promise<void> {
    if (this.isOver()) return;
    this.dispose();

    const notes = this.notes.length ? this.notes.join("\n") + "\n\n" : "";
    this.notes = [];
    const winner = winners.length === 1 && team === undefined ? winners[0] : null;

    if (team !== undefined && winners.length) {
      const style = TEAM_STYLE[team];
      const words = winners.reduce((a, p) => a + p.words, 0);
      const mvp = [...winners].sort((a, b) => b.words - a.words)[0];
      const caption =
        notes +
        `🏆 <b>فاز ${style.emoji} ${style.name}!</b>\n\n` +
        winners.map((p) => `• ${mention(p)} — ${p.words} كلمة`).join("\n") +
        `\n\n✍️ كلمات الفريق: ${words}\n` +
        (mvp.words ? `⭐ نجم الفريق: ${mention(mvp)}\n` : "") +
        `🔢 مجموع الكلمات بالجولة: ${this.log.length}`;
      const image = renderTeamWinner(this.teamViews()[team]);
      await this.api
        .sendPhoto(this.chatId, new InputFile(image, "team-winner.png"), { caption, parse_mode: "HTML" })
        .catch((e) => console.error("[Game] فشل إرسال صورة الفريق الفائز:", e));
    } else if (winner) {
      const avg = winner.words ? (winner.totalMs / winner.words / 1000).toFixed(1) : "—";
      const fastest = winner.fastestMs !== null ? (winner.fastestMs / 1000).toFixed(1) : "—";
      const caption =
        notes +
        `🏆 <b>الفائز:</b> ${mention(winner)}\n\n` +
        `✍️ الكلمات: ${winner.words}\n` +
        `⚡ متوسط السرعة: ${avg} ث\n` +
        `🚀 أسرع إجابة: ${fastest} ث\n` +
        `🔢 مجموع الكلمات بالجولة: ${this.log.length}`;
      const image = renderWinner(winner.name, winner.avatar!);
      await this.api
        .sendPhoto(this.chatId, new InputFile(image, "winner.png"), { caption, parse_mode: "HTML" })
        .catch((e) => console.error("[Game] فشل إرسال صورة الفائز:", e));
    } else {
      await this.api.sendMessage(this.chatId, notes + "انتهت الجولة بدون فائز.", { parse_mode: "HTML" }).catch(() => {});
    }

    const newTitles = await this.saveResults(winners).catch((e) => {
      console.error("[DB] فشل حفظ النتائج:", e);
      return [] as { player: Player; titles: Title[] }[];
    });

    // تهاني الألقاب الجديدة: رسالة وحدة بعد نهاية الجولة
    if (newTitles.length) {
      const lines = newTitles.map(
        ({ player, titles }) =>
          `🎉 تهانينا ${mention(player)}! حصلت على ${titles.length > 1 ? "الألقاب" : "لقب"} ${titles
            .map((t) => `«${titleLabel(t)}»`)
            .join(" و ")}`,
      );
      await this.api
        .sendMessage(this.chatId, "🏅 <b>ألقاب جديدة</b>\n\n" + lines.join("\n") + "\n\nاكتب <b>الالقاب</b> علمود تشوف ألقابك", {
          parse_mode: "HTML",
        })
        .catch(() => {});
    }
  }

  /** يحفظ النتائج ويرجع الألقاب الجديدة لكل لاعب */
  private async saveResults(winners: Player[]): Promise<{ player: Player; titles: Title[] }[]> {
    const winnerIds = new Set(winners.map((w) => w.id));
    const now = new Date();
    const ids = this.order.map((p) => p.id);
    const existing = new Map((await users.find({ _id: { $in: ids } }).toArray()).map((u) => [u._id, u]));
    const newTitles: { player: Player; titles: Title[] }[] = [];

    const ops = this.order.map((p) => {
      const old: Partial<UserStats> = existing.get(p.id) ?? {};
      const won = winnerIds.has(p.id);
      const winStreak = won ? (old.winStreak ?? 0) + 1 : 0;
      const longestLen = [...normalizeWord(p.longestWord)].length;
      const better = longestLen > (old.longestWordLen ?? 0);
      const merged = {
        gamesPlayed: (old.gamesPlayed ?? 0) + 1,
        wins: (old.wins ?? 0) + (won ? 1 : 0),
        words: (old.words ?? 0) + p.words,
        fastestMs:
          p.fastestMs === null ? old.fastestMs : Math.min(p.fastestMs, old.fastestMs ?? Number.POSITIVE_INFINITY),
        bestWinStreak: Math.max(old.bestWinStreak ?? 0, winStreak),
        longestWordLen: better ? longestLen : (old.longestWordLen ?? 0),
        bestWordsInGame: Math.max(old.bestWordsInGame ?? 0, p.words),
        flawlessWins: (old.flawlessWins ?? 0) + (won && p.skipsUsed === 0 ? 1 : 0),
        bigWins: (old.bigWins ?? 0) + (won && this.order.length >= 8 ? 1 : 0),
      };
      const had = new Set(old.titles ?? []);
      const fresh = earnedTitles(merged).filter((t) => !had.has(t.id));
      if (fresh.length) newTitles.push({ player: p, titles: fresh });

      return {
        updateOne: {
          filter: { _id: p.id },
          update: {
            $set: {
              name: p.name,
              username: p.username,
              updatedAt: now,
              winStreak,
              bestWinStreak: merged.bestWinStreak,
              bestWordsInGame: merged.bestWordsInGame,
              ...(better ? { longestWord: p.longestWord, longestWordLen: longestLen } : {}),
            },
            $setOnInsert: { createdAt: now },
            $inc: {
              gamesPlayed: 1,
              wins: won ? 1 : 0,
              words: p.words,
              totalResponseMs: p.totalMs,
              eliminations: p.eliminated ? 1 : 0,
              flawlessWins: won && p.skipsUsed === 0 ? 1 : 0,
              bigWins: won && this.order.length >= 8 ? 1 : 0,
              skipsUsed: p.skipsUsed,
            },
            ...(fresh.length ? { $addToSet: { titles: { $each: fresh.map((t) => t.id) } } } : {}),
            ...(p.fastestMs !== null ? { $min: { fastestMs: p.fastestMs } } : {}),
          },
          upsert: true,
        },
      };
    });
    await users.bulkWrite(ops);
    await gamesDb.insertOne({
      chatId: this.chatId,
      ownerId: this.owner.id,
      players: ids,
      winnerId: winners.length === 1 ? winners[0].id : null,
      winnerIds: [...winnerIds],
      mode: this.mode ?? "solo",
      words: this.log,
      startedAt: this.startedAt,
      endedAt: now,
    });
    return newTitles;
  }

  /** إيقاف الجولة يدوياً */
  async stop(byName: string): Promise<void> {
    const wasLobby = this.state === "lobby";
    this.dispose();
    if (wasLobby && this.lobbyMessageId) {
      await this.api.editMessageText(this.chatId, this.lobbyMessageId, "🛑 تم إلغاء الجولة.").catch(() => {});
    }
    await this.api
      .sendMessage(this.chatId, `🛑 تم إيقاف الجولة بواسطة ${escapeHtml(byName)}`, { parse_mode: "HTML" })
      .catch(() => {});
  }

  private dispose() {
    this.state = "ended";
    clearTimeout(this.lobbyTimer);
    if (this.turn) {
      this.turn.done = true;
      clearTimeout(this.turn.timer);
    }
    if (activeGames.get(this.chatId) === this) activeGames.delete(this.chatId);
  }

  private async react(messageId: number, emoji: ReactionTypeEmoji["emoji"]) {
    await this.api
      .setMessageReaction(this.chatId, messageId, [{ type: "emoji", emoji }])
      .catch(() => {});
  }
}
