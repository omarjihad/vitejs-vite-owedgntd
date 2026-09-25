import { createCanvas, type Image, type SKRSContext2D } from "@napi-rs/canvas";
import { config } from "../config.js";
import { alpha, drawAvatar, fitName, font, ring, roundRect, rtlText, safeName, watermark } from "./common.js";

export interface TurnInfo {
  name: string;
  avatar: Image;
  letter: string;
  seconds: number;
  levelName: string;
  /** لون المستوى: أخضر سهل، برتقالي متوسط، أحمر صعب */
  accent: string;
  number: number; // رقم اللاعب بالترتيب
}

function drawCross(ctx: SKRSContext2D, x: number, y: number, s: number) {
  ctx.beginPath();
  ctx.moveTo(x - s, y - s);
  ctx.lineTo(x + s, y + s);
  ctx.moveTo(x + s, y - s);
  ctx.lineTo(x - s, y + s);
  ctx.stroke();
}

/** يرسم الحرف بنص المربع بالضبط، ويصغره إذا طلع برا المربع */
function drawLetter(ctx: SKRSContext2D, letter: string, cx: number, cy: number, maxW: number, maxH: number) {
  let size = 170;
  // حرف واحد ما يحتاج اتجاه RTL، والقياسات مع ltr أدق
  ctx.direction = "ltr";
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  for (; size > 60; size -= 6) {
    ctx.font = font(size, 900);
    const m = ctx.measureText(letter);
    const h = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent;
    const w = m.actualBoundingBoxLeft + m.actualBoundingBoxRight;
    if (h <= maxH && w <= maxW) break;
  }
  const m = ctx.measureText(letter);
  const baseline = cy + (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2;
  const offsetX = (m.actualBoundingBoxLeft - m.actualBoundingBoxRight) / 2;
  ctx.fillText(letter, cx + offsetX, baseline);
}

/** الصورة الثانية: دور اللاعب + الوقت + الحرف */
export function renderTurn(info: TurnInfo): Buffer {
  const S = 900;
  const accent = info.accent;
  const canvas = createCanvas(S, S);
  const ctx = canvas.getContext("2d");

  roundRect(ctx, 0, 0, S, S, 36);
  ctx.fillStyle = "#1c1c1e";
  ctx.fill();
  ctx.save();
  ctx.clip();

  // نقشة علامات X الخفيفة بلون المستوى
  ctx.strokeStyle = alpha(accent, 0.1);
  ctx.lineWidth = 7;
  ctx.lineCap = "round";
  for (let row = 0; row < 7; row++) {
    for (let col = 0; col < 7; col++) {
      const x = col * 150 + (row % 2 ? 75 : 0) + 10;
      const y = row * 145 + 10;
      drawCross(ctx, x, y, 14);
    }
  }

  // اسم الكروب كبير وشفاف
  watermark(ctx, config.brandName, S, S, "#ffffff", 0.06);

  // الشريط الملون بالأسفل
  ctx.fillStyle = accent;
  ctx.fillRect(0, S - 12, S, 12);
  ctx.restore();

  // المستوى + رقم اللاعب
  ctx.fillStyle = accent;
  ctx.font = font(26, 900);
  rtlText(ctx, info.levelName, S - 40, 46, "right");
  ctx.fillStyle = "#9a9ca6";
  ctx.font = font(26, 700);
  ctx.direction = "ltr";
  ctx.textAlign = "left";
  ctx.fillText(`#${info.number}`, 40, 46);

  // الصورة الشخصية
  const cx = S / 2;
  const cy = 175;
  const r = 100;
  ctx.save();
  ctx.shadowColor = alpha(accent, 0.45);
  ctx.shadowBlur = 40;
  ctx.beginPath();
  ctx.arc(cx, cy, r + 4, 0, Math.PI * 2);
  ctx.fillStyle = "#1c1c1e";
  ctx.fill();
  ctx.restore();
  drawAvatar(ctx, info.avatar, cx, cy, r);
  ring(ctx, cx, cy, r + 4, accent, 8);

  // الاسم الكامل
  ctx.fillStyle = "#fff";
  const name = fitName(ctx, safeName(info.name), S - 120, 50, 28);
  ctx.direction = "inherit";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(name, cx, cy + r + 58);

  // الوقت
  const pillW = 260;
  const pillH = 62;
  const py = cy + r + 100;
  roundRect(ctx, cx - pillW / 2, py, pillW, pillH, 18);
  ctx.fillStyle = alpha(accent, 0.18);
  ctx.fill();
  ctx.strokeStyle = accent;
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.fillStyle = accent;
  ctx.font = font(30, 900);
  rtlText(ctx, `${info.seconds} ثانية`, cx, py + pillH / 2 + 2);

  // بطاقة الحرف مع توهج
  const boxW = 430;
  const boxH = 290;
  const bx = cx - boxW / 2;
  const by = py + pillH + 40;
  ctx.save();
  ctx.shadowColor = alpha(accent, 0.4);
  ctx.shadowBlur = 60;
  roundRect(ctx, bx, by, boxW, boxH, 26);
  ctx.fillStyle = "#1a1a1c";
  ctx.fill();
  ctx.restore();
  roundRect(ctx, bx, by, boxW, boxH, 26);
  ctx.strokeStyle = accent;
  ctx.lineWidth = 4;
  ctx.stroke();

  ctx.fillStyle = "#9a9ca6";
  ctx.font = font(26, 700);
  rtlText(ctx, "كلمة تبدأ بحرف", cx, by + 44);
  // مساحة الحرف: من تحت العنوان لحد قبل حافة المربع
  const top = by + 80;
  const bottom = by + boxH - 24;
  ctx.fillStyle = accent;
  drawLetter(ctx, info.letter, cx, (top + bottom) / 2, boxW - 80, bottom - top);

  // الاسم التجاري
  ctx.fillStyle = "#6e6e74";
  ctx.font = font(24, 500);
  ctx.direction = "inherit";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(`© ${config.brandName} ©`, cx, S - 42);

  return canvas.toBuffer("image/png");
}
