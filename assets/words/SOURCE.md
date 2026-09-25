# القاموس المدمج

## `ar.txt.gz` (~370 ألف كلمة)
كلمات بالشكل الموحد (الهمزات ← ا، ة ← ه، ى ← ي، چ ← ج، گ ← ك) مجمعة من:

| المصدر | المحتوى | الرخصة |
|---|---|---|
| [pyspellchecker](https://github.com/barrust/pyspellchecker) | ~120 ألف كلمة شائعة | MIT |
| [FrequencyWords](https://github.com/hermitdave/FrequencyWords) (ترجمات OpenSubtitles) | كل كلمة تكررت 5 مرات أو أكثر، بعد حذف التكرارات مثل «ههه» | CC BY-SA 4.0 |
| [Arramooz](https://github.com/linuxscout/arramooz) | ~30 ألف اسم و~14 ألف فعل من المعاجم العربية، مع «ال» | GPL |

لإعادة البناء:
```bash
python3 scripts/build_words.py --spell ar.json.gz --full ar_full.txt --arramooz arabicdictionary.sqlite
```

## `extra/*.txt` — قوائم تكدر تعدلها بنفسك
أسماء، حيوانات، كلمات عراقية، أماكن، أكلات، ومتفرقات. تنقرا وقت تشغيل البوت.
- اكتب الكلمات مفصولة بمسافات أو كل كلمة بسطر.
- السطر الي يبدي بـ `#` ملاحظة وما ينقرا.
- كل كلمة تنضاف وياها نسختها مع «ال» تلقائياً.
- تكدر تسوي ملف `.txt` جديد بنفس المجلد وينقرا هم.
