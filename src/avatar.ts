import { createCanvas, loadImage, type Image } from "@napi-rs/canvas";
import type { Api } from "grammy";
import { config } from "./config.js";
import { FONT, safeName } from "./render/common.js";

/** نخزن الصور مؤقتاً علمود ما نحملها كل جولة */
const cache = new Map<number, { img: Image; at: number }>();
const TTL = 30 * 60_000;

/** نفس ألوان تيليجرام للحسابات الي ما عندها صورة */
const PALETTE = ["#e17076", "#faa774", "#a695e7", "#7bc862", "#6ec9cb", "#65aadd", "#ee7aae"];

async function defaultAvatar(userId: number, name: string): Promise<Image> {
  const size = 256;
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext("2d");
  const base = PALETTE[Math.abs(userId) % PALETTE.length];
  const grad = ctx.createLinearGradient(0, 0, 0, size);
  grad.addColorStop(0, base);
  grad.addColorStop(1, shade(base, -0.25));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const initial = [...safeName(name)][0]?.toUpperCase() ?? "?";
  ctx.fillStyle = "#fff";
  ctx.font = `700 120px ${FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(initial, size / 2, size / 2 + 6);
  return loadImage(canvas.toBuffer("image/png"));
}

function shade(hex: string, amount: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(c * (1 + amount))));
  const r = f(n >> 16);
  const g = f((n >> 8) & 0xff);
  const b = f(n & 0xff);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

export async function getAvatar(api: Api, userId: number, name: string): Promise<Image> {
  const hit = cache.get(userId);
  if (hit && Date.now() - hit.at < TTL) return hit.img;

  let img: Image | null = null;
  try {
    const photos = await api.getUserProfilePhotos(userId, { limit: 1 });
    const sizes = photos.photos[0];
    if (sizes?.length) {
      const best = sizes.find((s) => s.width >= 320) ?? sizes[sizes.length - 1];
      const file = await api.getFile(best.file_id);
      if (file.file_path) {
        const res = await fetch(`https://api.telegram.org/file/bot${config.botToken}/${file.file_path}`);
        if (res.ok) img = await loadImage(Buffer.from(await res.arrayBuffer()));
      }
    }
  } catch (err) {
    console.warn("[Avatar] ما قدرت أجيب صورة", userId, (err as Error).message);
  }

  img ??= await defaultAvatar(userId, name);
  cache.set(userId, { img, at: Date.now() });
  return img;
}
