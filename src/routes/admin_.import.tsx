import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/lib/auth-context";
import { suggestCsvMapping } from "@/lib/import-assist.functions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Upload, Sparkles, ChevronRight, AlertTriangle } from "lucide-react";
import { toast } from "@/lib/toast";

export const Route = createFileRoute("/admin_/import")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "مساعد استيراد البيانات | ممنون" },
      {
        name: "description",
        content: "ارفع ملفات CSV ودع الذكاء الاصطناعي يقترح ربط الأعمدة ويشرح المشاكل.",
      },
      { property: "og:title", content: "مساعد استيراد البيانات | ممنون" },
      { property: "og:description", content: "اقتراح ربط أعمدة ملفات CSV وكشف تناقضات البيانات." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ImportPage,
});

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ",") {
      row.push(cur);
      cur = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cur);
      rows.push(row);
      row = [];
      cur = "";
    } else cur += c;
  }
  if (cur || row.length) {
    row.push(cur);
    rows.push(row);
  }
  return rows.filter((r) => r.some((v) => v !== ""));
}

type Result = Awaited<ReturnType<typeof suggestCsvMapping>>;
type FileState = {
  name: string;
  headers: string[];
  rows: string[][];
  result?: Result;
  loading?: boolean;
  error?: string;
};

const sevColor: Record<string, "destructive" | "default" | "secondary"> = {
  high: "destructive",
  medium: "default",
  low: "secondary",
};
const sevLabel: Record<string, string> = { high: "عالي", medium: "متوسط", low: "منخفض" };

function ImportPage() {
  const { session, loading } = useAuth();
  const suggest = useServerFn(suggestCsvMapping);
  const [files, setFiles] = useState<FileState[]>([]);

  if (loading)
    return (
      <div className="p-8 flex justify-center">
        <Loader2 className="animate-spin" />
      </div>
    );
  if (!session) return <Navigate to="/auth" />;

  async function onFiles(list: FileList | null) {
    if (!list) return;
    const parsed: FileState[] = [];
    for (const f of Array.from(list)) {
      const all = parseCsv(await f.text());
      if (!all.length) {
        toast.error(`${f.name}: الملف فارغ`);
        continue;
      }
      parsed.push({ name: f.name, headers: all[0]!, rows: all.slice(1) });
    }
    setFiles((p) => [...p, ...parsed]);
  }

  async function analyze(i: number) {
    const f = files[i]!;
    setFiles((p) => p.map((x, j) => (j === i ? { ...x, loading: true, error: undefined } : x)));
    const stats: Record<string, { empty: number; distinct: number }> = {};
    f.headers.forEach((h, c) => {
      const vals = f.rows.map((r) => r[c] ?? "");
      stats[h] = { empty: vals.filter((v) => v === "").length, distinct: new Set(vals).size };
    });
    try {
      const result = await suggest({
        data: {
          fileName: f.name,
          headers: f.headers,
          rowCount: f.rows.length,
          stats,
          sampleRows: f.rows.slice(0, 15).map((r) => r.map((v) => v.slice(0, 500))),
        },
      });
      setFiles((p) => p.map((x, j) => (j === i ? { ...x, loading: false, result } : x)));
    } catch (e: any) {
      setFiles((p) =>
        p.map((x, j) => (j === i ? { ...x, loading: false, error: e?.message ?? "خطأ" } : x)),
      );
    }
  }

  return (
    <div dir="rtl" className="min-h-screen bg-background p-4 max-w-4xl mx-auto space-y-4">
      <Link to="/admin" className="inline-flex items-center gap-1 text-sm text-muted-foreground">
        <ChevronRight className="w-4 h-4" />
        لوحة الإدارة
      </Link>
      <h1 className="text-2xl font-bold">مساعد استيراد البيانات</h1>
      <p className="text-sm text-muted-foreground">
        ارفع ملفات CSV من قاعدة بياناتك القديمة. سيقترح الذكاء الاصطناعي الجدول وربط الأعمدة ويشرح
        المشاكل المحتملة. لا يتم استيراد أي شيء تلقائياً.
      </p>
      <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-border rounded-xl p-8 cursor-pointer hover:bg-muted/40">
        <Upload className="w-6 h-6 text-muted-foreground" />
        <span className="text-sm">اختر ملفات CSV</span>
        <input
          type="file"
          accept=".csv,text/csv"
          multiple
          className="hidden"
          onChange={(e) => onFiles(e.target.files)}
        />
      </label>

      {files.map((f, i) => (
        <Card key={i} className="p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="font-semibold">{f.name}</div>
              <div className="text-xs text-muted-foreground">
                {f.rows.length} صف · {f.headers.length} عمود
              </div>
            </div>
            <Button size="sm" onClick={() => analyze(i)} disabled={f.loading}>
              {f.loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              <span className="ms-1">{f.result ? "إعادة التحليل" : "تحليل"}</span>
            </Button>
          </div>
          {f.error && (
            <div className="text-sm text-destructive flex gap-1 items-center">
              <AlertTriangle className="w-4 h-4" />
              {f.error}
            </div>
          )}
          {f.result && (
            <div className="space-y-3">
              <div className="text-sm">
                الجدول المقترح: <Badge>{f.result.target_table}</Badge>{" "}
                <span className="text-muted-foreground">
                  (ثقة {Math.round((f.result.confidence ?? 0) * 100)}%)
                </span>
              </div>
              <p className="text-sm">{f.result.summary_ar}</p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-muted-foreground text-start">
                      <th className="text-start p-1">عمود الملف</th>
                      <th className="text-start p-1">العمود المقترح</th>
                      <th className="text-start p-1">ملاحظة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {f.result.mappings.map((m, k) => (
                      <tr key={k} className="border-t border-border">
                        <td className="p-1 font-mono" dir="ltr">
                          {m.csv_column}
                        </td>
                        <td className="p-1 font-mono" dir="ltr">
                          {m.target_column ?? <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="p-1 text-muted-foreground">{m.note}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {f.result.issues.length > 0 && (
                <div className="space-y-2">
                  <div className="font-semibold text-sm">مشاكل محتملة</div>
                  {f.result.issues.map((s, k) => (
                    <div key={k} className="flex gap-2 items-start text-sm">
                      <Badge variant={sevColor[s.severity] ?? "secondary"}>
                        {sevLabel[s.severity] ?? s.severity}
                      </Badge>
                      <div>
                        {s.column && (
                          <span className="font-mono me-1" dir="ltr">
                            {s.column}:
                          </span>
                        )}
                        {s.explanation_ar}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}
