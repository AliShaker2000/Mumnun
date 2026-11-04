import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const lookupAuthEmail = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        identifier: z.string().trim().min(3).max(255),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const id = data.identifier.trim();
    const isEmail = id.includes("@");

    if (isEmail) {
      return { email: id.toLowerCase() };
    }

    const { data: email } = await (supabaseAdmin as any)
      .rpc("lookup_email_by_phone", { _phone: id });

    if (email) return { email: String(email).toLowerCase() };

    const digits = id.replace(/[^\d]/g, "");
    return { email: `phone${digits}@mamnoon.app` };
  });

export const sendPasswordReset = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        identifier: z.string().trim().min(3).max(255),
        redirectTo: z.string().url().max(500),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const id = data.identifier.trim();
    const isEmail = id.includes("@");

    let email: string | null = null;
    if (isEmail) {
      email = id.toLowerCase();
    } else {
      const { data: emailResult } = await (supabaseAdmin as any)
        .rpc("lookup_email_by_phone", { _phone: id });
      email = emailResult ? String(emailResult) : null;
    }

    if (!email) {
      return { ok: true, hasEmail: false };
    }

    try {
      const redirectUrl = new URL(data.redirectTo);
      const allowedOrigins = (process.env.ALLOWED_REDIRECT_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
      if (allowedOrigins.length && !allowedOrigins.includes(redirectUrl.origin)) {
        return { ok: true, hasEmail: false };
      }
    } catch {
      return { ok: true, hasEmail: false };
    }

    const { error } = await supabaseAdmin.auth.resetPasswordForEmail(email, {
      redirectTo: data.redirectTo,
    });
    if (error) console.error("[sendPasswordReset]", error.message);
    return { ok: true, hasEmail: true };
  });
