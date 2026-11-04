export const OFFER_SECONDS = 60;
export const DISPATCH_RADII_KM = [2, 5, 10] as const;

export function offerSecondsLeft(expiresAt: string, now = Date.now()) {
  return Math.max(0, Math.min(OFFER_SECONDS, Math.ceil((Date.parse(expiresAt) - now) / 1000)));
}