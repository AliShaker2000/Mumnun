import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Input = z.object({
  fileName: z.string().max(200),
  headers: z.array(z.string().max(200)).min(1).max(200),
  sampleRows: z.array(z.array(z.string().max(500))).max(25),
  rowCount: z.number().int().min(0),
  stats: z.record(z.string(), z.object({ empty: z.number(), distinct: z.number() })),
  targetTable: z.string().max(100).optional(),
});

export const suggestCsvMapping = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => Input.parse(d))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await (context.supabase as any).rpc("has_admin_access", { p_user_id: context.userId });
    if (!isAdmin) throw new Error("غير مصرّح: للمديرين فقط");

    // Read the live table/column list so suggestions match the real database.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: spec } = await (supabaseAdmin as any).rest?.get?.("/") ?? { data: null };
    void spec;
    const { schemaSummary } = await import("./import-schema");

    const { generateResponse, GatewayError } = await import("@lovable.dev/ai-gateway");
    const prompt = `You help an admin import a CSV exported from an old Postgres app into the new database.
Target schema (table: columns):
${schemaSummary}

CSV file: ${data.fileName} (${data.rowCount} rows)${data.targetTable ? `, admin thinks target table is ${data.targetTable}` : ""}
Headers: ${JSON.stringify(data.headers)}
Per-column stats (empty count, distinct count): ${JSON.stringify(data.stats)}
Sample rows: ${JSON.stringify(data.sampleRows)}

Return JSON only with shape:
{"target_table": string, "confidence": number (0-1),
 "mappings": [{"csv_column": string, "target_column": string|null, "note": string}],
 "issues": [{"severity": "high"|"medium"|"low", "column": string|null, "explanation_ar": string}],
 "summary_ar": string}
Map every CSV header. Use null when a column has no destination. Explain likely inconsistencies (bad UUIDs, missing required values, enum values not allowed, phone formats, duplicate IDs, references to other tables that must be imported first, date formats). Write explanations in Arabic.`;

    try {
      const res: any = await generateResponse({
        model: "openai/gpt-6-astra",
        input: prompt,
        text: { format: { type: "json_object" } },
      } as any);
      const text: string =
        res.output_text ??
        (res.output ?? []).flatMap((o: any) => o.content ?? []).filter((c: any) => c.type === "output_text").map((c: any) => c.text).join("");
      return JSON.parse(text) as {
        target_table: string; confidence: number; summary_ar: string;
        mappings: { csv_column: string; target_column: string | null; note: string }[];
        issues: { severity: "high" | "medium" | "low"; column: string | null; explanation_ar: string }[];
      };
    } catch (e) {
      if (e instanceof GatewayError) {
        console.error("AI mapping failed", e.code, e.httpStatus);
        if (e.httpStatus === 402) throw new Error("نفد رصيد الذكاء الاصطناعي. أضف رصيداً ثم حاول مجدداً.");
        if (e.httpStatus === 429) throw new Error("طلبات كثيرة. انتظر قليلاً ثم حاول.");
        throw new Error("تعذّر تحليل الملف حالياً.");
      }
      throw new Error("لم يُرجع النموذج نتيجة صالحة. حاول مجدداً.");
    }
  });
