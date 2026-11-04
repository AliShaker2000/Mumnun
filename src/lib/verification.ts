// Provider identity verification (Captains and Technicians)
// Handles face selfie capture, national ID card photo, and legal name matching.
import { compressImage } from "./image-compression";

export interface VerificationDocument {
  userId: string;
  role: "driver" | "worker";
  legalName: string;
  facePhotoUrl: string; // Base64 data URL
  idCardPhotoUrl: string; // Base64 data URL
  idNumber?: string;
  documentType: "national_id" | "driver_license" | "passport";
  verifiedAt: string;
  status: "verified" | "pending";
}

const STORAGE_KEY_PREFIX = "mumnun_verification_";

export function getProviderVerification(userId: string): VerificationDocument | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY_PREFIX}${userId}`);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function saveProviderVerification(doc: VerificationDocument): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(`${STORAGE_KEY_PREFIX}${doc.userId}`, JSON.stringify(doc));
  } catch (e) {
    console.warn("[verification] Failed to persist verification", e);
  }
}

/** Reads a File into a compressed Base64 Data URL for instant rendering and storage */
export async function fileToCompressedDataUrl(
  file: File,
  maxWidth = 1000,
  maxHeight = 1000,
  quality = 0.75
): Promise<string> {
  const compressed = await compressImage(file, maxWidth, maxHeight, quality);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(compressed);
  });
}
