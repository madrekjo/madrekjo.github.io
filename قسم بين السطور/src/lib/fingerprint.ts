function canvasFingerprint(): string {
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
    ctx.fillText("بين السطور 1234567890 !@#$%^&*()", 2, 15);
    ctx.fillStyle = "#f00";
    ctx.fillText("الجزائر بغداد عمّان", 4, 45);
    return canvas.toDataURL();
  } catch {
    return "";
  }
}

function webglFingerprint(): string {
  try {
    const c = document.createElement("canvas");
    const gl = (c.getContext("webgl") ||
      c.getContext("experimental-webgl")) as WebGLRenderingContext | null;
    if (!gl) return "";
    const dbg = gl.getExtension("WEBGL_debug_renderer_info");
    if (!dbg) return "";
    const vendor = String(gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) || "");
    const renderer = String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || "");
    return `${vendor}|${renderer}`;
  } catch {
    return "";
  }
}

function stableParts(): string[] {
  const nav = typeof navigator !== "undefined" ? navigator : ({} as any);
  let tz = "";
  try {
    tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
  } catch {
    tz = "";
  }
  return [
    canvasFingerprint(),
    webglFingerprint(),
    tz,
    String(nav.language || ""),
    String(nav.languages ? nav.languages.join(",") : ""),
    `${screen.width}x${screen.height}x${screen.colorDepth}`,
    String(nav.platform || ""),
    String(nav.hardwareConcurrency ?? ""),
    String((nav as any).deviceMemory ?? ""),
    String(nav.maxTouchPoints ?? ""),
  ];
}

function fnv1a(str: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return ("0000000" + (h >>> 0).toString(16)).slice(-8);
}

export function syncDeviceFingerprint(): string {
  const s = stableParts().join("|");
  const a = fnv1a(s);
  const b = fnv1a(s.split("").reverse().join(""));
  return `fp-${a}${b}`;
}