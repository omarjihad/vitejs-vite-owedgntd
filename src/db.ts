import { MongoClient, type Collection, type Db } from "mongodb";
import { config } from "./config.js";

export interface UserStats {
  _id: number; // Telegram user id
  name: string;
  username?: string;
  gamesPlayed: number;
  wins: number;
  words: number;
  totalResponseMs: number;
  fastestMs?: number;
  eliminations: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface WordEntry {
  _id: string; // الكلمة بشكلها الموحد
  valid: boolean;
  source: "ai" | "manual";
  createdAt: Date;
}

export interface GameRecord {
  chatId: number;
  ownerId: number;
  players: number[];
  winnerId: number | null;
  words: { userId: number; word: string; ms: number }[];
  startedAt: Date;
  endedAt: Date;
}

let client: MongoClient;
let db: Db;

export let users: Collection<UserStats>;
export let words: Collection<WordEntry>;
export let games: Collection<GameRecord>;

export async function connectDb(): Promise<void> {
  client = new MongoClient(config.mongoUri);
  await client.connect();
  db = client.db(config.mongoDb);
  users = db.collection<UserStats>("users");
  words = db.collection<WordEntry>("words");
  games = db.collection<GameRecord>("games");
  await Promise.all([
    users.createIndex({ wins: -1 }),
    games.createIndex({ chatId: 1, endedAt: -1 }),
  ]);
}

export async function closeDb(): Promise<void> {
  await client?.close();
}
