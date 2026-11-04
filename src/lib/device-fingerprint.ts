// Device fingerprinting — generates a stable identifier for anti-fake-account detection.
// Combines screen, timezone, language, platform, and canvas fingerprinting.

let cachedFingerprint: string | null = null;

export function getDeviceFingerprint(): string {
  if (cachedFingerprint) return cachedFingerprint;
  if (typeof window === "undefined") return "server";

  const parts: string[] = [];

  parts.push(navigator.userAgent);
  parts.push(String(screen.width));
  parts.push(String(screen.height));
  parts.push(String(screen.colorDepth));
  parts.push(String(window.devicePixelRatio || 1));
  parts.push(Intl.DateTimeFormat().resolvedOptions().timeZone || "unknown");
  parts.push(navigator.language || "unknown");
  parts.push(String(navigator.hardwareConcurrency || 0));
  parts.push(String((navigator as any).deviceMemory || 0));
  parts.push(String(navigator.maxTouchPoints || 0));

  // Canvas fingerprint
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 200;
    canvas.height = 50;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.textBaseline = "top";
      ctx.font = "14px Arial";
      ctx.fillStyle = "#f60";
      ctx.fillRect(0, 0, 200, 50);
      ctx.fillStyle = "#069";
      ctx.fillText("mumnun-fp", 2, 2);
      parts.push(canvas.toDataURL().slice(-50));
    }
  } catch {}

  // Simple hash
  const str = parts.join("|");
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  cachedFingerprint = `fp_${Math.abs(hash).toString(36)}_${str.length.toString(36)}`;
  return cachedFingerprint;
}

export async function getDeviceFingerprintAsync(): Promise<string> {
  return getDeviceFingerprint();
}
