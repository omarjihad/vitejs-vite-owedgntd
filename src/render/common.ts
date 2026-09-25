import { GlobalFonts, type Image, type SKRSContext2D } from "@napi-rs/canvas";
import path from "node:path";
import { fileURLToPath } from "node:url";

const fontsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../assets/fonts");
GlobalFonts.registerFromPath(path.join(fontsDir, "Cairo_500Medium.ttf"), "Cairo");
GlobalFonts.registerFromPath(path.join(fontsDir, "Cairo_700Bold.ttf"), "Cairo");
GlobalFonts.registerFromPath(path.join(fontsDir, "Cairo_900Black.ttf"), "Cairo");

export const FONT = "Cairo";

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

/** يشيل الرموز الي الخط ما يدعمها (إيموجي وزخارف) علمود ما تطلع مربعات */
export function safeName(name: string): string {
  const cleaned = name
    .replace(/[^ -~ -ɏ؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || "لاعب";
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
