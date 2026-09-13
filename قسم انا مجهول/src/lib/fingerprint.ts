export type FingerprintPart = { type: string; value: string };

let cachedResult: Promise<{ fp: string; parts: FingerprintPart[] }> | undefined;

function sha256Hex(input: string): Promise<string> {
  try {
    return crypto.subtle.digest("SHA-256", new TextEncoder().encode(input)).then((buf) =>
      Array.from(new Uint8Array(buf))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join(""),
    );
  } catch {
    return Promise.resolve("");
  }
}

// ---------------------------------------------------------------
// 1. Canvas (رسم يختلف من جهاز/متصفح لآخر)
// ---------------------------------------------------------------
function canvasSignature(): string {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 240;
    canvas.height = 60;
    const ctx = canvas.getContext("2d");
    if (!ctx) return "";
    ctx.textBaseline = "top";
    ctx.font = "14px Arial";
    ctx.fillStyle = "#f60";
    ctx.fillRect(0, 0, 240, 60);
    ctx.fillStyle = "#069";
    ctx.fillText("انا مجهول 1234567890 !@#$%^&*()", 2, 15);
    ctx.fillStyle = "#f00";
    ctx.fillText("الجزائر بغداد عمّان", 4, 45);
    ctx.strokeStyle = "#0f0";
    ctx.beginPath();
    ctx.moveTo(5, 5);
    ctx.lineTo(120, 30);
    ctx.lineTo(5, 45);
    ctx.stroke();
    return canvas.toDataURL();
  } catch {
    return "";
  }
}

// ---------------------------------------------------------------
// 2. WebGL 1 (vendor + renderer)
// ---------------------------------------------------------------
function webgl1Signature(): string {
  try {
    const c = document.createElement("canvas");
    const gl = (c.getContext("webgl") || c.getContext("experimental-webgl")) as any;
    if (!gl) return "";
    const dbg = gl.getExtension("WEBGL_debug_renderer_info");
    if (!dbg) return "";
    const vendor = String(gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) || "");
    const renderer = String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || "");
    const maxTex = String(gl.getParameter(gl.MAX_TEXTURE_SIZE) ?? "");
    return `${vendor}|${renderer}|${maxTex}`;
  } catch {
    return "";
  }
}

// ---------------------------------------------------------------
// 3. WebGL 2 (vendor + renderer + نتيجة تظليل GPU فعلية)
// ---------------------------------------------------------------
function webgl2Signature(): string {
  try {
    const c = document.createElement("canvas");
    c.width = 16;
    c.height = 16;
    const gl = (c.getContext("webgl2", { failIfMajorPerformanceCaveat: true }) as any) || (c.getContext("webgl2") as any);
    if (!gl) return "";
    const dbg = gl.getExtension("WEBGL_debug_renderer_info");
    const vendor = dbg ? String(gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) || "") : "";
    const renderer = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || "") : "";
    const vs = `#version 300 es
      in vec2 p;
      out vec2 v;
      void main(){ v = p; gl_Position = vec4(p, 0.0, 1.0); }
    `;
    const fs = `#version 300 es
      precision highp float;
      in vec2 v;
      out vec4 o;
      void main(){
        float r = sin(v.x * 900.0) * cos(v.y * 700.0) + 0.5;
        float g = fract(sin(v.x * 470.0 + v.y * 213.0) * 43758.5453);
        float b = tan(v.x * 6.2831853) * tan(v.y * 6.2831853);
        o = vec4(abs(r) * 0.5, abs(g), abs(b) * 0.7, 1.0);
      }
    `;
    function compile(type: number, src: string) {
      const s = gl.createShader(type);
      if (!s) return null;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return s;
    }
    const prog = gl.createProgram();
    if (!prog) return `${vendor}|${renderer}`;
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, vs));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return `${vendor}|${renderer}`;
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.viewport(0, 0, 16, 16);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    const px = new Uint8Array(16 * 16 * 4);
    gl.readPixels(0, 0, 16, 16, gl.RGBA, gl.UNSIGNED_BYTE, px);
    let s = "";
    for (let i = 0; i < px.length; i += 4) s += px[i] + "," + px[i + 1] + "," + px[i + 2] + ";";
    return `${vendor}|${renderer}|${s}`;
  } catch {
    return "";
  }
}

// ---------------------------------------------------------------
// 4. Audio (خوارج المعالج الصوتي تختلف من منصة لأخرى)
// ---------------------------------------------------------------
async function audioSignature(): Promise<string> {
  try {
    const AC = window.OfflineAudioContext || (window as any).webkitOfflineAudioContext;
    if (!AC) return "";
    const ctx: OfflineAudioContext = new AC(1, 44100, 44100);
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -50;
    comp.knee.value = 40;
    comp.ratio.value = 12;
    comp.attack.value = 0.001;
    comp.release.value = 0.25;
    o.type = "triangle";
    o.frequency.value = 10000;
    g.gain.value = 0.1;
    o.connect(g);
    g.connect(comp);
    comp.connect(ctx.destination);
    o.start(0);
    const buf = await ctx.startRendering();
    const data = buf.getChannelData(0);
    let s = "";
    for (let i = 0; i < data.length; i += 5) s += data[i]!.toFixed(4) + ",";
    return s;
  } catch {
    return "";
  }
}

