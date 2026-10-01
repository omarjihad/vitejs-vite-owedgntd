import { createCanvas, type Image } from "@napi-rs/canvas";
import { config } from "../config.js";
import { alpha, colors, drawAvatar, fitName, fitText, font, ring, roundRect, rtlText, safeName, watermark } from "./common.js";

export interface TitleCardItem {
  emoji: string;
  name: string;
  how: string;
  earned: boolean;
  current: number;
  target: number;
}

/** صورة الألقاب: المحصلة ذهبية فوق، والباقية رمادية وتحت كل وحدة شلون تحصلها ووين وصلت */
export function renderTitles(name: string, avatar: Image, items: TitleCardItem[]): Buffer {
  const W = 1000;
  const pad = 40;
  const gap = 18;
  const cardH = 150;
  const headerH = 300;
  const sorted = [...items.filter((t) => t.earned), ...items.filter((t) => !t.earned)];
  const rows = Math.ceil(sorted.length / 2);
  const H = headerH + rows * cardH + (rows - 1) * gap + 110;
  const earnedCount = items.filter((t) => t.earned).length;

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");
  roundRect(ctx, 0, 0, W, H, 40);
  ctx.fillStyle = colors.bg;
  ctx.fill();
  ctx.save();
  ctx.clip();
  const glow = ctx.createRadialGradient(W / 2, 80, 30, W / 2, 80, 560);
  glow.addColorStop(0, alpha(colors.gold, 0.28));
  glow.addColorStop(1, alpha(colors.gold, 0));
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
  watermark(ctx, config.brandName, W, H, "#ffffff", 0.04);
  ctx.restore();
  roundRect(ctx, 1, 1, W - 2, H - 2, 40);
  ctx.strokeStyle = colors.cardBorder;
  ctx.lineWidth = 2;
  ctx.stroke();

  // الرأس: الصورة والاسم والعدد
  const cx = W / 2;
  const cy = 115;
  const r = 70;
  drawAvatar(ctx, avatar, cx, cy, r);
  ring(ctx, cx, cy, r + 5, colors.gold, 7);
  ctx.fillStyle = "#fff";
  const nm = fitName(ctx, safeName(name), W - 2 * pad, 40, 24);
  ctx.direction = "inherit";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(nm, cx, cy + r + 40);
  ctx.fillStyle = colors.gold;
  ctx.font = font(28, 900);
  rtlText(ctx, `🏅 الألقاب ${earnedCount} / ${items.length}`, cx, cy + r + 88);

  const cardW = (W - 2 * pad - gap) / 2;
  sorted.forEach((t, i) => {
    const row = Math.floor(i / 2);
    const col = i % 2;
    const x = W - pad - (col + 1) * cardW - col * gap; // من اليمين
    const y = headerH + row * (cardH + gap);

    roundRect(ctx, x, y, cardW, cardH, 22);
    ctx.fillStyle = t.earned ? alpha(colors.gold, 0.13) : colors.card;
    ctx.fill();
    ctx.strokeStyle = t.earned ? colors.gold : colors.cardBorder;
    ctx.lineWidth = t.earned ? 3 : 2;
    ctx.stroke();

    // الأيقونة
    const ix = x + cardW - 60;
    const iy = y + 58;
    ctx.beginPath();
    ctx.arc(ix, iy, 38, 0, Math.PI * 2);
    ctx.fillStyle = t.earned ? alpha(colors.gold, 0.25) : "#2a2b33";
    ctx.fill();
    ctx.fillStyle = t.earned ? "#f7c948" : "#6b6d78";
    ctx.font = font(38, 700);
    ctx.direction = "ltr";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(t.emoji, ix, iy + 2);

    // الاسم والحالة
    const textRight = ix - 56;
    const textW = textRight - (x + 24);
    ctx.fillStyle = t.earned ? "#fff" : "#b9bac3";
    ctx.font = font(30, 900);
    rtlText(ctx, fitText(ctx, t.name, textW), textRight, y + 42, "right");
    ctx.fillStyle = t.earned ? colors.gold : colors.muted;
    ctx.font = font(21, 700);
    rtlText(ctx, fitText(ctx, t.earned ? "✅ محصّل" : `🔒 ${t.how}`, textW), textRight, y + 82, "right");

    // شريط التقدم للمقفولة
    if (!t.earned) {
      // العداد يسار الشريط بنفس السطر
      const counter = t.target > 1 ? 70 : 0;
      const bw = cardW - 48 - counter;
      const bx = x + 24 + counter;
      const by = y + cardH - 34;
      roundRect(ctx, bx, by, bw, 14, 7);
      ctx.fillStyle = "#2c2e37";
      ctx.fill();
      const frac = Math.min(1, t.current / t.target);
      if (frac > 0) {
        const fw = Math.max(14, bw * frac);
        roundRect(ctx, bx + bw - fw, by, fw, 14, 7);
        ctx.fillStyle = colors.gold;
        ctx.fill();
      }
      if (counter) {
        ctx.fillStyle = colors.muted;
        ctx.font = font(18, 700);
        ctx.direction = "ltr";
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(`${Math.min(t.current, t.target)}/${t.target}`, x + 22, by + 8);
      }
    }
  });

  ctx.fillStyle = "#6e6e74";
  ctx.font = font(24, 500);
  ctx.direction = "inherit";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(`© ${config.brandName} ©`, cx, H - 45);
  return canvas.toBuffer("image/png");
}
