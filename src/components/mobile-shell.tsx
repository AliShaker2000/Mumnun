import { Link, useRouterState } from "@tanstack/react-router";
import { Home, ClipboardList, MessageCircle, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { playClick } from "@/lib/click-sound";
import type { ReactNode } from "react";

interface Props {
  children: ReactNode;
  hideNav?: boolean;
}

export function MobileShell({ children, hideNav }: Props) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const items = [
    { to: "/home", label: "الرئيسية", icon: Home },
    { to: "/history", label: "الطلبات", icon: ClipboardList },
    { to: "/messages", label: "الرسائل", icon: MessageCircle },
    { to: "/profile", label: "حسابي", icon: User },
  ] as const;

  return (
    <div className="min-h-screen flex flex-col relative">
      <main className={cn("flex-1 pb-24 relative", hideNav && "pb-0")}>{children}</main>
      {!hideNav && (
        <nav className="fixed bottom-0 inset-x-0 z-40 px-3 pb-3 pt-1 pointer-events-none">
          <div className="glass-strong rounded-2xl shadow-card mx-auto max-w-md pointer-events-auto border border-border/50">
            <ul className="grid grid-cols-4">
              {items.map(({ to, label, icon: Icon }) => {
                const active = pathname === to || (to !== "/home" && pathname.startsWith(to));
                return (
                  <li key={to}>
                    <Link
                      to={to}
                      onClick={() => playClick("soft")}
                      className={cn(
                        "flex flex-col items-center gap-1 py-3 tap-highlight-none btn-press transition-colors",
                        active
                          ? "text-primary font-bold"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      <Icon
                        className={cn(
                          "h-5 w-5",
                          active && "drop-shadow-[0_0_8px_var(--color-primary)]",
                        )}
                      />
                      <span className="text-[11px] font-bold">{label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        </nav>
      )}
    </div>
  );
}