// ---------------------------------------------------------------
// 5. Fonts (الخطوط المثبتة تختلف من جهاز لآخر)
// ---------------------------------------------------------------
async function fontsSignature(): Promise<string> {
  try {
    await (document as any).fonts?.ready;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return "";
    const probe = "mmmmmmmmmmlli";
    function widthFor(font: string) {
      ctx!.font = font;
      return ctx!.measureText(probe).width;
    }
    let single = 0;
    try {
      single = widthFor("72px monospace");
    } catch {
      return "";
    }
    const CANDIDATES = [
      "Arial", "Arial Black", "Georgia", "Impact", "Times New Roman", "Trebuchet MS",
      "Verdana", "Courier New", "Comic Sans MS", "Tahoma", "Segoe UI", "Roboto",
      "Open Sans", "Noto Sans", "Inter", "Lato", "Montserrat", "Helvetica Neue",
      "Cairo", "Amiri", "Tajawal", "Almarai", "Noto Kufi Arabic", "Noto Naskh Arabic",
      "Noto Sans Arabic", "IBM Plex Sans Arabic", "Geeza Pro", "Assistant", "Frutiger",
      "Liberation Sans", "DejaVu Sans", "Calibri", "Cambria", "Consolas",
    ];
    const found: string[] = [];
    for (const f of CANDIDATES) {
      try {
        if (widthFor(`72px "${f}", monospace`) !== single) found.push(f);
      } catch {
        /* ignore */
      }
    }
    return found.join(",");
  } catch {
    return "";
  }
}

// ---------------------------------------------------------------
// 6. الشاشة
// ---------------------------------------------------------------
function screenSignature(): string {
  try {
    return `${screen.width}x${screen.height}x${screen.colorDepth}@${window.devicePixelRatio || 1}`;
  } catch {
    return "";
  }
}

// ---------------------------------------------------------------
// 7. العتاد (نواة/ذاكرة/لمس/نظام)
// ---------------------------------------------------------------
function hardwareSignature(): string {
  const nav = typeof navigator !== "undefined" ? navigator : ({} as any);
  return [
    String(nav.hardwareConcurrency ?? ""),
    String((nav as any).deviceMemory ?? ""),
    String(nav.maxTouchPoints ?? ""),
    String(nav.platform ?? ""),
  ].join("|");
}

// ---------------------------------------------------------------
// 8. المنطقة الزمنية (اسم + إزاحة + توقيت صيفي)
// ---------------------------------------------------------------
function tzSignature(): string {
  try {
    const res = Intl.DateTimeFormat().resolvedOptions();
    const off = new Date().getTimezoneOffset();
    const jan = new Date(2026, 0, 1).getTimezoneOffset();
    const jul = new Date(2026, 6, 1).getTimezoneOffset();
    return `${res.timeZone || ""}|${off}|${jan - jul}`;
  } catch {
    return "";
  }
}

// ---------------------------------------------------------------
// البناء: حساب كل البصمات (مرة واحدة لكل جلسة) وإرجاع أجزاء مجزّأة
// ---------------------------------------------------------------
async function collectParts(): Promise<{ fp: string; parts: FingerprintPart[] }> {
  const raws: { type: string; raw: string }[] = [];

  const addRaw = (type: string, raw: string) => {
    if (raw && raw.length >= 4) raws.push({ type, raw });
  };

  addRaw("canvas", canvasSignature());
  addRaw("webgl", webgl1Signature());
  addRaw("webgl2", webgl2Signature());
  addRaw("screen", screenSignature());
  addRaw("hw", hardwareSignature());
  addRaw("tz", tzSignature());
  addRaw("audio", await audioSignature());
  addRaw("fonts", await fontsSignature());

  const parts: FingerprintPart[] = [];
  for (const r of raws) {
    const h = await sha256Hex(`anon-sig|${r.type}|` + r.raw);
    if (h) parts.push({ type: r.type, value: h });
  }

  // البصمة الكاملة: تعتمد على القيم الأولية نفسها (مرتبة) لتكون ثابتة
  const combined = await sha256Hex("anon-dev|" + raws.map((r) => `${r.type}=${r.raw}`).sort().join("|"));
  parts.push({ type: "fp", value: combined || "unknown" });

  return { fp: combined || "unknown", parts };
}

export function buildFingerprint(): Promise<{ fp: string; parts: FingerprintPart[] }> {
  if (!cachedResult) {
    cachedResult = collectParts();
  }
  return cachedResult;
}

export async function deviceFingerprint(): Promise<string> {
  const r = await buildFingerprint();
  return r.fp;
}

export async function deviceFingerprintParts(): Promise<FingerprintPart[]> {
  const r = await buildFingerprint();
  return r.parts;
}