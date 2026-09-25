#!/usr/bin/env python3
"""يبني القاموس المدمج assets/words/ar.txt.gz من عدة مصادر.

الاستخدام:
  python3 scripts/build_words.py \
      --spell ar.json.gz \          # من مكتبة pyspellchecker
      --full ar_full.txt \          # من FrequencyWords (hermitdave)
      --arramooz arabicdictionary.sqlite

التوحيد لازم يطابق normalizeWord بـ src/arabic.ts.
"""
import argparse, gzip, json, re, sqlite3

TASHKEEL = re.compile("[ؐ-ًؚ-ٰٟۖ-ۭـ]")
MAP = str.maketrans({"أ": "ا", "إ": "ا", "آ": "ا", "ء": "ا", "ؤ": "ا", "ئ": "ا", "ٱ": "ا",
                     "ة": "ه", "ى": "ي", "ی": "ي", "چ": "ج", "گ": "ك", "ک": "ك", "ڤ": "ف", "پ": "ب"})
ARABIC = re.compile("^[ء-ي]+$")
TRIPLE = re.compile(r"(.)\1\1")  # حرف مكرر 3 مرات: ههه، ممم...


def norm(w: str) -> str:
    return TASHKEEL.sub("", w).strip().translate(MAP)


def ok(k: str) -> bool:
    return 2 <= len(k) <= 16 and bool(ARABIC.match(k)) and not TRIPLE.search(k)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--spell")
    ap.add_argument("--full")
    ap.add_argument("--full-min", type=int, default=5)
    ap.add_argument("--arramooz")
    ap.add_argument("--out", default="assets/words/ar.txt.gz")
    a = ap.parse_args()
    words: set[str] = set()

    def add(w, strict=False):
        k = norm(w)
        if ok(k) and (not strict or len(k) >= 3):
            words.add(k)

    if a.spell:
        for w in json.load(gzip.open(a.spell)):
            add(w)
        print("pyspellchecker:", len(words))

    if a.arramooz:
        db = sqlite3.connect(a.arramooz)
        for (w,) in db.execute("select unvocalized from nouns union select unvocalized from verbs"):
            if w:
                add(w)
                add("ال" + w)  # مع أداة التعريف
        print("+ arramooz:", len(words))

    if a.full:
        with open(a.full, encoding="utf8") as f:
            for line in f:
                parts = line.rsplit(" ", 1)
                if len(parts) != 2:
                    continue
                w, n = parts
                n = int(n)
                if n < a.full_min:
                    break  # الملف مرتب تنازلياً حسب التكرار
                # الكلمات الثنائية لازم تكون شائعة جداً علمود ما ندخل اختصارات غلط
                if len(norm(w)) == 2 and n < 5000:
                    continue
                add(w)
        print("+ FrequencyWords:", len(words))

    data = "\n".join(sorted(words)).encode("utf8")
    with gzip.open(a.out, "wb", compresslevel=9) as f:
        f.write(data)
    print(f"✔ {len(words)} كلمة ← {a.out}")


if __name__ == "__main__":
    main()
