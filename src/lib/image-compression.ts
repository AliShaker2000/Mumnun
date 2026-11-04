// Image compression utility — reduces file size before upload to save bandwidth.
// Uses canvas to resize and compress JPEG/PNG images.

export async function compressImage(
  file: File,
  maxWidth = 1280,
  maxHeight = 1280,
  quality = 0.7
): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  if (file.size < 100_000) return file; // skip small files

  try {
    const img = await loadImage(file);
    const { width, height } = calculateDimensions(img.width, img.height, maxWidth, maxHeight);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;

    ctx.drawImage(img, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", quality);
    });

    if (!blob) return file;

    const compressedName = file.name.replace(/\.(png|webp|gif)$/i, ".jpg");
    return new File([blob], compressedName, { type: "image/jpeg" });
  } catch {
    return file;
  }
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load image"));
    };
    img.src = url;
  });
}

function calculateDimensions(
  origW: number,
  origH: number,
  maxW: number,
  maxH: number
): { width: number; height: number } {
  if (origW <= maxW && origH <= maxH) return { width: origW, height: origH };
  const ratio = Math.min(maxW / origW, maxH / origH);
  return {
    width: Math.round(origW * ratio),
    height: Math.round(origH * ratio),
  };
}
