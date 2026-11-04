import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface FriendStatus {
  friend_id: string;
  status: "available" | "on_job" | "inactive" | "not_provider" | "not_friend";
  full_name: string | null;
  avatar_url: string | null;
}

export const getFriendsStatuses = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: friends } = await (supabaseAdmin as any)
      .from("friends")
      .select("friend_id")
      .eq("user_id", userId);

    if (!friends || friends.length === 0) return [];

    const results: FriendStatus[] = [];
    for (const f of friends) {
      const { data, error } = await (supabaseAdmin as any).rpc("get_friend_status", {
        p_friend_id: f.friend_id,
      });
      if (error || !data) {
        results.push({
          friend_id: f.friend_id,
          status: "inactive",
          full_name: null,
          avatar_url: null,
        });
      } else {
        results.push({
          friend_id: f.friend_id,
          status: data.status ?? "inactive",
          full_name: data.full_name ?? null,
          avatar_url: data.avatar_url ?? null,
        });
      }
    }
    return results;
  });

export const searchProfileByPhone = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ phone: z.string().trim().min(1).max(50) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await (supabaseAdmin as any).rpc(
      "search_profile_by_phone",
      { _phone: data.phone },
    );
    if (error || !rows) return [];
    return (rows as any[]).filter((r) => r.id !== userId).slice(0, 10);
  });
