import type { Line } from "./api";

const W = 1080;
const BASE_H = 1350;
const TEXT_LINE_H = 96;

export async function waitFont(name: string): Promise<void> {
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
  const words = text.split(/\s+/).filter(Boolean);
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

function wrapParagraphs(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const rows: string[] = [];
  for (const para of text.split("\n")) {
    if (!para.trim()) {
      rows.push("");
      continue;
    }
    for (const w of wrapText(ctx, para, maxWidth)) rows.push(w);
  }
  return rows;
}

export interface NotebookFit {
  fontSize: number;
  step: number;
  lines: string[];
  grows: boolean;
}

const FIT_CANDIDATES: Array<[number, number]> = [
  [56, 96],
  [50, 86],
  [44, 78],
  [38, 68],
  [33, 60],
  [29, 52],
];

export function computeNotebookFit(content: string): NotebookFit {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = 10;
  const ctx = canvas.getContext("2d")!;
  let last: NotebookFit = { fontSize: 29, step: 52, lines: [], grows: true };
  for (const [f, st] of FIT_CANDIDATES) {
    ctx.font = `700 ${f}px Amiri, serif`;
    const lines = wrapParagraphs(ctx, content, W - 330);
    const estH = 380 + lines.length * st + 230;
    if (estH <= 1350) {
      return { fontSize: f, step: st, lines, grows: false };
    }
    last = { fontSize: f, step: st, lines, grows: true };
  }
  return last;
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

const roundRect = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void => {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
};

const diamond = (
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number
): void => {
  ctx.beginPath();
  ctx.moveTo(cx, cy - r);
  ctx.lineTo(cx + r, cy);
  ctx.lineTo(cx, cy + r);
  ctx.lineTo(cx - r, cy);
  ctx.closePath();
};

export async function renderNotebookImage(
  owner: string,
  content: string,
  pageNum: number,
  _total: number
): Promise<Blob> {
  await waitFont("Amiri");
  await waitFont("Tajawal");

  const W = 1080;
  const firstBaseline = 380;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = 1350;

  const fit = computeNotebookFit(content);
  const { fontSize, step, lines } = fit;

  const bodyH = firstBaseline + lines.length * step + 230;
  const H = Math.max(1350, bodyH);
  canvas.height = H;

  const ctx = canvas.getContext("2d")!;

  const paper = ctx.createLinearGradient(0, 0, 0, H);
  paper.addColorStop(0, "#fffdf1");
  paper.addColorStop(0.55, "#fdf6e2");
  paper.addColorStop(1, "#f7ecd0");
  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, W, H);

  const vignette = ctx.createRadialGradient(W / 2, H / 2, 200, W / 2, H / 2, 900);
  vignette.addColorStop(0, "rgba(140,100,30,0)");
  vignette.addColorStop(1, "rgba(140,100,30,0.09)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, W, H);

  roundRect(ctx, 36, 36, W - 72, H - 72, 26);
  ctx.strokeStyle = "rgba(150,110,40,0.55)";
  ctx.lineWidth = 4;
  ctx.stroke();

  roundRect(ctx, 54, 54, W - 108, H - 108, 18);
  ctx.strokeStyle = "rgba(150,110,40,0.30)";
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = "rgba(176,133,44,0.6)";
  for (const [cx, cy] of [
    [66, 66],
    [W - 66, 66],
    [66, H - 66],
    [W - 66, H - 66],
  ]) {
    ctx.beginPath();
    ctx.arc(cx, cy, 6, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.textAlign = "right";
  ctx.textBaseline = "alphabetic";

  ctx.fillStyle = "#6d5110";
  ctx.font = "800 48px Tajawal, sans-serif";
  ctx.fillText("دَفتر " + owner, W - 150, 150);

  ctx.fillStyle = "#9a7b34";
  ctx.font = "500 28px Tajawal, sans-serif";
  ctx.fillText("بين السطور · من مدارك جو", W - 152, 196);

  ctx.font = "800 34px Tajawal, sans-serif";
  const stampText = "ورقة " + pageNum;
  const stampW = ctx.measureText(stampText).width + 64;
  const stampX = 150;
  const stampY = 106;
  const stampH = 60;
  roundRect(ctx, stampX, stampY, stampW, stampH, 16);
  ctx.fillStyle = "rgba(176,133,44,0.08)";
  ctx.fill();
  ctx.strokeStyle = "rgba(176,133,44,0.75)";
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.fillStyle = "#b0852c";
  ctx.textAlign = "center";
  ctx.fillText(stampText, stampX + stampW / 2, stampY + stampH / 2 + 12);
  ctx.textAlign = "right";

  ctx.strokeStyle = "rgba(176,133,44,0.40)";
  ctx.lineWidth = 3;
  ctx.setLineDash([2, 16]);
  ctx.beginPath();
  ctx.moveTo(150, 244);
  ctx.lineTo(W - 150, 244);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = "rgba(176,133,44,0.75)";
  diamond(ctx, W / 2, 244, 7);
  ctx.fill();

  ctx.strokeStyle = "rgba(196,84,84,0.55)";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(W - 116, 288);
  ctx.lineTo(W - 116, H - 168);
  ctx.stroke();
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.moveTo(W - 116, 288);
  ctx.lineTo(W - 116, 316);
  ctx.moveTo(W - 116, H - 196);
  ctx.lineTo(W - 116, H - 168);
  ctx.stroke();

  ctx.strokeStyle = "rgba(150,110,40,0.26)";
  ctx.lineWidth = 3;
  const ruleCount = Math.max(9, lines.length + 1);
  for (let k = 0; k < ruleCount; k++) {
    const y = firstBaseline + k * step;
    if (y - 12 > H - 168) break;
    ctx.beginPath();
    ctx.moveTo(W - 170, y - 12);
    ctx.lineTo(170, y - 12);
    ctx.stroke();
  }

  ctx.fillStyle = "#3c3122";
  ctx.font = `700 ${fontSize}px Amiri, serif`;
  let y = firstBaseline;
  for (const l of lines) {
    ctx.fillText(l, W - 172, y);
    y += step;
  }

  ctx.strokeStyle = "rgba(176,133,44,0.40)";
  ctx.lineWidth = 3;
  ctx.setLineDash([2, 16]);
  ctx.beginPath();
  ctx.moveTo(150, H - 148);
  ctx.lineTo(W - 150, H - 148);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = "#8a6413";
  ctx.font = "800 38px Tajawal, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("🎓 مدارك جو · بين السطور", W / 2, H - 92);
  ctx.textAlign = "right";

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
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  window.setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(url);
  }, 10000);
}