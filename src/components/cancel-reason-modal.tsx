import { useState } from "react";
import { X, Loader2, AlertTriangle } from "lucide-react";

type Props = {
  role: "customer" | "provider";
  onClose: () => void;
  onSubmit: (reason: string) => Promise<void> | void;
};

const CUSTOMER_REASONS = [
  "تأخرت الخدمة",
  "طلبت بالخطأ",
  "لم أعد بحاجة للخدمة",
  "اخترت مزوّد خدمة آخر",
  "تغيير الموعد",
  "سبب آخر",
];

const PROVIDER_REASONS = [
  "العميل لا يرد",
  "الموقع غير صحيح",
  "عطل بالمركبة",
  "ظرف طارئ",
  "ازدحام شديد",
  "لا أستطيع تنفيذ الخدمة",
  "سبب آخر",
];

export function CancelReasonModal({ role, onClose, onSubmit }: Props) {
  const reasons = role === "customer" ? CUSTOMER_REASONS : PROVIDER_REASONS;
  const [selected, setSelected] = useState<string>("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const isOther = selected === "سبب آخر";
  const finalReason = isOther ? note.trim() : selected;
  const disabled = busy || !finalReason || (isOther && note.trim().length < 2);

  return (
    <div
      dir="rtl"
      className="fixed inset-0 z-[9998] bg-black/70 backdrop-blur-md grid place-items-end sm:place-items-center p-0 sm:p-4 animate-in fade-in"
      onClick={() => { if (!busy) onClose(); }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-md bg-background rounded-t-3xl sm:rounded-3xl p-5 shadow-2xl border border-border animate-in slide-in-from-bottom-6 duration-300"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="h-10 w-10 rounded-2xl bg-destructive/10 grid place-items-center">
              <AlertTriangle className="h-5 w-5 text-destructive" />
            </div>
            <div>
              <div className="font-black text-base">سبب الإلغاء</div>
              <div className="text-[11px] text-muted-foreground">
                اختر السبب لمساعدتنا على تحسين الخدمة
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="h-9 w-9 rounded-full grid place-items-center hover:bg-muted"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-2 mb-3 max-h-[45vh] overflow-y-auto">
          {reasons.map((r) => (
            <button
              key={r}
              onClick={() => setSelected(r)}
              className={`w-full text-right rounded-2xl px-4 py-3 text-sm font-bold border-2 transition-all active:scale-[0.98] ${
                selected === r
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-card hover:bg-muted"
              }`}
            >
              {r}
            </button>
          ))}
        </div>

        {isOther && (
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, 280))}
            placeholder="اكتب السبب بالتفصيل..."
            rows={3}
            className="w-full bg-input border border-border rounded-2xl px-4 py-3 text-sm outline-none focus:border-primary resize-none mb-3"
          />
        )}

        <div className="grid grid-cols-2 gap-3 mt-2">
          <button
            onClick={onClose}
            className="py-3.5 rounded-2xl border-2 border-border bg-card font-black active:scale-95 transition"
          >
            تراجع
          </button>
          <button
            disabled={disabled}
            onClick={async () => {
              setBusy(true);
              try {
                await onSubmit(finalReason);
              } finally {
                setBusy(false);
              }
            }}
            className="py-3.5 rounded-2xl bg-destructive text-destructive-foreground font-black active:scale-95 transition disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : "تأكيد الإلغاء"}
          </button>
        </div>
      </div>
    </div>
  );
}
