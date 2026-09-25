import { createCanvas, type Image } from "@napi-rs/canvas";
import { config } from "../config.js";
import { colors, drawAvatar, fitName, font, ring, rtlText, safeName, watermark } from "./common.js";

/** رقم عشوائي ثابت حسب البذرة علمود الأشعة تطلع نفس الشكل */
function seeded(seed: number) {
  let s = seed || 1;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/** الصورة الثالثة: الفائز */
export function renderWinner(name: string, avatar: Image): Buffer {
  const W = 1200;
  const H = 1200;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#0e0e10";
  ctx.fillRect(0, 0, W, H);
  const cx = W / 2;
  const cy = 560;
  const r = 230;
  const glow = ctx.createRadialGradient(cx, cy, 60, cx, cy, 620);
  glow.addColorStop(0, "rgba(201,146,43,0.22)");
  glow.addColorStop(1, "rgba(201,146,43,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
  watermark(ctx, config.brandName, W, H, "#ffffff", 0.04);

  // مكان العنوان ولوحة الاسم (الأشعة ما توصلهم)
  const titleBottom = 125;
  const plateY = 1030;
  const plateH = 116;
  const margin = 24;

  // الأشعة الذهبية والرمادية — طولها محدود علمود تبقى داخل الصورة
  const rand = seeded(7);
  const rays = 64;
  for (let i = 0; i < rays; i++) {
    const angle = (i / rays) * Math.PI * 2 + rand() * 0.04;
    const inner = r + 34 + rand() * 24;
    const wanted = inner + 120 + rand() * 220;
    const width = 10 + rand() * 16;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const maxOuter = Math.min(
      cos > 0 ? (W - margin - cx) / cos : cos < 0 ? (margin - cx) / cos : Infinity,
      sin < 0 ? (titleBottom - cy) / sin : sin > 0 ? (plateY - 70 - cy) / sin : Infinity,
    );
    const outer = Math.min(wanted, maxOuter);
    if (outer - inner < 40) continue;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(inner, -width * 0.25);
    ctx.lineTo(outer, -width / 2);
    ctx.lineTo(outer, width / 2);
    ctx.lineTo(inner, width * 0.25);
    ctx.closePath();
    ctx.fillStyle = i % 2 === 0 ? colors.gold : colors.gray;
    ctx.fill();
    ctx.restore();
  }

  // الصورة داخل إطار ذهبي
  ctx.save();
  ctx.shadowColor = "rgba(201,146,43,0.6)";
  ctx.shadowBlur = 50;
  ctx.beginPath();
  ctx.arc(cx, cy, r + 20, 0, Math.PI * 2);
  ctx.fillStyle = "#0e0e10";
  ctx.fill();
  ctx.restore();
  drawAvatar(ctx, avatar, cx, cy, r);
  ring(ctx, cx, cy, r + 10, colors.gold, 18);
  ring(ctx, cx, cy, r + 22, colors.gray, 5);

  // شريط صغير فوق الاسم
  ctx.fillStyle = colors.gold;
  ctx.beginPath();
  ctx.roundRect(cx - 105, plateY - 42, 210, 22, 11);
  ctx.fill();

  // لوحة الاسم المائلة
  const left = 230;
  const right = W - 230;
  const skew = 40;
  ctx.beginPath();
  ctx.moveTo(left + skew, plateY);
  ctx.lineTo(right, plateY);
  ctx.lineTo(right - skew, plateY + plateH);
  ctx.lineTo(left, plateY + plateH);
  ctx.closePath();
  ctx.fillStyle = "#26262a";
  ctx.fill();
  ctx.strokeStyle = colors.gold;
  ctx.lineWidth = 3;
  ctx.stroke();
  // الشريحة الذهبية الجانبية
  ctx.beginPath();
  ctx.moveTo(left + skew - 40, plateY);
  ctx.lineTo(left + skew - 8, plateY);
  ctx.lineTo(left - 8, plateY + plateH);
  ctx.lineTo(left - 40, plateY + plateH);
  ctx.closePath();
  ctx.fillStyle = colors.gold;
  ctx.fill();

  ctx.fillStyle = "#fff";
  const text = fitName(ctx, safeName(name), right - left - 110, 58, 26);
  ctx.direction = "inherit";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, (left + right) / 2, plateY + plateH / 2 + 4);

  // العنوان
  ctx.fillStyle = colors.gold;
  ctx.font = font(46, 900);
  rtlText(ctx, "الفائز", cx, 70);

  return canvas.toBuffer("image/png");
}
