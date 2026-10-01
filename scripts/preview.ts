// يولد صور تجريبية بمجلد preview/ علمود تشوف التصميم بدون تشغيل البوت
import { createCanvas, loadImage } from "@napi-rs/canvas";
import fs from "node:fs";
process.env.BOT_TOKEN ||= "preview";
process.env.BRAND_NAME ||= "كروب المشاهير";
const { safeName, FONT }  = await import("../src/render/common.js");
const { renderLineup } = await import("../src/render/lineup.js");
const { renderTurn } = await import("../src/render/turn.js");
const { renderWinner } = await import("../src/render/winner.js");

async function fake(color: string, letter: string) {
  const c = createCanvas(256, 256);
  const g = c.getContext("2d");
  g.fillStyle = color;
  g.fillRect(0, 0, 256, 256);
  g.fillStyle = "#fff";
  g.font = `700 120px ${FONT}`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(letter, 128, 134);
  return loadImage(c.toBuffer("image/png"));
}

const names = ["𝙸𝙲 • 𝐷𝑒𝑚𝑜𝑛", "𝐒𝐀𝐒𝐔𝐊𝐄 🝁 MF", "BARON !", "علي الكرار 🔥", "ome3jiha6", "مستر مياو", "ꪜ Ismael", "Abdo", "حيدر", "xzsy11", "RT"];
const colors = ["#e17076", "#faa774", "#a695e7", "#7bc862", "#6ec9cb", "#65aadd", "#ee7aae"];
const players = await Promise.all(names.map(async (name, i) => ({ name, avatar: await fake(colors[i % 7], [...safeName(name)][0]) })));
fs.mkdirSync("preview", { recursive: true });
const { LEVELS } = await import("../src/config.js");
fs.writeFileSync("preview/lineup.png", renderLineup(players, LEVELS[0].name, LEVELS[0].color));
const letters = ["خ", "ب", "ج"];
LEVELS.forEach((lv, i) =>
  fs.writeFileSync(`preview/turn-${i + 1}.png`, renderTurn({ ...players[i], letter: letters[i], seconds: lv.seconds, levelName: lv.name, accent: lv.color, number: i + 1 })),
);
fs.writeFileSync("preview/winner.png", renderWinner(players[2].name, players[2].avatar));
console.log("✔ preview/");

const { renderStats } = await import("../src/render/stats.js");
fs.writeFileSync(
  "preview/stats.png",
  renderStats({
    name: players[1].name,
    avatar: players[1].avatar,
    title: "🥇 البطل",
    titlesEarned: 6,
    titlesTotal: 15,
    rank: 3,
    tiles: [
      { icon: "🎮", label: "الجولات", value: "42", color: "#65aadd" },
      { icon: "🏆", label: "الفوز", value: "12", color: "#c9922b" },
      { icon: "📈", label: "نسبة الفوز", value: "29%", color: "#2ecc71" },
      { icon: "✍️", label: "الكلمات الصحيحة", value: "318", color: "#a695e7" },
      { icon: "⚡", label: "متوسط السرعة", value: "3.4 ث", color: "#f5a623" },
      { icon: "🚀", label: "أسرع إجابة", value: "0.9 ث", color: "#6ec9cb" },
      { icon: "🔥", label: "أفضل سلسلة فوز", value: "3", color: "#ee7aae" },
      { icon: "💀", label: "مرات الإقصاء", value: "30", color: "#e8493f" },
    ],
  }),
);
console.log("✔ preview/stats.png");
