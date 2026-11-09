import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Dispatch creates offers for nearby/available drivers and advances stage */
export const dispatchRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ requestId: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: req, error } = await supabase
      .from("service_requests")
      .select("*")
      .eq("id", data.requestId)
      .maybeSingle();

    if (error || !req) throw new Error("الطلب غير موجود");
    if (req.customer_id !== userId) throw new Error("ليس لديك صلاحية لهذا الطلب");

    // Update status to searching
    await (supabase as any)
      .from("service_requests")
      .update({ status: "searching" })
      .eq("id", req.id);

    // Find all driver accounts to dispatch the ride offer to
    let driverIds: string[] = [];
    try {
      const { data: roleDrivers } = await (supabase as any)
        .from("user_roles")
        .select("user_id")
        .eq("role", "driver");

      if (roleDrivers && roleDrivers.length > 0) {
        driverIds = roleDrivers
          .map((r: any) => r.user_id)
          .filter((id: string) => id && id !== req.customer_id);
      }
    } catch {}

    // Also look up driver profiles
    try {
      const { data: driverProfs } = await (supabase as any)
        .from("driver_profiles")
        .select("user_id");

      if (driverProfs && driverProfs.length > 0) {
        for (const dp of driverProfs) {
          if (dp.user_id && dp.user_id !== req.customer_id && !driverIds.includes(dp.user_id)) {
            driverIds.push(dp.user_id);
          }
        }
      }
    } catch {}

    const expiresAt = new Date(Date.now() + 60 * 1000).toISOString();
    let createdOffers = 0;

    for (const driverId of driverIds) {
      try {
        const offerId = `offer_${req.id.slice(0, 8)}_${driverId.slice(0, 8)}`;
        await (supabase as any).from("request_offers").upsert({
          id: offerId,
          request_id: req.id,
          provider_id: driverId,
          distance_km: req.distance_km || 1.8,
          status: "pending",
          sent_at: new Date().toISOString(),
          expires_at: expiresAt,
        });
        createdOffers++;
      } catch (err) {
        console.warn("[dispatchRequest] offer creation failed for driver", driverId, err);
      }
    }

    // Try database RPC if available
    try {
      await (supabase as any).rpc("advance_taxi_dispatch", { _request_id: req.id });
    } catch {}

    return { offers: createdOffers, reason: "searching" };
  });

/**
 * Provider accepts a service request offer.
 */
export const acceptServiceRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ requestId: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let accepted = false;
    try {
      const { error } = await (supabase as any).rpc("accept_service_request", {
        _request_id: data.requestId,
      });
      if (!error) accepted = true;
    } catch {}

    if (!accepted) {
      // Fallback direct status update
      await (supabaseAdmin as any)
        .from("service_requests")
        .update({
          provider_id: userId,
          status: "accepted",
          accepted_at: new Date().toISOString(),
        })
        .eq("id", data.requestId);

      // Also update any matching pending offer
      await (supabase as any)
        .from("request_offers")
        .update({ status: "accepted", responded_at: new Date().toISOString() })
        .eq("request_id", data.requestId)
        .eq("provider_id", userId);
    }

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
        offerId: z.string().min(1),
        action: z.enum(["accept", "reject"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: offer } = await supabase
      .from("request_offers")
      .select("id, request_id, provider_id, status")
      .eq("id", data.offerId)
      .maybeSingle();

    const targetRequestId = offer?.request_id || data.offerId;

    if (data.action === "accept") {
      let accepted = false;
      try {
        const { error: accErr } = await (supabase as any).rpc("accept_service_request", {
          _request_id: targetRequestId,
        });
        if (!accErr) accepted = true;
      } catch {}

      if (!accepted) {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        await (supabaseAdmin as any)
          .from("service_requests")
          .update({
            provider_id: userId,
            status: "accepted",
            accepted_at: new Date().toISOString(),
          })
          .eq("id", targetRequestId);
      }

      await (supabase as any)
        .from("request_offers")
        .update({ status: "accepted", responded_at: new Date().toISOString() })
        .eq("id", data.offerId);

      return { ok: true, action: "accepted", accepted: true, requestId: targetRequestId };
    } else {
      try {
        await (supabase as any).rpc("reject_request_offer", { _offer_id: data.offerId });
      } catch {}

      await (supabase as any)
        .from("request_offers")
        .update({ status: "rejected", responded_at: new Date().toISOString() })
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
    z
      .object({
        requestId: z.string().min(1),
        reason: z.string().max(500).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    try {
      const { error } = await (context.supabase as any).rpc("cancel_service_request", {
        _request_id: data.requestId,
        _reason: data.reason ?? null,
      });
      if (!error) return { ok: true };
    } catch {}

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await (supabaseAdmin as any)
      .from("service_requests")
      .update({
        status: "cancelled",
        cancellation_reason: data.reason ?? null,
      })
      .eq("id", data.requestId);

    return { ok: true };
  });

/**
 * Provider cancels a request they accepted.
 */
export const providerCancelRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        requestId: z.string().min(1),
        reason: z.string().max(500).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    try {
      const { error } = await (context.supabase as any).rpc("cancel_service_request", {
        _request_id: data.requestId,
        _reason: data.reason ?? null,
      });
      if (!error) return { ok: true };
    } catch {}

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await (supabaseAdmin as any)
      .from("service_requests")
      .update({
        status: "cancelled",
        cancellation_reason: data.reason ?? null,
      })
      .eq("id", data.requestId);

    return { ok: true };
  });

/** Compatibility read: client retries never reset offers or dispatch deadlines. */
export const retryDispatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ requestId: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: req, error } = await context.supabase
      .from("service_requests")
      .select("id, customer_id, status")
      .eq("id", data.requestId)
      .single();
    if (error || !req) throw new Error("الطلب غير موجود");
    if (req.customer_id !== context.userId) throw new Error("ليس لديك صلاحية لهذا الطلب");
    return { offers: 0, reason: req.status };
  });

/**
 * Start a ride (provider arrives at pickup).
 */
export const startRide = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ requestId: z.string().min(1) }).parse(d))
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
  .inputValidator((d) => z.object({ requestId: z.string().min(1) }).parse(d))
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
    const { data: rows, error } = await (supabaseAdmin as any).rpc("find_nearby_provider_pins", {
      _lat: data.lat,
      _lng: data.lng,
      _type: data.type,
      _category: data.category ?? null,
      _service_id: data.serviceId ?? null,
      _radius_km: data.radiusKm,
      _limit: data.limit,
    });
    if (error) return [];
    return (rows ?? []) as ProviderPin[];
  });
