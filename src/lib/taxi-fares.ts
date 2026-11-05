// All vehicles use the user-defined distance-only tariff: 400 IQD per driving km.

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
  economy: { base: 0, perKm: 400, minimum: 0, titleAr: "ممنون اقتصادي" },
  premium: { base: 0, perKm: 400, minimum: 0, titleAr: "ممنون المتميز" },
  luxury:  { base: 0, perKm: 400, minimum: 0, titleAr: "ممنون فاخر" },
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

export function roundTo250(n: number): number {
  return Math.round(n / 250) * 250;
}

export function calculateFareBreakdown(
  category: VehicleCategory,
  distanceKm: number,
  options?: FareOptions
): FareBreakdown {
  const t = FARE_TABLE[category];
  if (!Number.isFinite(distanceKm) || distanceKm < 0) throw new Error("مسافة الطريق غير صالحة");
  const km = distanceKm;
  const weather = options?.weather ?? "heat"; // Default to heat in Iraq
  const roadCondition = options?.roadCondition ?? "normal";

  const weatherData = WEATHER_RATES[weather];
  const roadData = ROAD_RATES[roadCondition];

  const distanceFare = t.perKm * km;
  const subtotal = distanceFare;
  const finalTotal = roundTo250(subtotal);

  return {
    category,
    distanceKm: km,
    baseFare: t.base,
    distanceFare: finalTotal,
    weatherAllowance: 0,
    trafficAllowance: 0,
    subtotal: finalTotal,
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
