import { createCanvas, type Image, type SKRSContext2D } from "@napi-rs/canvas";
import { config } from "../config.js";
import { alpha, colors, drawAvatar, fitName, font, ring, roundRect, rtlText, safeName, watermark } from "./common.js";

export interface TeamView {
  name: string;
  color: string;
  players: { name: string; avatar: Image; number: number }[];
}

export const TEAM_STYLE = [
  { name: "الفريق الأول", color: "#3d8bfd", emoji: "🔵" },
  { name: "الفريق الثاني", color: "#a35cff", emoji: "🟣" },
] as const;

/** صورة الفرق: الفريق الأول يمين والثاني يسار، وكل لاعب برقم دوره */
export function renderTeams(teams: [TeamView, TeamView], levelName: string, accent: string): Buffer {
  const W = 1280;
  const pad = 40;
  const midGap = 90;
  const cardH = 92;
  const gap = 20;
  const headerH = 130;
  const teamHeadH = 80;
  const rows = Math.max(teams[0].players.length, teams[1].players.length);
  const H = headerH + teamHeadH + rows * cardH + (rows - 1) * gap + 110;

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  roundRect(ctx, 0, 0, W, H, 36);
  ctx.fillStyle = colors.bg;
  ctx.fill();
  ctx.save();
  ctx.clip();
  // توهج بلون كل فريق بجهته
  teams.forEach((t, i) => {
    const gx = i === 0 ? W * 0.78 : W * 0.22;
    const g = ctx.createRadialGradient(gx, 0, 20, gx, 0, 560);
    g.addColorStop(0, alpha(t.color, 0.3));
    g.addColorStop(1, alpha(t.color, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  });
  watermark(ctx, config.brandName, W, H, "#ffffff", 0.05);
  ctx.restore();
  roundRect(ctx, 1, 1, W - 2, H - 2, 36);
  ctx.strokeStyle = colors.cardBorder;
  ctx.lineWidth = 2;
  ctx.stroke();

  // العنوان والمستوى
  ctx.fillStyle = colors.text;
  ctx.font = font(44, 900);
  rtlText(ctx, "وضع الفرق", W / 2, 66);
  roundRect(ctx, pad, 32, 290, 66, 20);
  ctx.fillStyle = accent;
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.font = font(28, 700);
  rtlText(ctx, levelName, pad + 145, 66);
  roundRect(ctx, W - pad - 250, 32, 250, 66, 20);
  ctx.fillStyle = "#23242b";
  ctx.fill();
  ctx.strokeStyle = colors.cardBorder;
  ctx.stroke();
  ctx.fillStyle = colors.text;
  rtlText(ctx, `${teams[0].players.length + teams[1].players.length} لاعبين`, W - pad - 125, 66);

  const colW = (W - 2 * pad - midGap) / 2;
  teams.forEach((team, ti) => {
    // الفريق الأول على اليمين (اتجاه القراءة العربي)
    const x = ti === 0 ? W - pad - colW : pad;
    const hy = headerH;

    // رأس الفريق
    roundRect(ctx, x, hy, colW, teamHeadH - 14, 20);
    ctx.fillStyle = alpha(team.color, 0.2);
    ctx.fill();
    ctx.strokeStyle = team.color;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = team.color;
    ctx.font = font(32, 900);
    rtlText(ctx, `${team.name} (${team.players.length})`, x + colW / 2, hy + (teamHeadH - 14) / 2 + 2);

    team.players.forEach((p, i) => {
      const y = headerH + teamHeadH + i * (cardH + gap);
      roundRect(ctx, x, y, colW, cardH, 22);
      ctx.fillStyle = colors.card;
      ctx.fill();
      ctx.strokeStyle = alpha(team.color, 0.55);
      ctx.lineWidth = 2;
      ctx.stroke();

      const r = 31;
      const ax = x + colW - 18 - r; // الصورة يمين البطاقة
      const ay = y + cardH / 2;
      drawAvatar(ctx, p.avatar, ax, ay, r);
      ring(ctx, ax, ay, r + 1, team.color, 3);

      // رقم الدور يسار البطاقة
      const bx = x + 18;
      roundRect(ctx, bx, ay - 24, 52, 48, 14);
      ctx.fillStyle = team.color;
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.font = font(24, 900);
      ctx.direction = "ltr";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(p.number), bx + 26, ay + 1);

      ctx.fillStyle = colors.text;
      const maxW = ax - r - 16 - (bx + 52 + 16);
      const name = fitName(ctx, safeName(p.name), maxW, 28, 18, 700);
      ctx.direction = "inherit";
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.fillText(name, ax - r - 16, ay + 2);
    });
  });

  // VS بالنص
  const vy = headerH + teamHeadH + Math.min(rows, 3) * (cardH + gap) / 2;
  ctx.beginPath();
  ctx.arc(W / 2, vy, 38, 0, Math.PI * 2);
  ctx.fillStyle = "#101013";
  ctx.fill();
  ctx.strokeStyle = colors.gold;
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.fillStyle = colors.gold;
  ctx.font = font(30, 900);
  ctx.direction = "ltr";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("VS", W / 2, vy + 2);

  ctx.fillStyle = "#6e6e74";
  ctx.font = font(24, 500);
  ctx.direction = "inherit";
  ctx.fillText(`© ${config.brandName} ©`, W / 2, H - 45);

  return canvas.toBuffer("image/png");
}

function drawStar(ctx: SKRSContext2D, cx: number, cy: number, outer: number, inner: number) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

/** صورة الفريق الفائز: نجم الفريق كبير بالنص مع نجمة، والباقين تحته */
export function renderTeamWinner(team: TeamView, mvpIndex = -1): Buffer {
  const W = 1200;
  const mvp = mvpIndex >= 0 ? team.players[mvpIndex] : null;
  const others = team.players.filter((_, i) => i !== mvpIndex);
  const perRow = Math.min(5, Math.max(1, others.length));
  const rows = Math.ceil(others.length / perRow);
  const r = mvp ? 72 : others.length <= 2 ? 140 : others.length <= 4 ? 110 : 88;
  const cellW = Math.min(mvp ? 220 : 300, (W - 100) / perRow);
  const cellH = r * 2 + 95;
  const mvpR = 150;
  const top = 250;
  const mvpBlock = mvp ? mvpR * 2 + 170 : 0;
  const H = top + mvpBlock + rows * cellH + 120;

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#0e0e10";
  ctx.fillRect(0, 0, W, H);

  // أشعة خفيفة من مكان النجم
  const rayY = mvp ? top + mvpR + 20 : 120;
  ctx.save();
  ctx.translate(W / 2, rayY);
  for (let i = 0; i < 36; i++) {
    ctx.rotate((Math.PI * 2) / 36);
    ctx.beginPath();
    ctx.moveTo(60, -6);
    ctx.lineTo(1000, -30);
    ctx.lineTo(1000, 30);
    ctx.lineTo(60, 6);
    ctx.closePath();
    ctx.fillStyle = i % 2 ? alpha(colors.gold, 0.09) : alpha(team.color, 0.07);
    ctx.fill();
  }
  ctx.restore();
  watermark(ctx, config.brandName, W, H, "#ffffff", 0.04);

  // العنوان
  ctx.fillStyle = colors.gold;
  ctx.font = font(40, 900);
  rtlText(ctx, "🏆 الفريق الفائز", W / 2, 75);
  const tw = 520;
  roundRect(ctx, (W - tw) / 2, 118, tw, 86, 43);
  ctx.fillStyle = team.color;
  ctx.fill();
  ctx.strokeStyle = colors.gold;
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.fillStyle = "#fff";
  ctx.font = font(46, 900);
  rtlText(ctx, team.name, W / 2, 163);

  // نجم الفريق
  if (mvp) {
    const cx = W / 2;
    const cy = top + mvpR + 20;
    ctx.save();
    ctx.shadowColor = alpha(colors.gold, 0.8);
    ctx.shadowBlur = 70;
    ctx.beginPath();
    ctx.arc(cx, cy, mvpR + 12, 0, Math.PI * 2);
    ctx.fillStyle = "#0e0e10";
    ctx.fill();
    ctx.restore();
    drawAvatar(ctx, mvp.avatar, cx, cy, mvpR);
    ring(ctx, cx, cy, mvpR + 8, colors.gold, 14);

    // نجمة ذهبية كبيرة على الإطار
    const sx = cx + mvpR * 0.72;
    const sy = cy - mvpR * 0.72;
    drawStar(ctx, sx, sy, 50, 22);
    ctx.fillStyle = "#f7c948";
    ctx.fill();
    ctx.lineWidth = 5;
    ctx.strokeStyle = "#0e0e10";
    ctx.stroke();

    // شريط «نجم الفريق»
    const ribbonW = 300;
    const ry = cy + mvpR + 22;
    roundRect(ctx, cx - ribbonW / 2, ry, ribbonW, 54, 27);
    ctx.fillStyle = colors.gold;
    ctx.fill();
    ctx.fillStyle = "#1a1305";
    ctx.font = font(30, 900);
    rtlText(ctx, "⭐ نجم الفريق ⭐", cx, ry + 28);

    ctx.fillStyle = "#fff";
    const name = fitName(ctx, safeName(mvp.name), W - 200, 46, 24);
    ctx.direction = "inherit";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(name, cx, ry + 100);
  }

  // باقي الأعضاء
  const rowsTop = top + mvpBlock + (mvp ? 10 : 0);
  others.forEach((p, i) => {
    const row = Math.floor(i / perRow);
    const inRow = Math.min(perRow, others.length - row * perRow);
    const col = i % perRow;
    const rowW = inRow * cellW;
    const cx = (W + rowW) / 2 - cellW * col - cellW / 2;
    const cy = rowsTop + row * cellH + r + 10;
    ctx.beginPath();
    ctx.arc(cx, cy, r + 6, 0, Math.PI * 2);
    ctx.fillStyle = "#0e0e10";
    ctx.fill();
    drawAvatar(ctx, p.avatar, cx, cy, r);
    ring(ctx, cx, cy, r + 4, mvp ? team.color : colors.gold, mvp ? 6 : 9);
    ctx.fillStyle = "#e6e6ea";
    const name = fitName(ctx, safeName(p.name), cellW - 20, mvp ? 26 : 32, 16);
    ctx.direction = "inherit";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(name, cx, cy + r + 38);
  });

  ctx.fillStyle = "#6e6e74";
  ctx.font = font(24, 500);
  ctx.fillText(`© ${config.brandName} ©`, W / 2, H - 50);
  return canvas.toBuffer("image/png");
}
