/** Never turn unavailable driving routes into invented distances or durations. */
export function parseDrivingRoute(result: {
  routes?: Array<{ distanceMeters?: number; duration?: string }>;
}) {
  const route = result.routes?.[0];
  if (!route) throw new Error("لم يتم العثور على طريق للسيارة بين النقطتين");
  const meters = route.distanceMeters ?? 0;
  if (
    !Number.isFinite(meters) ||
    meters < 0 ||
    !route.duration ||
    !/^\d+(\.\d+)?s$/.test(route.duration)
  ) {
    throw new Error("تعذّر قراءة مسافة الطريق؛ أعد المحاولة");
  }
  return { distanceKm: meters / 1000, durationMin: parseFloat(route.duration) / 60 };
}
