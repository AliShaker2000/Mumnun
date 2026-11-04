import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Only the referrer-restricted rendering key is intentionally public.
export const getMapConfig = createServerFn({ method: "GET" }).handler(async () => ({
  browserKey: process.env['GOOGLE_MAPS_BROWSER_KEY'] || process.env['VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY'] || "",
  channel: process.env['VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_TRACKING_ID'] || "mumnun",
}));

const coords = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) });
const input = z.discriminatedUnion("action", [
  z.object({ action: z.literal("autocomplete"), input: z.string().trim().min(2).max(200), sessionToken: z.string().uuid(), center: coords }),
  z.object({ action: z.literal("details"), placeId: z.string().regex(/^[A-Za-z0-9_-]+$/).max(300), sessionToken: z.string().uuid() }),
  z.object({ action: z.literal("reverse"), center: coords }),
  z.object({ action: z.literal("route"), from: coords, to: coords }),
]);

export const lookupMapPlace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: z.infer<typeof input>) => input.parse(data))
  .handler(async ({ data }) => {
    const apiKey = process.env['GOOGLE_MAPS_API_KEY'];
    const lovableKey = process.env['LOVABLE_API_KEY'];
    if (!apiKey || !lovableKey) throw new Error("إعدادات البحث عن الأماكن غير متاحة؛ يمكنك مشاركة موقعك مباشرة.");
    const gateway = "https://connector-gateway.lovable.dev/google_maps";
    const headers: Record<string, string> = { Authorization: `Bearer ${lovableKey}`, "X-Connection-Api-Key": apiKey, "Content-Type": "application/json" };
    let path: string;
    let body: string | undefined;
    if (data.action === "autocomplete") {
      path = "/places/v1/places:autocomplete";
      headers["X-Goog-FieldMask"] = "suggestions.placePrediction.placeId,suggestions.placePrediction.text.text";
      body = JSON.stringify({ input: data.input, sessionToken: data.sessionToken, languageCode: "ar", includedRegionCodes: ["iq"], locationBias: { circle: { center: { latitude: data.center.lat, longitude: data.center.lng }, radius: 50000 } } });
    } else if (data.action === "details") {
      path = `/places/v1/places/${encodeURIComponent(data.placeId)}?sessionToken=${data.sessionToken}&languageCode=ar`;
      headers["X-Goog-FieldMask"] = "location,formattedAddress,displayName";
    } else if (data.action === "route") {
      path = "/routes/directions/v2:computeRoutes";
      headers["X-Goog-FieldMask"] = "routes.distanceMeters,routes.duration";
      body = JSON.stringify({
        origin: { location: { latLng: { latitude: data.from.lat, longitude: data.from.lng } } },
        destination: { location: { latLng: { latitude: data.to.lat, longitude: data.to.lng } } },
        travelMode: "DRIVE",
      });
    } else {
      path = `/maps/api/geocode/json?latlng=${data.center.lat},${data.center.lng}&language=ar`;
    }
    const response = await fetch(gateway + path, { method: body ? "POST" : "GET", headers, body });
    if (!response.ok) {
      const text = await response.text();
      console.error(`[Maps ${response.status}] ${text}`);
      if (response.status === 403) {
        if (text.includes("API_KEY_HTTP_REFERRER_BLOCKED")) throw new Error("مفتاح Google الخاص بخدمات البحث مقيّد بالمواقع؛ غيّر تقييده إلى None أو IP addresses في Google Cloud.");
        if (text.includes("API_KEY_SERVICE_BLOCKED")) throw new Error("فعّل Places API (New) وGeocoding API ضمن خدمات المفتاح في Google Cloud.");
      }
      throw new Error(`Google Maps [${response.status}]: ${text}`);
    }
    const result = await response.json() as any;
    if (data.action === "autocomplete") return { suggestions: (result.suggestions ?? []).slice(0, 5).flatMap((s: any) => s.placePrediction ? [{ id: s.placePrediction.placeId as string, text: s.placePrediction.text.text as string }] : []) };
    if (data.action === "details") {
      if (!result.location) throw new Error("لا يتوفر موقع لهذا المكان");
      return { coords: { lat: result.location.latitude as number, lng: result.location.longitude as number }, address: (result.formattedAddress || result.displayName?.text || "") as string };
    }
    if (data.action === "route") {
      const r = result.routes?.[0];
      if (!r) throw new Error("ROUTE_NOT_FOUND");
      return { distanceKm: (r.distanceMeters ?? 0) / 1000, durationMin: parseFloat(String(r.duration ?? "0s")) / 60 };
    }
    if (result.status !== "OK" && result.status !== "ZERO_RESULTS") throw new Error(`Google Maps: ${result.status}: ${result.error_message || ""}`);
    return { address: (result.results?.[0]?.formatted_address || "") as string };
  });