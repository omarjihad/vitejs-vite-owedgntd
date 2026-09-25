import { createCanvas, type Image, type SKRSContext2D } from "@napi-rs/canvas";
import { config } from "../config.js";
import { colors, drawAvatar, fitText, font, ring, roundRect, rtlText, safeName } from "./common.js";

export interface TurnInfo {
  name: string;
  avatar: Image;
  letter: string;
  seconds: number;
  levelName: string;
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

/** الصورة الثانية: دور اللاعب + الوقت + الحرف */
export function renderTurn(info: TurnInfo): Buffer {
  const S = 900;
  const canvas = createCanvas(S, S);
  const ctx = canvas.getContext("2d");

  roundRect(ctx, 0, 0, S, S, 36);
  ctx.fillStyle = "#1c1c1e";
  ctx.fill();
  ctx.save();
  ctx.clip();

  // نقشة علامات X الخفيفة
  ctx.strokeStyle = "rgba(232,73,63,0.13)";
  ctx.lineWidth = 7;
  ctx.lineCap = "round";
  for (let row = 0; row < 7; row++) {
    for (let col = 0; col < 7; col++) {
      const x = col * 150 + (row % 2 ? 75 : 0) + 10;
      const y = row * 145 + 10;
      drawCross(ctx, x, y, 14);
    }
  }

  // الشريط الأحمر بالأسفل
  ctx.fillStyle = colors.red;
  ctx.fillRect(0, S - 12, S, 12);
  ctx.restore();

  // المستوى + رقم اللاعب
  ctx.fillStyle = colors.muted;
  ctx.font = font(24, 700);
  rtlText(ctx, info.levelName, S - 40, 44, "right");
  ctx.direction = "ltr";
  ctx.textAlign = "left";
  ctx.fillText(`#${info.number}`, 40, 44);

  // الصورة الشخصية
  const cx = S / 2;
  const cy = 170;
  const r = 92;
  drawAvatar(ctx, info.avatar, cx, cy, r);
  ring(ctx, cx, cy, r + 3, colors.red, 7);

  // الاسم
  ctx.fillStyle = "#fff";
  ctx.font = font(46, 900);
  const name = fitText(ctx, safeName(info.name), S - 160);
  ctx.direction = "inherit";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(name, cx, cy + r + 60);

  // الوقت
  const pillW = 270;
  const pillH = 62;
  const py = cy + r + 110;
  roundRect(ctx, cx - pillW / 2, py, pillW, pillH, 18);
  ctx.fillStyle = colors.redDark;
  ctx.fill();
  ctx.strokeStyle = colors.red;
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.fillStyle = colors.red;
  ctx.font = font(28, 900);
  rtlText(ctx, `${info.seconds} ثانية`, cx, py + pillH / 2 + 2);

  // بطاقة الحرف مع توهج
  const boxW = 430;
  const boxH = 270;
  const bx = cx - boxW / 2;
  const by = py + pillH + 55;
  ctx.save();
  ctx.shadowColor = "rgba(232,73,63,0.35)";
  ctx.shadowBlur = 60;
  roundRect(ctx, bx, by, boxW, boxH, 26);
  ctx.fillStyle = "#1a1a1c";
  ctx.fill();
  ctx.restore();
  roundRect(ctx, bx, by, boxW, boxH, 26);
  ctx.strokeStyle = colors.red;
  ctx.lineWidth = 4;
  ctx.stroke();

  ctx.fillStyle = colors.muted;
  ctx.font = font(26, 700);
  rtlText(ctx, "كلمة تبدأ بحرف", cx, by + 48);
  ctx.fillStyle = colors.red;
  ctx.font = font(150, 900);
  rtlText(ctx, info.letter, cx, by + 160);

  // الاسم التجاري
  ctx.fillStyle = "#6e6e74";
  ctx.font = font(26, 500);
  ctx.direction = "ltr";
  ctx.textAlign = "center";
  ctx.fillText(`© ${config.brandName.toUpperCase()} ©`, cx, S - 55);

  return canvas.toBuffer("image/png");
}
