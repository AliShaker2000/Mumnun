import { useEffect, useState } from "react";

export type WelcomeLanguage = "ar" | "en";
export const WELCOME_STORAGE_KEY = "mumnun-welcome-v1";

export function readWelcomePreferences(storage: Pick<Storage, "getItem">) {
  try {
    const value = JSON.parse(storage.getItem(WELCOME_STORAGE_KEY) || "null");
    return { language: value?.language === "en" ? "en" as const : "ar" as const, completed: value?.completed === true };
  } catch {
    return { language: "ar" as const, completed: false };
  }
}

export function useWelcomePreferences() {
  const [preferences, setPreferences] = useState<{ language: WelcomeLanguage; completed: boolean }>({ language: "ar", completed: false });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try { setPreferences(readWelcomePreferences(window.localStorage)); } catch { /* Storage may be disabled. */ }
    setReady(true);
  }, []);

  function save(language: WelcomeLanguage, completed = preferences.completed) {
    const next = { language, completed };
    setPreferences(next);
    try { window.localStorage.setItem(WELCOME_STORAGE_KEY, JSON.stringify(next)); } catch { /* Navigation still works without persistence. */ }
  }

  return { ...preferences, ready, save };
}