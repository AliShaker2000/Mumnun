import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Dispatch a request: find nearby drivers in expanding radius (2→5→10 km)
 * and create pending offers for them. Returns count of offers created.
 */
export const dispatchRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ requestId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: req, error } = await supabase
      .from("service_requests")
      .select("id, customer_id, type, vehicle_category, pickup_lat, pickup_lng, status")
      .eq("id", data.requestId)
      .single();
    if (error || !req) throw new Error("Request not found");
    if (req.customer_id !== userId) throw new Error("Forbidden");
    if (req.type !== "taxi") return { offers: 0, reason: "not_taxi" };
    if (!req.pickup_lat || !req.pickup_lng) throw new Error("Missing pickup location");

    await (supabaseAdmin as any)
      .from("service_requests")
      .update({ status: "searching" as any, searching_started_at: new Date().toISOString() })
      .eq("id", req.id);

    const radii = [2, 5, 10];
    let drivers: any[] = [];
    for (const r of radii) {
      const { data: found } = await (supabaseAdmin as any).rpc("find_nearby_drivers", {
        _lat: req.pickup_lat,
        _lng: req.pickup_lng,
        _category: req.vehicle_category ?? "economy",
        _radius_km: r,
        _limit: 10,
      });
      if (found && found.length) {
        drivers = found;
        break;
      }
    }

    if (!drivers.length) return { offers: 0, reason: "no_drivers" };

    const rows = drivers.map((d: any) => ({
      request_id: req.id,
      provider_id: d.user_id,
      distance_km: d.distance_km,
      status: "pending",
      expires_at: new Date(Date.now() + 7 * 24 * 3600_000).toISOString(),
    }));

    const { error: insertError } = await supabaseAdmin
      .from("request_offers")
      .insert(rows);
    if (insertError) throw new Error("Failed to create offers");

    return { offers: rows.length, reason: "ok" };
  });

/**
 * Provider accepts a service request offer.
 */
export const acceptServiceRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ requestId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as any).rpc("accept_service_request", { _request_id: data.requestId });
    if (error) throw new Error(error.message.includes("request_unavailable") ? "العميل ألغى الطلب أو قبله فني ثاني" : error.message);
    return { ok: true };
  });

/**
 * Provider responds to a specific offer (accept/reject/expire).
 */
export const respondToOffer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        offerId: z.string().uuid(),
        action: z.enum(["accept", "reject"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: offer, error } = await supabase
      .from("request_offers")
      .select("id, request_id, provider_id, status")
      .eq("id", data.offerId)
      .single();
    if (error || !offer) throw new Error("Offer not found");
    if (offer.provider_id !== userId) throw new Error("Forbidden");
    

    if (data.action === "accept") {
      const { error: accErr } = await (supabase as any).rpc("accept_service_request", { _request_id: offer.request_id });
      if (accErr) throw new Error(accErr.message.includes("request_unavailable") ? "العميل ألغى الطلب أو قبله كابتن ثاني" : accErr.message);
      return { ok: true, action: "accepted", accepted: true, requestId: offer.request_id };
    } else {
      await supabaseAdmin
        .from("request_offers")
        .delete()
        .eq("id", data.offerId);
      return { ok: true, action: "rejected" };
    }
  });

/**
 * Customer cancels a request.
 */
export const cancelRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      requestId: z.string().uuid(),
      reason: z.string().max(500).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as any).rpc("cancel_service_request", { _request_id: data.requestId, _reason: data.reason ?? null });
    if (error) throw new Error(error.message.includes("request_finished") ? "الطلب منتهي أصلاً" : "تعذّر الإلغاء: " + error.message);
    return { ok: true };
  });

/**
 * Provider cancels a request they accepted.
 */
export const providerCancelRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      requestId: z.string().uuid(),
      reason: z.string().max(500).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as any).rpc("cancel_service_request", { _request_id: data.requestId, _reason: data.reason ?? null });
    if (error) throw new Error(error.message.includes("request_finished") ? "الطلب منتهي أصلاً" : "تعذّر الإلغاء: " + error.message);
    return { ok: true };
  });

