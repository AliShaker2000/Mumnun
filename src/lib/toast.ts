import { toast as sonnerToast, type ExternalToast } from "sonner";
import { arabicWarning } from "./arabic-errors";

function warningOptions(options?: ExternalToast): ExternalToast {
  return {
    ...options,
    description: options?.description == null ? undefined : arabicWarning(options.description),
  };
}

// Keep regular messages intact, but every warning/error uses Arabic regardless of UI language.
export const toast = Object.assign(
  (...args: Parameters<typeof sonnerToast>) => sonnerToast(...args),
  sonnerToast,
  {
    error: (message: Parameters<typeof sonnerToast.error>[0], options?: ExternalToast) =>
      sonnerToast.error(arabicWarning(message), warningOptions(options)),
    warning: (message: Parameters<typeof sonnerToast.warning>[0], options?: ExternalToast) =>
      sonnerToast.warning(arabicWarning(message), warningOptions(options)),
  },
);
