# مصدر القاموس

`ar.txt.gz` قائمة كلمات عربية (بالشكل الموحد: الهمزات ← ا، ة ← ه، ى ← ي) مأخوذة من
قائمة الكلمات العربية بمكتبة [pyspellchecker](https://github.com/barrust/pyspellchecker) (رخصة MIT)،
وهي مبنية على [FrequencyWords](https://github.com/hermitdave/FrequencyWords) من ترجمات OpenSubtitles
(المحتوى برخصة CC BY-SA 4.0).

لإعادة البناء: `npx tsx scripts/build-words.ts path/to/ar.json.gz`
