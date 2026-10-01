import { createCanvas, type Image } from "@napi-rs/canvas";
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

/** صورة الفريق الفائز: كل أعضاءه بصورهم */
export function renderTeamWinner(team: TeamView): Buffer {
  const W = 1200;
  const n = team.players.length;
  const perRow = n <= 4 ? n : Math.ceil(n / 2);
  const rows = Math.ceil(n / perRow);
  const r = n <= 2 ? 150 : n <= 4 ? 115 : 90;
  const cellW = Math.min(300, (W - 100) / perRow);
  const cellH = r * 2 + 110;
  const top = 260;
  const H = top + rows * cellH + 140;

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#0e0e10";
  ctx.fillRect(0, 0, W, H);

  // أشعة ذهبية خفيفة من فوق
  ctx.save();
  ctx.translate(W / 2, 120);
  for (let i = 0; i < 36; i++) {
    ctx.rotate((Math.PI * 2) / 36);
    ctx.beginPath();
    ctx.moveTo(60, -6);
    ctx.lineTo(900, -26);
    ctx.lineTo(900, 26);
    ctx.lineTo(60, 6);
    ctx.closePath();
    ctx.fillStyle = i % 2 ? alpha(colors.gold, 0.08) : alpha(team.color, 0.07);
    ctx.fill();
  }
  ctx.restore();
  watermark(ctx, config.brandName, W, H, "#ffffff", 0.04);

  // العنوان
  ctx.fillStyle = colors.gold;
  ctx.font = font(40, 900);
  rtlText(ctx, "🏆 الفريق الفائز", W / 2, 80);
  const tw = 520;
  roundRect(ctx, (W - tw) / 2, 125, tw, 86, 43);
  ctx.fillStyle = team.color;
  ctx.fill();
  ctx.strokeStyle = colors.gold;
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.fillStyle = "#fff";
  ctx.font = font(46, 900);
  rtlText(ctx, team.name, W / 2, 170);

  team.players.forEach((p, i) => {
    const row = Math.floor(i / perRow);
    const inRow = Math.min(perRow, n - row * perRow);
    const col = i % perRow;
    const rowW = inRow * cellW;
    // من اليمين لليسار
    const cx = (W + rowW) / 2 - cellW * col - cellW / 2;
    const cy = top + row * cellH + r + 10;
    ctx.save();
    ctx.shadowColor = alpha(colors.gold, 0.5);
    ctx.shadowBlur = 35;
    ctx.beginPath();
    ctx.arc(cx, cy, r + 8, 0, Math.PI * 2);
    ctx.fillStyle = "#0e0e10";
    ctx.fill();
    ctx.restore();
    drawAvatar(ctx, p.avatar, cx, cy, r);
    ring(ctx, cx, cy, r + 5, colors.gold, 9);
    ctx.fillStyle = "#fff";
    const name = fitName(ctx, safeName(p.name), cellW - 20, 32, 18);
    ctx.direction = "inherit";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(name, cx, cy + r + 45);
  });

  ctx.fillStyle = "#6e6e74";
  ctx.font = font(24, 500);
  ctx.fillText(`© ${config.brandName} ©`, W / 2, H - 50);
  return canvas.toBuffer("image/png");
}
