import { createCanvas, type Image } from "@napi-rs/canvas";
import { config } from "../config.js";
import { alpha, colors, drawAvatar, fitName, font, ring, roundRect, rtlText, safeName, watermark } from "./common.js";

export interface StatsCard {
  name: string;
  avatar: Image;
  /** اللقب الرئيسي مثل "👑 الأسطورة" */
  title: string | null;
  titlesEarned: number;
  titlesTotal: number;
  rank: number;
  tiles: { icon: string; label: string; value: string; color: string }[];
}

/** بطاقة الإحصائيات: الصورة والاسم واللقب فوق، والأرقام بمربعات مرتبة جوه */
export function renderStats(card: StatsCard): Buffer {
  const W = 1000;
  const pad = 50;
  const gap = 22;
  const cols = 2;
  const tileH = 130;
  const rows = Math.ceil(card.tiles.length / cols);
  const headerH = 520;
  const H = headerH + rows * tileH + (rows - 1) * gap + 230;

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");
  const accent = colors.gold;

  // الخلفية
  roundRect(ctx, 0, 0, W, H, 40);
  ctx.fillStyle = colors.bg;
  ctx.fill();
  ctx.save();
  ctx.clip();
  const glow = ctx.createRadialGradient(W / 2, 120, 30, W / 2, 120, 600);
  glow.addColorStop(0, alpha(accent, 0.28));
  glow.addColorStop(1, alpha(accent, 0));
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
  watermark(ctx, config.brandName, W, H, "#ffffff", 0.045);
  ctx.restore();
  roundRect(ctx, 1, 1, W - 2, H - 2, 40);
  ctx.strokeStyle = colors.cardBorder;
  ctx.lineWidth = 2;
  ctx.stroke();

  // الترتيب (يسار) والعنوان (يمين)
  roundRect(ctx, pad, 40, 150, 56, 18);
  ctx.fillStyle = alpha(accent, 0.18);
  ctx.fill();
  ctx.strokeStyle = accent;
  ctx.stroke();
  ctx.fillStyle = accent;
  ctx.font = font(28, 900);
  ctx.direction = "ltr";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(`#${card.rank}`, pad + 75, 69);

  ctx.fillStyle = colors.muted;
  ctx.font = font(28, 700);
  rtlText(ctx, "إحصائيات اللاعب", W - pad, 69, "right");

  // الصورة
  const cx = W / 2;
  const cy = 210;
  const r = 105;
  ctx.save();
  ctx.shadowColor = alpha(accent, 0.55);
  ctx.shadowBlur = 45;
  ctx.beginPath();
  ctx.arc(cx, cy, r + 6, 0, Math.PI * 2);
  ctx.fillStyle = colors.bg;
  ctx.fill();
  ctx.restore();
  drawAvatar(ctx, card.avatar, cx, cy, r);
  ring(ctx, cx, cy, r + 6, accent, 8);

  // الاسم
  ctx.fillStyle = "#fff";
  const name = fitName(ctx, safeName(card.name), W - 2 * pad, 50, 26);
  ctx.direction = "inherit";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(name, cx, cy + r + 60);

  // اللقب
  const titleText = card.title ?? "بدون لقب بعد";
  ctx.font = font(28, 900);
  const tw = Math.max(240, ctx.measureText(titleText).width + 70);
  const ty = cy + r + 105;
  roundRect(ctx, cx - tw / 2, ty, tw, 58, 29);
  ctx.fillStyle = card.title ? accent : "#2c2e37";
  ctx.fill();
  ctx.fillStyle = card.title ? "#1a1305" : colors.muted;
  rtlText(ctx, titleText, cx, ty + 30);

  // مربعات الأرقام
  const tileW = (W - 2 * pad - gap) / cols;
  card.tiles.forEach((t, i) => {
    const row = Math.floor(i / cols);
    const col = i % cols;
    // الترتيب من اليمين لليسار
    const x = W - pad - (col + 1) * tileW - col * gap;
    const y = headerH + row * (tileH + gap);

    roundRect(ctx, x, y, tileW, tileH, 24);
    ctx.fillStyle = colors.card;
    ctx.fill();
    ctx.strokeStyle = colors.cardBorder;
    ctx.lineWidth = 2;
    ctx.stroke();
    // شريط ملون صغير
    roundRect(ctx, x + tileW - 10, y + 22, 6, tileH - 44, 3);
    ctx.fillStyle = t.color;
    ctx.fill();

    // الأيقونة بدائرة
    const ix = x + 62;
    const iy = y + tileH / 2;
    ctx.beginPath();
    ctx.arc(ix, iy, 36, 0, Math.PI * 2);
    ctx.fillStyle = alpha(t.color, 0.16);
    ctx.fill();
    ctx.fillStyle = t.color;
    ctx.font = font(34, 700);
    ctx.direction = "ltr";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(t.icon, ix, iy + 2);

    // القيمة والعنوان
    const textRight = x + tileW - 34;
    ctx.fillStyle = "#fff";
    ctx.font = font(42, 900);
    rtlText(ctx, t.value, textRight, y + 50, "right");
    ctx.fillStyle = colors.muted;
    ctx.font = font(24, 700);
    rtlText(ctx, t.label, textRight, y + 96, "right");
  });

  // شريط تقدم الألقاب
  const by = headerH + rows * (tileH + gap) + 20;
  ctx.fillStyle = colors.text;
  ctx.font = font(28, 900);
  rtlText(ctx, "🏅 الألقاب", W - pad, by + 20, "right");
  ctx.fillStyle = accent;
  ctx.font = font(28, 900);
  ctx.direction = "ltr";
  ctx.textAlign = "left";
  ctx.fillText(`${card.titlesEarned} / ${card.titlesTotal}`, pad, by + 20);

  const barY = by + 52;
  const barW = W - 2 * pad;
  roundRect(ctx, pad, barY, barW, 22, 11);
  ctx.fillStyle = "#2c2e37";
  ctx.fill();
  const frac = card.titlesTotal ? card.titlesEarned / card.titlesTotal : 0;
  if (frac > 0) {
    // يتعبى من اليمين لليسار
    const fw = Math.max(22, barW * frac);
    roundRect(ctx, pad + barW - fw, barY, fw, 22, 11);
    const g = ctx.createLinearGradient(pad + barW, 0, pad + barW - fw, 0);
    g.addColorStop(0, "#f3c25b");
    g.addColorStop(1, accent);
    ctx.fillStyle = g;
    ctx.fill();
  }

  // الاسم التجاري
  ctx.fillStyle = "#6e6e74";
  ctx.font = font(24, 500);
  ctx.direction = "inherit";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(`© ${config.brandName} ©`, cx, H - 45);

  return canvas.toBuffer("image/png");
}
