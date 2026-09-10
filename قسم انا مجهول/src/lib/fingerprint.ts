let cachedHashPromise: Promise<string> | undefined;

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
    ctx.fillText("انا مجهول 1234567890 !@#$%^&*()", 2, 15);
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
    const gl = (c.getContext("webgl") || c.getContext("experimental-webgl")) as any;
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

export async function deviceFingerprint(): Promise<string> {
  if (!cachedHashPromise) {
    cachedHashPromise = sha256Hex("anon-dev|" + stableParts().join("|")).then(
      (h) => h || "unknown",
    );
  }
  return cachedHashPromise;
}
