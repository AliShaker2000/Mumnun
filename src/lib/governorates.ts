// Iraqi governorates with approximate city-center coordinates.
// A point belongs to the governorate whose center is nearest.
export type Governorate = { key: string; name: string; lat: number; lng: number };

export const GOVERNORATES: Governorate[] = [
  { key: "baghdad", name: "بغداد", lat: 33.3152, lng: 44.3661 },
  { key: "basra", name: "البصرة", lat: 30.5085, lng: 47.7804 },
  { key: "nineveh", name: "نينوى", lat: 36.34, lng: 43.13 },
  { key: "erbil", name: "أربيل", lat: 36.1911, lng: 44.0092 },
  { key: "sulaymaniyah", name: "السليمانية", lat: 35.5613, lng: 45.4306 },
  { key: "duhok", name: "دهوك", lat: 36.8669, lng: 42.9503 },
  { key: "kirkuk", name: "كركوك", lat: 35.4681, lng: 44.3922 },
  { key: "najaf", name: "النجف", lat: 32.0259, lng: 44.3462 },
  { key: "karbala", name: "كربلاء", lat: 32.616, lng: 44.0249 },
  { key: "babil", name: "بابل", lat: 32.4637, lng: 44.4196 },
  { key: "anbar", name: "الأنبار", lat: 33.4206, lng: 43.3058 },
  { key: "diyala", name: "ديالى", lat: 33.7502, lng: 44.6066 },
  { key: "saladin", name: "صلاح الدين", lat: 34.6, lng: 43.68 },
  { key: "wasit", name: "واسط", lat: 32.5128, lng: 45.8182 },
  { key: "dhiqar", name: "ذي قار", lat: 31.0439, lng: 46.2573 },
  { key: "maysan", name: "ميسان", lat: 31.8356, lng: 47.1449 },
  { key: "muthanna", name: "المثنى", lat: 31.3099, lng: 45.2803 },
  { key: "qadisiyah", name: "القادسية", lat: 31.9929, lng: 44.925 },
];

export const GOV_STORAGE_KEY = "mamnoon_governorate";

function distKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371, r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function governorateOf(p: { lat: number; lng: number }): Governorate {
  let best = GOVERNORATES[0]!, bd = Infinity;
  for (const g of GOVERNORATES) {
    const d = distKm(p, g);
    if (d < bd) { bd = d; best = g; }
  }
  return best;
}

export function getGovernorate(key: string | null | undefined) {
  return GOVERNORATES.find((g) => g.key === key) ?? null;
}
