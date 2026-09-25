import { createCanvas, type Image } from "@napi-rs/canvas";
import { config } from "../config.js";
import { colors, drawAvatar, fitText, font, ring, roundRect, rtlText, safeName } from "./common.js";

export interface LineupPlayer {
  name: string;
  avatar: Image;
}

/** الصورة الأولى: ترتيب اللاعبين بعد التوزيع العشوائي */
export function renderLineup(players: LineupPlayer[], levelName: string): Buffer {
  const W = 1280;
  const pad = 40;
  const gap = 24;
  const cardH = 92;
  const headerH = 130;
  const footerH = 80;
  const rows = Math.ceil(players.length / 2);
  const H = headerH + rows * cardH + (rows - 1) * gap + footerH + 20;

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  // الخلفية مع توهج أحمر خفيف بالأعلى
  roundRect(ctx, 0, 0, W, H, 36);
  ctx.fillStyle = colors.bg;
  ctx.fill();
  ctx.save();
  ctx.clip();
  const glow = ctx.createRadialGradient(W / 2, -40, 20, W / 2, -40, 620);
  glow.addColorStop(0, "rgba(232,73,63,0.35)");
  glow.addColorStop(1, "rgba(232,73,63,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
  roundRect(ctx, 1, 1, W - 2, H - 2, 36);
  ctx.strokeStyle = colors.cardBorder;
  ctx.lineWidth = 2;
  ctx.stroke();

  // العنوان
  ctx.fillStyle = colors.text;
  ctx.font = font(44, 900);
  rtlText(ctx, "ترتيب اللاعبين", W / 2, 66);

  // زر المستوى (يسار)
  roundRect(ctx, pad, 32, 290, 66, 20);
  ctx.fillStyle = colors.red;
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.font = font(28, 700);
  rtlText(ctx, levelName, pad + 145, 66);

  // عدد اللاعبين (يمين)
  roundRect(ctx, W - pad - 250, 32, 250, 66, 20);
  ctx.fillStyle = "#23242b";
  ctx.fill();
  ctx.strokeStyle = colors.cardBorder;
  ctx.stroke();
  ctx.fillStyle = colors.text;
  ctx.font = font(28, 700);
  rtlText(ctx, `${players.length} لاعبين`, W - pad - 125, 66);

  // البطاقات
  const cardW = (W - pad * 2 - gap) / 2;
  players.forEach((p, i) => {
    const row = Math.floor(i / 2);
    const col = i % 2;
    const isLoneLast = i === players.length - 1 && players.length % 2 === 1;
    // الرقم 1 باليسار مثل الصورة الأصلية، والفردي الأخير بالنص
    const x = isLoneLast ? (W - cardW) / 2 : pad + col * (cardW + gap);
    const y = headerH + row * (cardH + gap);
    const first = i === 0;

    roundRect(ctx, x, y, cardW, cardH, 24);
    const cg = ctx.createLinearGradient(x, y, x + cardW, y);
    cg.addColorStop(0, first ? "#2a1f28" : "#20212a");
    cg.addColorStop(1, "#1b1c23");
    ctx.fillStyle = cg;
    ctx.fill();
    ctx.strokeStyle = first ? colors.red : colors.cardBorder;
    ctx.lineWidth = first ? 3 : 2;
    ctx.stroke();

    const r = 32;
    const ax = x + 18 + r;
    const ay = y + cardH / 2;
    drawAvatar(ctx, p.avatar, ax, ay, r);
    ring(ctx, ax, ay, r + 1, first ? colors.red : "#3a3c46", 3);

    // الرقم
    const bx = x + cardW - 18 - 52;
    roundRect(ctx, bx, ay - 24, 52, 48, 14);
    ctx.fillStyle = first ? colors.red : "#2c2e37";
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = font(24, 700);
    ctx.direction = "ltr";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(i + 1), bx + 26, ay + 1);

    // الاسم
    ctx.fillStyle = colors.text;
    ctx.font = font(28, 700);
    const nameX = ax + r + 18;
    const maxW = bx - nameX - 16;
    const name = fitText(ctx, safeName(p.name), maxW);
    ctx.direction = "inherit";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(name, nameX, ay + 2);
  });

  // التبويب السفلي
  const tabW = 300;
  const tabH = 54;
  const tx = (W - tabW) / 2;
  const ty = H - tabH + 2;
  roundRect(ctx, tx, ty, tabW, tabH + 20, 16);
  ctx.fillStyle = "#101013";
  ctx.fill();
  ctx.strokeStyle = colors.cardBorder;
  ctx.stroke();
  ctx.fillStyle = "#c9c9cf";
  ctx.font = font(30, 900);
  ctx.direction = "ltr";
  ctx.textAlign = "center";
  ctx.letterSpacing = "14px";
  ctx.fillText(config.brandName.toUpperCase(), W / 2 + 7, ty + tabH / 2);
  ctx.letterSpacing = "0px";

  return canvas.toBuffer("image/png");
}
