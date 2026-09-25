// يبني قاموس الكلمات العربية assets/words/ar.txt.gz من قائمة كلمات بصيغة JSON مضغوطة
// الاستخدام: npx tsx scripts/build-words.ts <path/to/ar.json.gz>
import fs from "node:fs";
import zlib from "node:zlib";
import { isArabicWord, normalizeWord } from "../src/arabic.js";

const src = process.argv[2];
if (!src) throw new Error("حدد مسار ملف ar.json.gz");
const data = JSON.parse(zlib.gunzipSync(fs.readFileSync(src)).toString("utf8")) as Record<string, number>;
const set = new Set<string>();
for (const word of Object.keys(data)) {
  const key = normalizeWord(word);
  if (key.length >= 2 && isArabicWord(key)) set.add(key);
}
const out = [...set].sort().join("\n");
fs.writeFileSync("assets/words/ar.txt.gz", zlib.gzipSync(out, { level: 9 }));
console.log(`✔ ${set.size} كلمة`);
