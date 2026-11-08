import { describe, expect, it } from "vitest";
import { arabicWarning } from "./arabic-errors";

describe("Arabic-only warnings", () => {
  it("explains an active request in Arabic", () => {
    expect(arabicWarning("active_request_exists")).toBe(
      "لديك طلب نشط بالفعل؛ أكمله أو ألغِه قبل إنشاء طلب جديد",
    );
  });
  it("translates weak or breached password warnings", () => {
    expect(arabicWarning("Password is too weak or pwned")).toBe(
      "كلمة المرور ضعيفة أو مكشوفة؛ اختر كلمة مرور أقوى",
    );
  });
  it("translates English-mode password validation", () => {
    expect(arabicWarning("Password must be at least 6 characters")).toBe(
      "كلمة المرور يجب أن تكون ٦ أحرف على الأقل",
    );
  });
  it("does not expose unknown English provider errors", () => {
    expect(arabicWarning("Unexpected backend exception PGRST999")).toBe(
      "تعذّر تنفيذ العملية؛ أعد المحاولة أو تواصل مع الإدارة",
    );
  });
});
