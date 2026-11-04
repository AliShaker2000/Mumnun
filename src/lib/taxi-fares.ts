// Taxi fares calibrated to realistic Iraqi market pricing (Baly & Careem benchmarks):
// Fully realistic calculations based on:
// 1. Distance in km
// 2. Road condition (normal vs congested / rush hour traffic)
// 3. Climate & weather conditions (summer heat with continuous AC cooling vs winter cold vs mild)
// Always rounded UP to the nearest 250 IQD denomination.

export type VehicleCategory = "economy" | "premium" | "luxury";
export type WeatherCondition = "heat" | "rain" | "cold" | "mild";
export type RoadCondition = "normal" | "congested";

export interface FareOptions {
  weather?: WeatherCondition;
  roadCondition?: RoadCondition;
}

export interface FareBreakdown {
  category: VehicleCategory;
  distanceKm: number;
  baseFare: number;
  distanceFare: number;
  weatherAllowance: number;
  trafficAllowance: number;
  subtotal: number;
  minimumFare: number;
  total: number;
  weatherDescription: string;
  roadDescription: string;
}

export const FARE_TABLE: Record<VehicleCategory, { base: number; perKm: number; minimum: number; titleAr: string }> = {
  economy: { base: 1500, perKm: 400, minimum: 3000, titleAr: "ممنون اقتصادي" },
  premium: { base: 2000, perKm: 500, minimum: 4000, titleAr: "ممنون المتميز" },
  luxury:  { base: 3000, perKm: 750, minimum: 6000, titleAr: "ممنون فاخر" },
};

export const WEATHER_RATES: Record<WeatherCondition, { extra: number; label: string; icon: string }> = {
  heat: { extra: 750, label: "أجواء حارة (تكييف مستمر AC)", icon: "☀️" },
  rain: { extra: 750, label: "أجواء ماطرة وأمطار", icon: "🌧️" },
  cold: { extra: 500, label: "أجواء باردة وشتاء", icon: "❄️" },
  mild: { extra: 0,   label: "جو معتدل", icon: "🌤️" },
};

export const ROAD_RATES: Record<RoadCondition, { extra: number; label: string; icon: string }> = {
  normal:    { extra: 0,   label: "طريق سالك وسريع", icon: "🟢" },
  congested: { extra: 750, label: "طريق مزدحم وساعات ذروة", icon: "🟡" },
};

export function roundUp250(n: number): number {
  return Math.ceil(n / 250) * 250;
}

export function calculateFareBreakdown(
  category: VehicleCategory,
  distanceKm: number,
  options?: FareOptions
): FareBreakdown {
  const t = FARE_TABLE[category];
  const km = Math.max(0, distanceKm);
  const weather = options?.weather ?? "heat"; // Default to heat in Iraq
  const roadCondition = options?.roadCondition ?? "normal";

  const weatherData = WEATHER_RATES[weather];
  const roadData = ROAD_RATES[roadCondition];

  const distanceFare = t.perKm * km;
  const subtotal = t.base + distanceFare + weatherData.extra + roadData.extra;
  const finalTotal = roundUp250(Math.max(t.minimum, subtotal));

  return {
    category,
    distanceKm: Number(km.toFixed(2)),
    baseFare: t.base,
    distanceFare: Math.round(distanceFare),
    weatherAllowance: weatherData.extra,
    trafficAllowance: roadData.extra,
    subtotal: Math.round(subtotal),
    minimumFare: t.minimum,
    total: finalTotal,
    weatherDescription: weatherData.label,
    roadDescription: roadData.label,
  };
}

export function taxiFare(
  category: VehicleCategory,
  distanceKm: number,
  options?: FareOptions
): number {
  return calculateFareBreakdown(category, distanceKm, options).total;
}

/** Straight-line distance → approximate realistic road routing distance in Baghdad/Iraqi cities. */
export function approxRoadKm(straightKm: number): number {
  return Number((straightKm * 1.35).toFixed(2));
}
