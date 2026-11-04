import { useRouter, useRouterState } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

// Goes back one screen; falls back to the home screen when there is no history.
export function useGoBack() {
  const router = useRouter();
  return () => {
    if (router.history.canGoBack()) router.history.back();
    else router.navigate({ to: "/home" });
  };
}

const HIDDEN = ["/", "/home", "/welcome", "/request/new", "/admin"];

export function GlobalBackButton() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const goBack = useGoBack();
  if (HIDDEN.includes(pathname)) return null;
  return (
    <button
      type="button"
      onClick={goBack}
      aria-label="رجوع"
      className="fixed top-3 right-3 z-[70] h-10 w-10 rounded-2xl bg-card/95 backdrop-blur shadow-lg border border-border grid place-items-center text-foreground btn-press"
    >
      <ArrowRight className="h-5 w-5" />
    </button>
  );
}
