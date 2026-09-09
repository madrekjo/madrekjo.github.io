import type { Line } from "./api";

const W = 1080;
const H = 1350;

async function waitFont(name: string): Promise<void> {
  try {
    await document.fonts.load(`700 48px "${name}"`);
    await document.fonts.load(`400 40px "${name}"`);
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

export async function renderCardImage(line: Line): Promise<Blob> {
  await waitFont("Amiri");
  await waitFont("Tajawal");

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
  const linesArr = wrapText(ctx, line.text, W - 320);
  const lineH = 96;
  let startY = Math.max(
    300,
    H / 2 - (linesArr.length * lineH) / 2
  );
  ctx.textBaseline = "middle";
  for (const l of linesArr) {
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

  ctx.strokeStyle = lineColor;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(W / 2 - 180, H - 220);
  ctx.lineTo(W / 2 + 180, H - 220);
  ctx.stroke();

  ctx.fillStyle = goldDeep;
  ctx.font = "800 44px Tajawal, sans-serif";
  ctx.fillText("🎓 مدارك جو · بين السطور", W / 2, H - 130);

  ctx.fillStyle = soft;
  ctx.font = "400 30px Tajawal, sans-serif";
  ctx.fillText("madrekjo.com — كل سطر بتحبه، فيه غيرك بيعيشه", W / 2, H - 80);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("فشل إنشاء الصورة"))),
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