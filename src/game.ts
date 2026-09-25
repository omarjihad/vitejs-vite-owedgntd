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
import { games as gamesDb, users } from "./db.js";
import { renderLineup } from "./render/lineup.js";
import { renderTurn } from "./render/turn.js";
import { renderWinner } from "./render/winner.js";
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
}

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

  constructor(
    private readonly api: Api,
    readonly chatId: number,
    readonly owner: { id: number; name: string },
  ) {}

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
    });
    return "added";
  }

  removePlayer(userId: number): boolean {
    return this.players.delete(userId);
  }

  lobbyText(): string {
    const list = [...this.players.values()].map(mention).join(" | ") || "—";
    return (
      `🎮 تم بدء جولة بواسطة ${mention(this.owner)}\n\n` +
      `👥 المشاركين: ${this.players.size}\n` +
      `${list}\n\n` +
      `⚡ اضغط «انضمام» علمود تشارك (الحد الأدنى ${config.minPlayers} لاعبين)`
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
    if (!this.lobbyMessageId || this.state !== "lobby") return;
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
    await this.sendLobby();
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
      await this.api
        .editMessageText(
          this.chatId,
          this.lobbyMessageId,
          `🎮 بدأت الجولة! عدد المشاركين: ${this.players.size}`,
        )
        .catch(() => {});
    }
    const wait = await this.api.sendMessage(this.chatId, "⏳ يتم توزيع الأدوار، انتظر قليلاً...");

    // توزيع عشوائي (Fisher–Yates)
    const order = [...this.players.values()];
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    this.order = order;

    await Promise.all(
      order.map(async (p) => {
        p.avatar = await getAvatar(this.api, p.id, p.name);
      }),
    );
    if (this.isOver()) return;

    const image = renderLineup(
      order.map((p) => ({ name: p.name, avatar: p.avatar! })),
      levelForTurn(0).name,
    );
    const caption =
      "📋 <b>ترتيب اللاعبين</b>\n\n" +
      order.map((p, i) => `${i + 1}. ${mention(p)}`).join("\n") +
      "\n\n🔗 كمّل من آخر حرف بكلمة اللاعب الي قبلك!";
    await this.api.deleteMessage(this.chatId, wait.message_id).catch(() => {});
    await this.api.sendPhoto(this.chatId, new InputFile(image, "lineup.png"), {
      caption,
      parse_mode: "HTML",
    });

    this.state = "playing";
    await sleep(3000);
    if (this.isOver()) return;
    await this.beginTurn(order[0], randomLetter());
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
      number: this.order.indexOf(player) + 1,
    });

    const header = this.notes.length ? this.notes.join("\n") + "\n\n" : "";
    this.notes = [];
    const caption =
      header +
      `🎯 دورك يا ${mention(player)}\n` +
      `🔤 اكتب كلمة تبدأ بحرف « <b>${shown}</b> »\n` +
      `⏱ عندك ${level.seconds} ثانية — ${level.name}`;

    try {
      await this.api.sendPhoto(this.chatId, new InputFile(image, "turn.png"), {
        caption,
        parse_mode: "HTML",
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
      if (turn.expiredWhileChecking || Date.now() > turn.deadline) await this.eliminate(turn);
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
    void this.eliminate(turn).catch((e) => console.error("[Game] خطأ بالإقصاء:", e));
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
    if (alive.length <= 1) {
      await this.finish(alive[0] ?? null);
      return;
    }
    await this.beginTurn(this.nextAliveAfter(p), randomLetter());
  }

  // ───────────── النهاية ─────────────

  private async finish(winner: Player | null): Promise<void> {
    if (this.isOver()) return;
    this.dispose();

    const notes = this.notes.length ? this.notes.join("\n") + "\n\n" : "";
    this.notes = [];

    if (winner) {
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

    await this.saveResults(winner).catch((e) => console.error("[DB] فشل حفظ النتائج:", e));
  }

  private async saveResults(winner: Player | null): Promise<void> {
    const now = new Date();
    await users.bulkWrite(
      this.order.map((p) => ({
        updateOne: {
          filter: { _id: p.id },
          update: {
            $set: { name: p.name, username: p.username, updatedAt: now },
            $setOnInsert: { createdAt: now },
            $inc: {
              gamesPlayed: 1,
              wins: winner?.id === p.id ? 1 : 0,
              words: p.words,
              totalResponseMs: p.totalMs,
              eliminations: p.eliminated ? 1 : 0,
            },
            ...(p.fastestMs !== null ? { $min: { fastestMs: p.fastestMs } } : {}),
          },
          upsert: true,
        },
      })),
    );
    await gamesDb.insertOne({
      chatId: this.chatId,
      ownerId: this.owner.id,
      players: this.order.map((p) => p.id),
      winnerId: winner?.id ?? null,
      words: this.log,
      startedAt: this.startedAt,
      endedAt: now,
    });
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
