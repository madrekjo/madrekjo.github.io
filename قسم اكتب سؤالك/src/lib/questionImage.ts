import type { Option, Question } from "@/types";

const W = 1080;
const M = 46;
const INNER_L = 120;
const INNER_R = W - 120;
const INNER_W = INNER_R - INNER_L;

const GOLD = "#c9a227";
const GOLD_DEEP = "#a67c00";
const INK = "#33291d";
const SOFT = "#7a6a51";
const LINE = "#e7dcc0";

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
  const out: string[] = [];
  let line = "";
  for (const word of words) {
    if (ctx.measureText(word).width > maxWidth) {
      if (line) {
        out.push(line);
        line = "";
      }
      let chunk = "";
      for (const ch of word) {
        const test = chunk + ch;
        if (ctx.measureText(test).width > maxWidth && chunk) {
          out.push(chunk);
          chunk = ch;
        } else {
          chunk = test;
        }
      }
      line = chunk;
      continue;
    }
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      out.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) out.push(line);
  return out;
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
  ctx.lineTo(x + r, y);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function loadImageAt(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
    window.setTimeout(() => {
      if (!img.complete) resolve(null);
    }, 4000);
  });
}

export async function renderQuestionImage(q: Question): Promise<Blob> {
  await waitFont("Amiri");
  await waitFont("Tajawal");

  const measure = document.createElement("canvas").getContext("2d")!;

  // خط السؤال — ينقص تلقائياً مع الأسئلة الطويلة حتى تبقى البوستر مرتّبة
  let qFont = "700 56px Amiri, serif";
  let qLines = wrapText(measure, q.question, INNER_W - 60);
  if (qLines.length > 7) {
    qFont = "700 40px Amiri, serif";
  } else if (qLines.length > 5) {
    qFont = "700 46px Amiri, serif";
  }
  measure.font = qFont;
  qLines = wrapText(measure, q.question, INNER_W - 60);
  const qH = qLines.length * 68;

  // الآية
  let ayahLines: string[] = [];
  let ayahH = 0;
  let ayahFont = "400 42px Amiri, serif";
  if (q.ayah) {
    measure.font = ayahFont;
    ayahLines = wrapText(measure, q.ayah.text, INNER_W - 220);
    if (ayahLines.length > 3) {
      ayahFont = "400 34px Amiri, serif";
      measure.font = ayahFont;
      ayahLines = wrapText(measure, q.ayah.text, INNER_W - 220);
    }
    ayahH = ayahLines.length * 52 + 40 + 72;
  }

  // الخطوط
  let optFont = "700 34px Tajawal, sans-serif";
  measure.font = optFont;
  const optGap = 26;
  const optW = (INNER_W - optGap) / 2;
  const optTextW = optW - 150;
  const optHeights = q.options.map((o) => {
    const n = Math.max(wrapText(measure, o.text, optTextW).length, 1);
    return n * 46 + 46;
  });
  if (Math.max(...optHeights) > 130) {
    optFont = "700 28px Tajawal, sans-serif";
    measure.font = optFont;
  }
  const optHeights2 = q.options.map((o) => {
    const n = Math.max(wrapText(measure, o.text, optTextW).length, 1);
    return n * 40 + 58;
  });
  const optRowH = Math.max(optHeights2[0], optHeights2[1]);
  const optRowH2 = Math.max(optHeights2[2], optHeights2[3]);

  const image = q.image ? await loadImageAt(q.image) : null;
  let imgW = 0;
  let imgH = 0;
  if (image) {
    const ratio = Math.min(720 / image.width, 400 / image.height, 1.4);
    imgW = image.width * ratio;
    imgH = image.height * ratio;
  }

  const HEADER_H = 378;
  const OPTIONS_H = optRowH + optGap * 2 + optRowH2;
  const BOTTOM_H = 300;
  const TAIL_GAP = 16;

  let H =
    M * 2 +
    HEADER_H +
    qH +
    8 +
    (q.ayah ? ayahH + 48 : 0) +
    (image ? imgH + 48 : 0) +
    OPTIONS_H +
    BOTTOM_H +
    TAIL_GAP;
  H = Math.max(H, 1350);

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "#fffdf6";
  ctx.fillRect(0, 0, W, H);

  // الإطار الذهبي
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 8;
  roundedRect(ctx, M, M, W - M * 2, H - M * 2, 56);
  ctx.stroke();

  const corner = 58;
  ctx.lineWidth = 8;
  for (const [cx, cy, sx, sy] of [
    [M, M, 1, 1],
    [W - M, M, -1, 1],
    [M, H - M, 1, -1],
    [W - M, H - M, -1, -1],
  ] as const) {
    ctx.strokeStyle = GOLD;
    ctx.beginPath();
    ctx.moveTo(cx + sx * corner, cy);
    ctx.lineTo(cx, cy);
    ctx.lineTo(cx, cy + sy * corner);
    ctx.stroke();
  }

  // شعار المنصة في الزاوية العلوية
  const logo = "🎓 مدارك جو";
  ctx.font = "700 30px Tajawal, sans-serif";
  const lw = ctx.measureText(logo).width + 56;
  const lh = 58;
  const lx = M + 18;
  const ly = M + 18;
  ctx.fillStyle = "#f5e9c8";
  roundedRect(ctx, lx, ly, lw, lh, lh / 2);
  ctx.fill();
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 2.5;
  roundedRect(ctx, lx, ly, lw, lh, lh / 2);
  ctx.stroke();
  ctx.fillStyle = GOLD_DEEP;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(logo, lx + 28, ly + lh / 2 + 2);
  ctx.textBaseline = "alphabetic";

  ctx.textAlign = "center";
  let y = 118;

  // الهيدر
  ctx.fillStyle = GOLD_DEEP;
  ctx.font = "700 30px Tajawal, sans-serif";
  ctx.fillText("🎓 مدارك جو", W / 2, y);

  ctx.fillStyle = INK;
  ctx.font = "700 66px Amiri, serif";
  ctx.fillText("اكتب سؤالك", W / 2, y + 92);

  // شارة الحقل والمادة
  const badge = `${q.field} · ${q.subject}`;
  ctx.font = "700 34px Tajawal, sans-serif";
  const bw = ctx.measureText(badge).width + 64;
  const bh = 50;
  const bx = W / 2 - bw / 2;
  const by = y + 148;
  ctx.fillStyle = "#f5e9c8";
  roundedRect(ctx, bx, by, bw, bh, bh / 2);
  ctx.fill();
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 2;
  roundedRect(ctx, bx, by, bw, bh, bh / 2);
  ctx.stroke();
  ctx.fillStyle = GOLD_DEEP;
  ctx.textBaseline = "middle";
  ctx.fillText(badge, W / 2, by + bh / 2 + 3);
  ctx.textBaseline = "alphabetic";

  // فاصل
  y = by + bh + 52;
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(W / 2 - 200, y);
  ctx.lineTo(W / 2 + 200, y);
  ctx.stroke();
  y += 56;

  // السؤال
  ctx.fillStyle = INK;
  ctx.font = qFont;
  ctx.textBaseline = "middle";
  for (const l of qLines) {
    ctx.fillText(l, W / 2, y + 34);
    y += 68;
  }
  ctx.textBaseline = "alphabetic";
  y += 8;

  // صورة السؤال
  if (image && imgW > 0) {
    roundedRect(ctx, W / 2 - imgW / 2, y, imgW, imgH, 24);
    ctx.save();
    ctx.clip();
    ctx.drawImage(image, W / 2 - imgW / 2, y, imgW, imgH);
    ctx.restore();
    ctx.strokeStyle = LINE;
    ctx.lineWidth = 3;
    roundedRect(ctx, W / 2 - imgW / 2, y, imgW, imgH, 24);
    ctx.stroke();
    y += imgH + 48;
  }

  // الآية
  if (q.ayah) {
    const boxX = INNER_L + (INNER_W - (INNER_W - 160)) / 2;
    const boxW = INNER_W - 160;
    const top = y - 8;
    const bh2 = ayahH;
    ctx.fillStyle = "#f6edd6";
    roundedRect(ctx, boxX, top, boxW, bh2, 24);
    ctx.fill();
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 3;
    roundedRect(ctx, boxX, top, boxW, bh2, 24);
    ctx.stroke();

    ctx.fillStyle = INK;
    ctx.font = ayahFont;
    ctx.textBaseline = "middle";
    let ay = top + 66;
    for (const l of ayahLines) {
      ctx.fillText(l, W / 2, ay);
      ay += 52;
    }
    ctx.fillStyle = GOLD_DEEP;
    ctx.font = "700 30px Tajawal, sans-serif";
    ctx.fillText(q.ayah.ref, W / 2, top + bh2 - 34);
    ctx.textBaseline = "alphabetic";
    y = top + bh2 + 56;
  }

  // الاختيارات
  ctx.font = optFont;
  const rows: [Option, Option][] = [
    [q.options[0], q.options[1]],
    [q.options[2], q.options[3]],
  ];
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    const oh = r === 0 ? optRowH : optRowH2;
    row.forEach((o, col) => {
      const ox = INNER_L + col * (optW + optGap);
      ctx.fillStyle = "#fffdf6";
      roundedRect(ctx, ox, y, optW, oh, 22);
      ctx.fill();
      ctx.strokeStyle = LINE;
      ctx.lineWidth = 3;
      roundedRect(ctx, ox, y, optW, oh, 22);
      ctx.stroke();

      // دائرة الحرف — يمين الصندوق (RTL)
      const cx = ox + 52;
      const cy = y + oh / 2 + 3;
      ctx.fillStyle = "#efe4c4";
      ctx.beginPath();
      ctx.arc(cx, cy, 25, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = GOLD_DEEP;
      ctx.font = "700 30px Tajawal, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(o.key, cx, cy + 1);

      // نص الاختيار (يمين)
      ctx.fillStyle = INK;
      ctx.font = optFont;
      ctx.textAlign = "right";
      const lines = wrapText(measure, o.text, optTextW);
      let ty = y + 38;
      for (const l of lines) {
        ctx.fillText(l, ox + optW - 26, ty);
        ty += 40;
      }
      ctx.textBaseline = "alphabetic";
      ctx.textAlign = "center";
    });
    y += oh + optGap;
  }

  ctx.textAlign = "center";

  // منطقة المؤلف
  y += 6;
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(W / 2 - 180, y);
  ctx.lineTo(W / 2 + 180, y);
  ctx.stroke();
  y += 54;

  ctx.fillStyle = GOLD_DEEP;
  ctx.font = "700 40px Tajawal, sans-serif";
  ctx.fillText(`سؤال من: ${q.author}`, W / 2, y);
  ctx.fillStyle = SOFT;
  ctx.font = "500 30px Tajawal, sans-serif";
  ctx.fillText(`❤️ ${q.likes} لايك · 💬 ${q.reactions} تفاعل`, W / 2, y + 52);

  // الفوتر
  y = H - 150;
  ctx.fillStyle = GOLD_DEEP;
  ctx.font = "800 46px Tajawal, sans-serif";
  ctx.fillText("🎓 مدارك جو · اكتب سؤالك", W / 2, y);
  ctx.fillStyle = SOFT;
  ctx.font = "400 28px Tajawal, sans-serif";
  ctx.fillText("madrekjo.com — بطاقة سؤال تستاهل تشاركها", W / 2, y + 46);

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (b) return resolve(b);
        reject(new Error("فشل إنشاء الصورة"));
      },
      "image/jpeg",
      0.92
    );
  });
}

export function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 3000);
}