/**
 * Retry dispatch for a request that is still searching.
 */
export const retryDispatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ requestId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: req, error } = await supabase
      .from("service_requests")
      .select("id, customer_id, status, type, vehicle_category, pickup_lat, pickup_lng")
      .eq("id", data.requestId)
      .single();
    if (error || !req) throw new Error("Request not found");
    if (req.customer_id !== userId) throw new Error("Forbidden");
    if (req.status !== "searching") throw new Error("Request is not searching");
    if (req.type !== "taxi") return { offers: 0, reason: "not_taxi" };
    if (!req.pickup_lat || !req.pickup_lng) throw new Error("Missing pickup location");

    await supabaseAdmin
      .from("request_offers")
      .delete()
      .eq("request_id", data.requestId)
      .lt("expires_at", new Date().toISOString());

    const radii = [2, 5, 10];
    let drivers: any[] = [];
    for (const r of radii) {
      const { data: found } = await (supabaseAdmin as any).rpc("find_nearby_drivers", {
        _lat: req.pickup_lat,
        _lng: req.pickup_lng,
        _category: req.vehicle_category ?? "economy",
        _radius_km: r,
        _limit: 10,
      });
      if (found && found.length) {
        drivers = found;
        break;
      }
    }

    if (!drivers.length) return { offers: 0, reason: "no_drivers" };

    const rows = drivers.map((d: any) => ({
      request_id: req.id,
      provider_id: d.user_id,
      distance_km: d.distance_km,
      status: "pending",
      expires_at: new Date(Date.now() + 7 * 24 * 3600_000).toISOString(),
    }));

    const { error: insertError } = await supabaseAdmin
      .from("request_offers")
      .insert(rows);
    if (insertError) throw new Error("Failed to create offers");

    return { offers: rows.length, reason: "ok" };
  });

/**
 * Start a ride (provider arrives at pickup).
 */
export const startRide = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ requestId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: req, error } = await supabase
      .from("service_requests")
      .select("id, provider_id, status")
      .eq("id", data.requestId)
      .single();
    if (error || !req) throw new Error("Request not found");
    if (req.provider_id !== userId) throw new Error("Forbidden");
    if (req.status !== "accepted") throw new Error("Request is not accepted");

    const { error: updateError } = await (supabaseAdmin as any)
      .from("service_requests")
      .update({ status: "in_progress" })
      .eq("id", data.requestId);
    if (updateError) throw new Error("Failed to start ride");

    return { ok: true };
  });

/**
 * Complete a ride.
 */
export const completeRide = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ requestId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: req, error } = await supabase
      .from("service_requests")
      .select("id, provider_id, status, customer_id")
      .eq("id", data.requestId)
      .single();
    if (error || !req) throw new Error("Request not found");
    if (req.provider_id !== userId) throw new Error("Forbidden");
    if (req.status !== "in_progress") throw new Error("Ride is not in progress");

    const { error: updateError } = await (supabaseAdmin as any)
      .from("service_requests")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", data.requestId);
    if (updateError) throw new Error("Failed to complete ride");

    return { ok: true };
  });

export type ProviderPin = {
  pin_id: string;
  lat: number;
  lng: number;
  heading: number | null;
};

export const findNearbyProviderPins = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        lat: z.number(),
        lng: z.number(),
        type: z.enum(["taxi", "service"]),
        category: z.string().nullable().optional(),
        serviceId: z.string().uuid().nullable().optional(),
        radiusKm: z.number().min(0.1).max(100).default(5),
        limit: z.number().int().min(1).max(100).default(30),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await (supabaseAdmin as any).rpc(
      "find_nearby_provider_pins",
      {
        _lat: data.lat,
        _lng: data.lng,
        _type: data.type,
        _category: data.category ?? null,
        _service_id: data.serviceId ?? null,
        _radius_km: data.radiusKm,
        _limit: data.limit,
      },
    );
    if (error) return [];
    return (rows ?? []) as ProviderPin[];
  });
