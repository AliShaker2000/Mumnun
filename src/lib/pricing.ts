// Distance estimation (haversine) and fare calculation.
export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export interface PricingRule {
  base_fare: number;
  per_km: number;
  per_min: number;
  minimum_fare: number;
  commission_pct: number;
}

export function estimateFare(rule: PricingRule, distanceKm: number, durationMin?: number) {
  const dur = durationMin ?? distanceKm * 2; // rough 30 km/h city avg
  const raw = rule.base_fare + rule.per_km * distanceKm + rule.per_min * dur;
  const total = Math.max(rule.minimum_fare, Math.round(raw / 250) * 250); // round to 250 IQD
  return {
    total,
    base: rule.base_fare,
    distance_cost: Math.round(rule.per_km * distanceKm),
    time_cost: Math.round(rule.per_min * dur),
    distance_km: Number(distanceKm.toFixed(2)),
    duration_min: Number(dur.toFixed(1)),
    commission: Math.round((total * rule.commission_pct) / 100),
  };
}
