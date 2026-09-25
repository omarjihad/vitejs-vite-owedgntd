// يولد صور تجريبية بمجلد preview/ علمود تشوف التصميم بدون تشغيل البوت
import { createCanvas, loadImage } from "@napi-rs/canvas";
import fs from "node:fs";
process.env.BOT_TOKEN ||= "preview";
const { renderLineup } = await import("../src/render/lineup.js");
const { renderTurn } = await import("../src/render/turn.js");
const { renderWinner } = await import("../src/render/winner.js");

async function fake(color: string, letter: string) {
  const c = createCanvas(256, 256);
  const g = c.getContext("2d");
  g.fillStyle = color;
  g.fillRect(0, 0, 256, 256);
  g.fillStyle = "#fff";
  g.font = "700 120px Cairo";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(letter, 128, 134);
  return loadImage(c.toBuffer("image/png"));
}

const names = ["عمر", "Azoz", "BARON !", "علي الكرار 🔥", "ome3jiha6", "مستر مياو", "ꪜ Ismael", "Abdo", "حيدر", "xzsy11", "RT"];
const colors = ["#e17076", "#faa774", "#a695e7", "#7bc862", "#6ec9cb", "#65aadd", "#ee7aae"];
const players = await Promise.all(names.map(async (name, i) => ({ name, avatar: await fake(colors[i % 7], [...name][0]) })));
fs.mkdirSync("preview", { recursive: true });
fs.writeFileSync("preview/lineup.png", renderLineup(players, "المستوى السهل"));
fs.writeFileSync("preview/turn.png", renderTurn({ ...players[0], letter: "خ", seconds: 12, levelName: "المستوى السهل", number: 1 }));
fs.writeFileSync("preview/winner.png", renderWinner(players[2].name, players[2].avatar));
console.log("✔ preview/lineup.png, preview/turn.png, preview/winner.png");
