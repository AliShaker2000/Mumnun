// Provider identity verification (Captains and Technicians)
// Handles face selfie capture, national ID card photo, legal name matching, and admin approval workflows.
import { compressImage } from "./image-compression";

export interface VerificationDocument {
  userId: string;
  role: "driver" | "worker";
  legalName: string;
  phone?: string;
  email?: string;
  facePhotoUrl: string; // Base64 data URL
  idCardPhotoUrl: string; // Base64 data URL
  idNumber?: string;
  documentType: "national_id" | "driver_license" | "passport";
  verifiedAt: string;
  status: "pending" | "approved" | "rejected";
  rejectionReason?: string;
  // Specific driver details
  vehicleMake?: string;
  vehicleModel?: string;
  vehicleYear?: number;
  vehiclePlate?: string;
  vehicleColor?: string;
  vehicleCategory?: string;
  // Specific worker details
  workerLevel?: "fani" | "khabir";
  workerBio?: string;
  workerServices?: string[];
}

const STORAGE_KEY_PREFIX = "mumnun_verification_";
const ALL_VERIFICATIONS_KEY = "mumnun_all_verifications";

export function getProviderVerification(userId: string): VerificationDocument | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY_PREFIX}${userId}`);
    if (raw) return JSON.parse(raw);
    const list = getAllProviderVerifications();
    return list.find((v) => v.userId === userId) ?? null;
  } catch {
    return null;
  }
}

export function getAllProviderVerifications(): VerificationDocument[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(ALL_VERIFICATIONS_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function saveProviderVerification(doc: VerificationDocument): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(`${STORAGE_KEY_PREFIX}${doc.userId}`, JSON.stringify(doc));
    const all = getAllProviderVerifications().filter((v) => v.userId !== doc.userId);
    all.unshift(doc);
    localStorage.setItem(ALL_VERIFICATIONS_KEY, JSON.stringify(all));
  } catch (e) {
    console.warn("[verification] Failed to persist verification", e);
  }
}

export function updateVerificationStatus(
  userId: string,
  status: "pending" | "approved" | "rejected",
  rejectionReason?: string,
): VerificationDocument | null {
  if (typeof window === "undefined") return null;
  try {
    const current = getProviderVerification(userId);
    if (!current) return null;
    const updated: VerificationDocument = {
      ...current,
      status,
      rejectionReason: rejectionReason ?? (status === "approved" ? undefined : current.rejectionReason),
      verifiedAt: new Date().toISOString(),
    };
    saveProviderVerification(updated);
    return updated;
  } catch {
    return null;
  }
}

/** Reads a File into a compressed Base64 Data URL for instant rendering and storage */
export async function fileToCompressedDataUrl(
  file: File,
  maxWidth = 1000,
  maxHeight = 1000,
  quality = 0.75,
): Promise<string> {
  const compressed = await compressImage(file, maxWidth, maxHeight, quality);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(compressed);
  });
}
