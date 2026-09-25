import Anthropic from "@anthropic-ai/sdk";
import { config } from "./config.js";
import { words } from "./db.js";

/**
 * فحص الكلمات:
 * 1) ذاكرة مؤقتة داخل البرنامج (فورية)
 * 2) قاعدة MongoDB للكلمات الي انفحصت قبل (سريعة جداً)
 * 3) الذكاء الاصطناعي (Claude) للكلمات الجديدة، والنتيجة تنحفظ للمرات الجاية
 */

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

  const verdict = await askAi(original);
  if (verdict === null) {
    // ما قدرنا نتأكد: ما نخزن النتيجة، ونطبق السياسة المختارة
    return config.aiEnabled ? config.aiFailOpen : true;
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
