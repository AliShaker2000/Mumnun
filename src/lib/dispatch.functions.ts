import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Dispatch is created transactionally by the request insert trigger. */
export const dispatchRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ requestId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: req, error } = await context.supabase.from("service_requests").select("id, customer_id, type, status").eq("id", data.requestId).single();
    if (error || !req) throw new Error("الطلب غير موجود");
    if (req.customer_id !== context.userId) throw new Error("ليس لديك صلاحية لهذا الطلب");
    const { count } = await context.supabase.from("request_offers").select("id", { count: "exact", head: true }).eq("request_id", req.id).eq("status", "pending").gt("expires_at", new Date().toISOString());
    return { offers: count ?? 0, reason: req.status };
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
      const { error: rejectError } = await (supabase as any).rpc("reject_request_offer", { _offer_id: data.offerId });
      if (rejectError) throw new Error(rejectError.message);
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

/** Compatibility read: client retries never reset offers or dispatch deadlines. */
export const retryDispatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ requestId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: req, error } = await context.supabase.from("service_requests").select("id, customer_id, status").eq("id", data.requestId).single();
    if (error || !req) throw new Error("الطلب غير موجود");
    if (req.customer_id !== context.userId) throw new Error("ليس لديك صلاحية لهذا الطلب");
    return { offers: 0, reason: req.status };
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
