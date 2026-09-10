import type { Line } from "./api";

const W = 1080;
const BASE_H = 1350;
const TEXT_LINE_H = 96;

async function waitFont(name: string): Promise<void> {
  const load = async () => {
    await document.fonts.load(`700 48px "${name}"`);
    await document.fonts.load(`400 40px "${name}"`);
  };
  try {
    await Promise.race([load(), new Promise((r) => setTimeout(r, 3000))]);
  } catch {
    /* ignore */
  }
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

export interface InteractionStats {
  likes: number;
  shares: number;
  visits: number;
  reports?: number;
  proofShots?: number;
}

export async function renderCardImage(
  line: Line,
  stats?: InteractionStats
): Promise<Blob> {
  await waitFont("Amiri");
  await waitFont("Tajawal");

  const measure = document.createElement("canvas").getContext("2d")!;
  measure.font = "700 60px Amiri, serif";
  const linesArr = wrapText(measure, line.text, W - 320);
  const textH = linesArr.length * TEXT_LINE_H;
  const H = Math.max(BASE_H, textH + 960);

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "#fffdf6";
  ctx.fillRect(0, 0, W, H);

  const gold = "#c9a227";
  const goldDeep = "#a67c00";
  const ink = "#33291d";
  const soft = "#7a6a51";
  const lineColor = "#e7dcc0";

  ctx.strokeStyle = gold;
  ctx.lineWidth = 8;
  const m = 46;
  roundedRect(ctx, m, m, W - m * 2, H - m * 2, 56);
  ctx.stroke();

  const corner = 58;
  ctx.lineWidth = 8;
  for (const [cx, cy, sx, sy] of [
    [m, m, 1, 1],
    [W - m, m, -1, 1],
    [m, H - m, 1, -1],
    [W - m, H - m, -1, -1],
  ] as const) {
    ctx.strokeStyle = gold;
    ctx.beginPath();
    ctx.moveTo(cx + sx * corner, cy);
    ctx.lineTo(cx, cy);
    ctx.lineTo(cx, cy + sy * corner);
    ctx.stroke();
  }

  ctx.textAlign = "center";
  ctx.fillStyle = goldDeep;
  ctx.font = "700 34px Tajawal, sans-serif";
  ctx.fillText(line.category, W / 2, 160);

  ctx.fillStyle = ink;
  ctx.font = "700 60px Amiri, serif";
  const lineH = TEXT_LINE_H;
  let startY = Math.max(
    300,
    H / 2 - (linesArr.length * lineH) / 2
  );
  ctx.textBaseline = "middle";
  for (const l of linesArr) {
    if (startY >= H - 470) break;
    ctx.fillText(l, W / 2, startY);
    startY += lineH;
  }

  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = soft;
  ctx.font = "500 40px Tajawal, sans-serif";
  ctx.fillText(line.book, W / 2, H - 360);
  if (line.author) {
    ctx.fillStyle = goldDeep;
    ctx.font = "700 34px Tajawal, sans-serif";
    ctx.fillText(line.author, W / 2, H - 290);
  }

  const hasStats = Boolean(stats);
  const dividerY = hasStats ? H - 250 : H - 220;

  if (hasStats && stats) {
    ctx.fillStyle = goldDeep;
    ctx.font = "700 36px Tajawal, sans-serif";
    ctx.fillText("توثيق التفاعل على بطاقتك", W / 2, H - 380);

    const items: string[] = [
      `❤️ ${stats.likes}`,
      `📤 ${stats.shares}`,
      `👁️ ${stats.visits}`,
    ];
    const docs = (stats.reports ?? 0) + (stats.proofShots ?? 0);
    if (docs > 0) items.push(`📋 ${docs}`);
    ctx.fillStyle = ink;
    ctx.font = "700 44px Tajawal, sans-serif";
    ctx.fillText(items.join("   ·   "), W / 2, H - 318);
  }

  ctx.strokeStyle = lineColor;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(W / 2 - 180, dividerY);
  ctx.lineTo(W / 2 + 180, dividerY);
  ctx.stroke();

  ctx.fillStyle = goldDeep;
  ctx.font = "800 44px Tajawal, sans-serif";
  ctx.fillText("🎓 مدارك جو · بين السطور", W / 2, H - 130);

  ctx.fillStyle = soft;
  ctx.font = "400 30px Tajawal, sans-serif";
  ctx.fillText("madrekjo.com — كل سطر بتحبه، فيه غيرك بيعيشه", W / 2, H - 80);

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (b) return resolve(b);
        try {
          const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
          const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
          const bin = atob(base64);
          const arr = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
          resolve(new Blob([arr], { type: "image/jpeg" }));
        } catch {
          reject(new Error("فشل إنشاء الصورة"));
        }
      },
      "image/jpeg",
      0.92
    );
  });
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 3000);
}