import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const grantProviderRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { role: "driver" | "worker" }) => {
    if (input?.role !== "driver" && input?.role !== "worker") {
      throw new Error("Invalid role");
    }
    return input;
  })
  .handler(async ({ data, context }) => {
    // Runs as the signed-in user: the database function checks auth.uid()
    // and requires the matching driver/worker profile to exist first.
    const { error } = await (context.supabase as any).rpc("grant_provider_role_safe", {
      _role: data.role,
    });
    if (error) {
      console.error("[grantProviderRole]", error.message);
      if (/driver_profile_required/.test(error.message)) throw new Error("أكمل بيانات السيارة أولاً");
      if (/worker_profile_required/.test(error.message)) throw new Error("أكمل بيانات الفني أولاً");
      throw new Error("تعذّر تفعيل الدور، حاول مرة أخرى");
    }
    return { ok: true };
  });
