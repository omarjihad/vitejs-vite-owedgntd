import { GlobalFonts, type Image, type SKRSContext2D } from "@napi-rs/canvas";
import path from "node:path";
import { fileURLToPath } from "node:url";

const fontsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../assets/fonts");
GlobalFonts.registerFromPath(path.join(fontsDir, "Cairo_500Medium.ttf"), "Cairo");
GlobalFonts.registerFromPath(path.join(fontsDir, "Cairo_700Bold.ttf"), "Cairo");
GlobalFonts.registerFromPath(path.join(fontsDir, "Cairo_900Black.ttf"), "Cairo");
// خطوط احتياطية علمود الأسماء المزخرفة (𝐒𝐀𝐒𝐔𝐊𝐄، 𝙸𝙲 • 𝐷𝑒𝑚𝑜𝑛) والرموز والإيموجي
GlobalFonts.registerFromPath(path.join(fontsDir, "NotoSans_700Bold.ttf"), "Noto Sans");
GlobalFonts.registerFromPath(path.join(fontsDir, "NotoSansMath_400Regular.ttf"), "Noto Sans Math");
GlobalFonts.registerFromPath(path.join(fontsDir, "NotoSansSymbols_700Bold.ttf"), "Noto Sans Symbols");
GlobalFonts.registerFromPath(path.join(fontsDir, "NotoSansSymbols2_400Regular.ttf"), "Noto Sans Symbols 2");
GlobalFonts.registerFromPath(path.join(fontsDir, "NotoEmoji_700Bold.ttf"), "Noto Emoji");

export const FONT = `Cairo, "Noto Sans", "Noto Sans Math", "Noto Sans Symbols", "Noto Sans Symbols 2", "Noto Emoji"`;

export const colors = {
  bg: "#161619",
  card: "#1f2027",
  cardBorder: "#2f313b",
  text: "#f3f3f5",
  muted: "#9a9ca6",
  red: "#e8493f",
  redDark: "#3a1d1d",
  gold: "#c9922b",
  gray: "#8c8c8c",
};

/**
 * الحروف الي الخطوط المدمجة تدعمها: لاتيني، يوناني، كيريلي، عربي، علامات وترقيم،
 * رموز وأشكال، الحروف المزخرفة (Math Alphanumerics)، رموز الخيمياء، والإيموجي.
 * أي شي غيرها ينشال علمود ما يطلع مربع فارغ.
 */
const SUPPORTED =
  /[ -ͯͰ-ӿ؀-ۿݐ-ݿࢠ-ࣿḀ-ỿ -⯿　-〿ﭐ-﷿︀-️ﹰ-﻿＀-￯\u{1D400}-\u{1D7FF}\u{1F000}-\u{1FAFF}]/u;

/** الاسم الكامل كما هو، بس نشيل الرموز الي ما نكدر نرسمها */
export function safeName(name: string): string {
  const cleaned = [...name.normalize("NFC")]
    .filter((ch) => SUPPORTED.test(ch))
    .join("")
    .replace(/\s+/g, " ")
    .trim();
  // إذا الاسم كله رموز غير مدعومة، نحوله للحروف العادية المقابلة
  return cleaned || name.normalize("NFKC").replace(/[^\p{L}\p{N}\s]/gu, "").trim() || "لاعب";
}

/** يصغر الخط لحد ما النص يوسع بالعرض، وإذا بعده طويل يقصه */
export function fitName(
  ctx: SKRSContext2D,
  text: string,
  maxWidth: number,
  size: number,
  minSize: number,
  weight: 500 | 700 | 900 = 900,
): string {
  let s = size;
  ctx.font = font(s, weight);
  while (s > minSize && ctx.measureText(text).width > maxWidth) {
    s -= 2;
    ctx.font = font(s, weight);
  }
  return fitText(ctx, text, maxWidth);
}

/** لون شفاف من لون hex */
export function alpha(hex: string, a: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 0xff},${n & 0xff},${a})`;
}

/** اسم الكروب بشكل كبير وشفاف بالخلفية */
export function watermark(ctx: SKRSContext2D, text: string, W: number, H: number, color = "#ffffff", opacity = 0.06) {
  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.rotate(-Math.atan2(H, W) * 0.6);
  // عرض النص المائل بحيث يبقى كامل داخل الصورة
  const target = Math.min(W, H) * 0.95;
  ctx.font = font(200, 900);
  const w = ctx.measureText(text).width;
  const size = Math.max(40, Math.min(260, (200 * target) / Math.max(1, w)));
  ctx.font = font(size, 900);
  ctx.fillStyle = alpha(color, opacity);
  ctx.direction = "inherit";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

export function font(size: number, weight: 500 | 700 | 900 = 700): string {
  return `${weight} ${size}px ${FONT}`;
}

export function roundRect(
  ctx: SKRSContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/** يقص النص إذا طويل ويحط … */
export function fitText(ctx: SKRSContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  const chars = [...text];
  while (chars.length > 1 && ctx.measureText(chars.join("") + "…").width > maxWidth) chars.pop();
  return chars.join("") + "…";
}

/** يرسم الصورة الشخصية داخل دائرة */
export function drawAvatar(ctx: SKRSContext2D, img: Image, cx: number, cy: number, r: number) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  const scale = Math.max((r * 2) / img.width, (r * 2) / img.height);
  const w = img.width * scale;
  const h = img.height * scale;
  ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h);
  ctx.restore();
}

export function ring(ctx: SKRSContext2D, cx: number, cy: number, r: number, color: string, width: number) {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}

/** نص بالعربي (من اليمين لليسار) */
export function rtlText(
  ctx: SKRSContext2D,
  text: string,
  x: number,
  y: number,
  align: CanvasTextAlign = "center",
) {
  ctx.direction = "rtl";
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.fillText(text, x, y);
}
