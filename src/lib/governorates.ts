import boundaries from "./iraq-governorate-boundaries.json";
// geoBoundaries gbOpen Iraq ADM1 (CC BY 4.0), simplified administrative boundaries.
// https://www.geoboundaries.org/ — release 9469f09.
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

const boundaryNames: Record<string, string> = {
  baghdad: "Baghdad", basra: "Al-Basrah", nineveh: "Ninawa", erbil: "Erbil",
  sulaymaniyah: "Al-Sulaimaniyah", duhok: "Dohuk", kirkuk: "Kirkuk", najaf: "An-Najaf",
  karbala: "Karbala", babil: "Babil", anbar: "Al-Anbar", diyala: "Diyala",
  saladin: "Salah al-Din", wasit: "Wasit", dhiqar: "Dhi Qar", maysan: "Maysan",
  muthanna: "Al-Muthanna", qadisiyah: "Al-Qadisiyah",
};

export function isInGovernorate(p: { lat: number; lng: number }, key: string): boolean {
  const feature = boundaries.features.find((f) => f.properties.shapeName === boundaryNames[key]);
  if (!feature) return false;
  const rings = feature.geometry.coordinates;
  function inside(ring: number[][]) {
    let hit = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i], b = ring[j];
      if (!a || !b) continue;
      if ((a[1] > p.lat) !== (b[1] > p.lat) && p.lng < (b[0] - a[0]) * (p.lat - a[1]) / (b[1] - a[1]) + a[0]) hit = !hit;
    }
    return hit;
  }
  const outer = rings[0];
  return !!outer && inside(outer) && !rings.slice(1).some(inside);
}

export function governorateBounds(key: string) {
  const feature = boundaries.features.find((f) => f.properties.shapeName === boundaryNames[key]);
  if (!feature) throw new Error("محافظة غير صالحة");
  const points = feature.geometry.coordinates.flat();
  return {
    low: { latitude: Math.min(...points.map((p) => p[1])), longitude: Math.min(...points.map((p) => p[0])) },
    high: { latitude: Math.max(...points.map((p) => p[1])), longitude: Math.max(...points.map((p) => p[0])) },
  };
}

function distKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371, r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function governorateOf(p: { lat: number; lng: number }): Governorate {
  const exact = GOVERNORATES.find((g) => isInGovernorate(p, g.key));
  if (exact) return exact;
  let best = GOVERNORATES[0], bd = Infinity;
  for (const g of GOVERNORATES) {
    const d = distKm(p, g);
    if (d < bd) { bd = d; best = g; }
  }
  return best;
}

export function getGovernorate(key: string | null | undefined) {
  return GOVERNORATES.find((g) => g.key === key) ?? null;
}
