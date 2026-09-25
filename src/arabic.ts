/** أدوات التعامل مع الحروف والكلمات العربية */

const TASHKEEL = /[ؐ-ًؚ-ٰٟۖ-ۭـ]/g; // حركات + تطويل
const ARABIC_WORD = /^[ء-ي]+$/;

/** الحروف الي يختار منها البوت عشوائياً (استبعدنا الحروف النادرة ببداية الكلمات) */
const START_LETTERS = [..."ابتثجحخدذرزسشصضطعغفقكلمنهوي"];
const RARE_START = new Set(["ث", "ذ", "ض", "ظ", "غ"]);

/** توحيد الحرف: كل أشكال الهمزة تنحسب "ا"، التاء المربوطة "ه"، الألف المقصورة "ي" */
export function normalizeLetter(ch: string): string {
  switch (ch) {
    case "أ":
    case "إ":
    case "آ":
    case "ء":
    case "ؤ":
    case "ئ":
    case "ٱ":
      return "ا";
    case "ة":
      return "ه";
    case "ى":
      return "ي";
    default:
      return ch;
  }
}

/** ينظف الكلمة من الحركات والتطويل والمسافات */
export function cleanWord(raw: string): string {
  return raw.replace(TASHKEEL, "").trim();
}

/** شكل موحد للكلمة يستخدم للمقارنة ومنع التكرار والتخزين المؤقت */
export function normalizeWord(word: string): string {
  return [...cleanWord(word)].map(normalizeLetter).join("");
}

export function isArabicWord(word: string): boolean {
  return ARABIC_WORD.test(word);
}

export function firstLetter(word: string): string {
  return normalizeLetter([...word][0] ?? "");
}

export function lastLetter(word: string): string {
  const chars = [...word];
  return normalizeLetter(chars[chars.length - 1] ?? "");
}

export function randomLetter(avoidRare = true): string {
  const pool = avoidRare ? START_LETTERS.filter((l) => !RARE_START.has(l)) : START_LETTERS;
  return pool[Math.floor(Math.random() * pool.length)];
}

/** الحرف كما يُعرض للاعب (ا يُعرض أ لأنه يشمل الهمزات) */
export function displayLetter(letter: string): string {
  return letter === "ا" ? "أ" : letter;
}
