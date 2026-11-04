// GPS quality monitor — watches GPS accuracy and alerts on poor signal.
// Reduces battery by adjusting polling based on accuracy.

export type GpsQuality = "excellent" | "good" | "poor" | "critical" | "unknown";

export function classifyGpsQuality(accuracy: number | null | undefined): GpsQuality {
  if (accuracy == null) return "unknown";
  if (accuracy <= 10) return "excellent";
  if (accuracy <= 30) return "good";
  if (accuracy <= 100) return "poor";
  return "critical";
}

export function getRecommendedPollingMs(quality: GpsQuality): number {
  switch (quality) {
    case "excellent": return 2000;
    case "good": return 4000;
    case "poor": return 8000;
    case "critical": return 15000;
    default: return 5000;
  }
}

export function getGpsQualityColor(quality: GpsQuality): string {
  switch (quality) {
    case "excellent": return "#16a34a";
    case "good": return "#0284c7";
    case "poor": return "#f59e0b";
    case "critical": return "#ef4444";
    default: return "#94a3b8";
  }
}

export function getGpsQualityLabel(quality: GpsQuality): string {
  switch (quality) {
    case "excellent": return "ممتاز";
    case "good": return "جيد";
    case "poor": return "ضعيف";
    case "critical": return "حرج";
    default: return "غير معروف";
  }
}
