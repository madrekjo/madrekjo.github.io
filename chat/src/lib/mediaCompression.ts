// Client-side media compression utilities.
// Images: re-encode via canvas with quality + max dimension, keeping visual quality high.
// Videos: best-effort transcode using MediaRecorder when supported; otherwise return as-is.

export interface ImageCompressOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number; // 0..1
  mimeType?: "image/webp" | "image/jpeg";
}

export async function compressImage(
  file: File,
  opts: ImageCompressOptions = {}
): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  // Skip GIF/SVG (animation/vector) — re-encoding would break them.
  if (file.type === "image/gif" || file.type === "image/svg+xml") return file;

  const {
    maxWidth = 1920,
    maxHeight = 1920,
    quality = 0.82,
    mimeType = "image/webp",
  } = opts;

  try {
    const bitmap = await createImageBitmap(file);
    let { width, height } = bitmap;
    const ratio = Math.min(maxWidth / width, maxHeight / height, 1);
    width = Math.round(width * ratio);
    height = Math.round(height * ratio);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();

    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob(resolve, mimeType, quality)
    );
    if (!blob || blob.size >= file.size) return file;

    const ext = mimeType === "image/webp" ? "webp" : "jpg";
    const baseName = file.name.replace(/\.[^.]+$/, "");
    return new File([blob], `${baseName}.${ext}`, {
      type: mimeType,
      lastModified: Date.now(),
    });
  } catch (e) {
    console.warn("compressImage failed, using original", e);
    return file;
  }
}

export async function compressVideo(file: File): Promise<File> {
  if (!file.type.startsWith("video/")) return file;
  // Skip if already small enough (<5MB).
  if (file.size <= 5 * 1024 * 1024) return file;

  const mimeCandidates = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];
  const supportedMime = mimeCandidates.find(
    (m) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m)
  );
  if (!supportedMime) return file;

  try {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.src = url;
    video.muted = true;
    video.playsInline = true;
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("video load failed"));
    });

    const maxSide = 1280;
    const ratio = Math.min(maxSide / video.videoWidth, maxSide / video.videoHeight, 1);
    const width = Math.round(video.videoWidth * ratio);
    const height = Math.round(video.videoHeight * ratio);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      URL.revokeObjectURL(url);
      return file;
    }

    const stream = (canvas as any).captureStream(30) as MediaStream;
    // Attach audio if available
    try {
      const audioStream = (video as any).captureStream?.() as MediaStream | undefined;
      audioStream?.getAudioTracks().forEach((t) => stream.addTrack(t));
    } catch {}

    const recorder = new MediaRecorder(stream, {
      mimeType: supportedMime,
      videoBitsPerSecond: 1_200_000,
    });
    const chunks: BlobPart[] = [];
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);

    const done = new Promise<Blob>((resolve) => {
      recorder.onstop = () =>
        resolve(new Blob(chunks, { type: supportedMime.split(";")[0] }));
    });

    recorder.start();
    await video.play();

    let raf = 0;
    const draw = () => {
      if (video.ended || video.paused) return;
      ctx.drawImage(video, 0, 0, width, height);
      raf = requestAnimationFrame(draw);
    };
    draw();

    await new Promise<void>((resolve) => {
      video.onended = () => resolve();
    });
    cancelAnimationFrame(raf);
    recorder.stop();
    const blob = await done;
    URL.revokeObjectURL(url);

    if (blob.size >= file.size) return file;
    const baseName = file.name.replace(/\.[^.]+$/, "");
    return new File([blob], `${baseName}.webm`, {
      type: "video/webm",
      lastModified: Date.now(),
    });
  } catch (e) {
    console.warn("compressVideo failed, using original", e);
    return file;
  }
}

export async function compressMedia(file: File): Promise<File> {
  if (file.type.startsWith("image/")) return compressImage(file);
  if (file.type.startsWith("video/")) return compressVideo(file);
  return file;
}
