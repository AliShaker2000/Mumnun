export function phoneToEmail(rawPhone: string): string {
  const normalized = normalizePhone(rawPhone);
  const digits = normalized.replace(/[^\d]/g, "");
  return `phone${digits}@mamnoon.app`;
}

export function normalizePhone(raw: string): string {
  const trimmed = raw.trim().replace(/\s+/g, "");
  if (trimmed.startsWith("+")) return "+" + trimmed.slice(1).replace(/[^\d]/g, "");
  const digits = trimmed.replace(/[^\d]/g, "");
  if (digits.startsWith("964")) return "+" + digits;
  if (digits.startsWith("0")) return "+964" + digits.slice(1);
  return "+" + digits;
}

export function isValidPhone(raw: string): boolean {
  const n = normalizePhone(raw);
  return /^\+\d{8,15}$/.test(n);
}
