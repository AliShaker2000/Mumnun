import type { WeatherCondition } from "@/lib/taxi-fares";

const RAIN_CODES = new Set([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99]);

export function seasonalWeatherFallback(date: Date = new Date()): WeatherCondition {
  const month = date.getMonth();
  return month >= 4 && month <= 8 ? "heat" : month <= 1 || month === 11 ? "cold" : "mild";
}

export async function detectWeatherCondition(
  lat: number,
  lng: number,
  signal?: AbortSignal,
): Promise<WeatherCondition> {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,precipitation,weather_code`;
    const res = await fetch(url, { signal });
    if (!res.ok) return seasonalWeatherFallback();
    const json = (await res.json()) as {
      current?: { temperature_2m?: number; precipitation?: number; weather_code?: number };
    };
    const current = json.current;
    if (!current || typeof current.temperature_2m !== "number") return seasonalWeatherFallback();
    if ((current.precipitation ?? 0) > 0 || RAIN_CODES.has(current.weather_code ?? -1)) return "rain";
    if (current.temperature_2m >= 35) return "heat";
    if (current.temperature_2m <= 12) return "cold";
    return "mild";
  } catch (err) {
    if (signal?.aborted) throw err;
    return seasonalWeatherFallback();
  }
}
