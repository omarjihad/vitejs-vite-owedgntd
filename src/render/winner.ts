import { createCanvas, type Image } from "@napi-rs/canvas";
import { colors, drawAvatar, fitText, font, ring, safeName } from "./common.js";

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
  const W = 1300;
  const H = 1024;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#0e0e10";
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W / 2, 480, 60, W / 2, 480, 650);
  glow.addColorStop(0, "rgba(201,146,43,0.22)");
  glow.addColorStop(1, "rgba(201,146,43,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  const cx = W / 2;
  const cy = 470;
  const r = 235;

  // الأشعة الذهبية والرمادية
  const rand = seeded(7);
  const rays = 64;
  for (let i = 0; i < rays; i++) {
    const angle = (i / rays) * Math.PI * 2 + rand() * 0.04;
    const inner = r + 30 + rand() * 30;
    const outer = inner + 150 + rand() * 230;
    const width = 10 + rand() * 18;
    const gold = i % 2 === 0;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(inner, -width * 0.25);
    ctx.lineTo(outer, -width / 2);
    ctx.lineTo(outer, width / 2);
    ctx.lineTo(inner, width * 0.25);
    ctx.closePath();
    ctx.fillStyle = gold ? colors.gold : colors.gray;
    ctx.globalAlpha = 0.95;
    ctx.fill();
    ctx.restore();
  }

  // الصورة داخل إطار ذهبي
  ring(ctx, cx, cy, r + 22, colors.gray, 6);
  ring(ctx, cx, cy, r + 10, colors.gold, 18);
  drawAvatar(ctx, avatar, cx, cy, r);

  // شريط صغير فوق الاسم
  ctx.fillStyle = colors.gold;
  ctx.beginPath();
  ctx.roundRect(cx - 105, 818, 210, 22, 11);
  ctx.fill();

  // لوحة الاسم المائلة
  const plateY = 858;
  const plateH = 116;
  const left = 330;
  const right = 1000;
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
  ctx.font = font(56, 900);
  const text = fitText(ctx, safeName(name), right - left - 120);
  ctx.direction = "inherit";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, (left + right) / 2, plateY + plateH / 2 + 4);

  return canvas.toBuffer("image/png");
}
