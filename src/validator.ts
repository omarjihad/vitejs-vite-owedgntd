import Anthropic from "@anthropic-ai/sdk";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";
import { config } from "./config.js";
import { cleanWord, isArabicWord, normalizeWord } from "./arabic.js";
import { words } from "./db.js";

/**
 * فحص الكلمات (مجاني بالكامل بشكل افتراضي):
 * 1) ذاكرة مؤقتة داخل البرنامج (فورية)
 * 2) قاعدة MongoDB: الكلمات الي ضافها أو حذفها المشرفين، ونتائج الذكاء الاصطناعي السابقة
 * 3) القاموس العربي المدمج (~120 ألف كلمة، بدون إنترنت)
 * 4) الذكاء الاصطناعي (Claude) — اختياري، بس إذا حطيت ANTHROPIC_API_KEY
 */

const wordsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../assets/words");
const dictionary = new Set(
  zlib.gunzipSync(fs.readFileSync(path.join(wordsDir, "ar.txt.gz"))).toString("utf8").split("\n"),
);

/**
 * القوائم الإضافية بمجلد assets/words/extra (أسماء، حيوانات، كلمات عراقية...).
 * ملفات نص عادية تكدر تعدلها وتضيف عليها: كلمات مفصولة بمسافات أو أسطر، والسطر الي يبدي بـ # ملاحظة.
 */
function loadExtraLists(): number {
  const dir = path.join(wordsDir, "extra");
  let added = 0;
  for (const file of fs.existsSync(dir) ? fs.readdirSync(dir) : []) {
    if (!file.endsWith(".txt")) continue;
    for (const line of fs.readFileSync(path.join(dir, file), "utf8").split("\n")) {
      if (line.trim().startsWith("#")) continue;
      for (const token of line.split(/\s+/)) {
        const word = cleanWord(token);
        if (!word || !isArabicWord(word)) continue;
        const key = normalizeWord(word);
        if (key.length < 2) continue;
        if (!dictionary.has(key)) added++;
        dictionary.add(key);
        // الأسماء والكلمات بدون "ال" نضيفها وياها هم (مثلاً: زرافة ← الزرافة)
        if (!key.startsWith("ال")) dictionary.add("ال" + key);
      }
    }
  }
  return added;
}
const extra = loadExtraLists();
console.log(`✔ القاموس: ${dictionary.size} كلمة (${extra} كلمة جديدة من القوائم الإضافية)`);

const memory = new Map<string, boolean>();
const inflight = new Map<string, Promise<boolean>>();
const MEMORY_LIMIT = 50_000;

const client = config.aiEnabled ? new Anthropic({ maxRetries: 0 }) : null;

const SYSTEM_PROMPT = `You judge words for an Arabic word-chain game played by Iraqi and Arab players.
Decide whether the given text is a real, meaningful Arabic word.
Accept: Modern Standard Arabic nouns, verbs (any conjugation), adjectives, plurals, words with attached pronouns or the article "ال", well-known proper nouns (countries, cities, famous people, common first names), and widely used colloquial/Iraqi words.
Reject: random letter sequences, misspellings that change the word into nonsense, meaningless repetitions, and incomplete fragments.
Spelling variations of hamza (أ/إ/ا/ء) and taa marbuta vs haa (ة/ه) and alif maqsura vs yaa (ى/ي) are acceptable.`;

function remember(key: string, valid: boolean) {
  if (memory.size >= MEMORY_LIMIT) {
    const oldest = memory.keys().next().value;
    if (oldest !== undefined) memory.delete(oldest);
  }
  memory.set(key, valid);
}

async function askAi(word: string): Promise<boolean | null> {
  if (!client) return null;
  try {
    const response = await client.beta.messages.create(
      {
        model: config.aiModel,
        max_tokens: 2048,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: {
          effort: "low",
          format: {
            type: "json_schema",
            schema: {
              type: "object",
              properties: { valid: { type: "boolean" } },
              required: ["valid"],
              additionalProperties: false,
            },
          },
        },
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: `Word: ${word}` }],
      },
      { timeout: config.aiTimeoutMs },
    );

    if (response.stop_reason === "refusal") return null;
    for (const block of response.content) {
      if (block.type === "text") {
        const parsed = JSON.parse(block.text) as { valid?: unknown };
        if (typeof parsed.valid === "boolean") return parsed.valid;
      }
    }
    return null;
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) {
      console.warn("[AI] تجاوز حد الطلبات");
    } else if (err instanceof Anthropic.APIConnectionTimeoutError) {
      console.warn("[AI] انتهت مهلة الطلب:", word);
    } else if (err instanceof Anthropic.APIError) {
      console.error("[AI] خطأ من الـ API:", err.status, err.message);
    } else {
      console.error("[AI] خطأ غير متوقع:", err);
    }
    return null;
  }
}

async function lookup(key: string, original: string): Promise<boolean> {
  try {
    const cached = await words.findOne({ _id: key });
    if (cached) return cached.valid;
  } catch (err) {
    console.error("[DB] فشل قراءة الكلمة:", err);
  }

  if (dictionary.has(key)) return true;
  if (!config.aiEnabled) return false;

  const verdict = await askAi(original);
  if (verdict === null) {
    // ما قدرنا نتأكد: ما نخزن النتيجة، ونطبق السياسة المختارة
    return config.aiFailOpen;
  }
  try {
    await words.updateOne(
      { _id: key },
      { $setOnInsert: { valid: verdict, source: "ai", createdAt: new Date() } },
      { upsert: true },
    );
  } catch (err) {
    console.error("[DB] فشل حفظ الكلمة:", err);
  }
  return verdict;
}

/** @param key الشكل الموحد للكلمة  @param original الكلمة كما كتبها اللاعب */
export async function isValidWord(key: string, original: string): Promise<boolean> {
  const hit = memory.get(key);
  if (hit !== undefined) return hit;

  let pending = inflight.get(key);
  if (!pending) {
    pending = lookup(key, original).finally(() => inflight.delete(key));
    inflight.set(key, pending);
  }
  const valid = await pending;
  remember(key, valid);
  return valid;
}

/** إضافة كلمة يدوياً (valid=true) أو منعها (valid=false) */
export async function setWord(key: string, valid: boolean): Promise<void> {
  await words.updateOne(
    { _id: key },
    { $set: { valid, source: "manual", createdAt: new Date() } },
    { upsert: true },
  );
  remember(key, valid);
}

export function inDictionary(key: string): boolean {
  return dictionary.has(key);
}
