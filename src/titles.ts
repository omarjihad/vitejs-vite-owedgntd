import type { UserStats } from "./db.js";

/** الأرقام الي نحتاجها لحساب الألقاب */
export type TitleStats = Pick<
  UserStats,
  "gamesPlayed" | "wins" | "words" | "fastestMs" | "bestWinStreak" | "longestWordLen" | "bestWordsInGame" | "flawlessWins" | "bigWins"
>;

export interface Title {
  id: string;
  emoji: string;
  name: string;
  /** شلون تحصل اللقب */
  how: string;
  /** [وين وصلت، الهدف] */
  progress: (s: TitleStats) => [number, number];
}

const n = (v: number | undefined | null) => v ?? 0;

/** مرتبة من الأسهل للأصعب، وآخر لقب محصل يطلع كلقب رئيسي بالبطاقة */
export const TITLES: Title[] = [
  { id: "rookie", emoji: "🐣", name: "المبتدئ", how: "العب أول جولة", progress: (s) => [n(s.gamesPlayed), 1] },
  { id: "first_win", emoji: "🏆", name: "أول انتصار", how: "افز بجولة وحدة", progress: (s) => [n(s.wins), 1] },
  { id: "writer", emoji: "✍️", name: "الكاتب", how: "اكتب 100 كلمة صحيحة", progress: (s) => [n(s.words), 100] },
  {
    id: "fast",
    emoji: "🚀",
    name: "الصاروخ",
    how: "جاوب بأقل من ثانيتين",
    progress: (s) => [s.fastestMs != null && s.fastestMs < 2000 ? 1 : 0, 1],
  },
  {
    id: "long_word",
    emoji: "📏",
    name: "النفس الطويل",
    how: "اكتب كلمة من 8 حروف أو أكثر",
    progress: (s) => [n(s.longestWordLen), 8],
  },
  { id: "regular", emoji: "🎮", name: "اللاعب الدائم", how: "العب 25 جولة", progress: (s) => [n(s.gamesPlayed), 25] },
  {
    id: "flawless",
    emoji: "💪",
    name: "الصامد",
    how: "افز بجولة بدون ما تستخدم بطاقة التخطي",
    progress: (s) => [n(s.flawlessWins), 1],
  },
  {
    id: "machine",
    emoji: "🎯",
    name: "الماكينة",
    how: "اكتب 10 كلمات بجولة وحدة",
    progress: (s) => [n(s.bestWordsInGame), 10],
  },
  {
    id: "lightning",
    emoji: "⚡",
    name: "البرق",
    how: "جاوب بأقل من ثانية وحدة",
    progress: (s) => [s.fastestMs != null && s.fastestMs < 1000 ? 1 : 0, 1],
  },
  {
    id: "survivor",
    emoji: "🛡️",
    name: "الناجي",
    how: "افز بجولة بيها 8 لاعبين أو أكثر",
    progress: (s) => [n(s.bigWins), 1],
  },
  { id: "champion", emoji: "🥇", name: "البطل", how: "افز 10 جولات", progress: (s) => [n(s.wins), 10] },
  {
    id: "unbeatable",
    emoji: "🔥",
    name: "لا يُقهر",
    how: "افز 3 جولات ورا بعض",
    progress: (s) => [n(s.bestWinStreak), 3],
  },
  {
    id: "dictionary",
    emoji: "📚",
    name: "القاموس المتنقل",
    how: "اكتب 1000 كلمة صحيحة",
    progress: (s) => [n(s.words), 1000],
  },
  { id: "addict", emoji: "🕹️", name: "المدمن", how: "العب 100 جولة", progress: (s) => [n(s.gamesPlayed), 100] },
  { id: "legend", emoji: "👑", name: "الأسطورة", how: "افز 50 جولة", progress: (s) => [n(s.wins), 50] },
];

export function hasTitle(t: Title, s: TitleStats): boolean {
  const [cur, target] = t.progress(s);
  return cur >= target;
}

export function earnedTitles(s: TitleStats): Title[] {
  return TITLES.filter((t) => hasTitle(t, s));
}

/** أعلى لقب محصل (آخر واحد بالترتيب) */
export function mainTitle(s: TitleStats): Title | null {
  const earned = earnedTitles(s);
  return earned[earned.length - 1] ?? null;
}

export function titleLabel(t: Title): string {
  return `${t.emoji} ${t.name}`;
}
