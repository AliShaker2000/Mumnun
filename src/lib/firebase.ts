import { initializeApp, type FirebaseApp } from "firebase/app";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string | undefined,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID as string | undefined,
};

const hasFirebaseConfig = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId);

export const firebaseApp: FirebaseApp | null =
  typeof window !== "undefined" && hasFirebaseConfig
    ? initializeApp(firebaseConfig as any)
    : null;

if (typeof window !== "undefined" && firebaseApp) {
  import("firebase/analytics")
    .then(({ getAnalytics, isSupported }) =>
      isSupported().then((ok) => {
        if (ok) getAnalytics(firebaseApp!);
      })
    )
    .catch(() => {});
}

export async function getFCM(): Promise<import("firebase/messaging").Messaging | null> {
  if (typeof window === "undefined" || !firebaseApp) return null;
  try {
    const { getMessaging } = await import("firebase/messaging");
    return getMessaging(firebaseApp);
  } catch {
    return null;
  }
}

export async function requestNotificationPermission(): Promise<string | null> {
  if (typeof window === "undefined" || !firebaseApp) return null;
  if (!("Notification" in window)) return null;
  const perm = await Notification.requestPermission();
  if (perm !== "granted") return null;
  const fcm = await getFCM();
  if (!fcm) return null;
  try {
    const { getToken } = await import("firebase/messaging");
    return await getToken(fcm, {
      vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY as string,
    });
  } catch {
    return null;
  }
}

export async function onForegroundMessage(cb: (payload: any) => void): Promise<(() => void) | null> {
  if (!firebaseApp) return null;
  const fcm = await getFCM();
  if (!fcm) return null;
  try {
    const { onMessage } = await import("firebase/messaging");
    return onMessage(fcm, cb);
  } catch {
    return null;
  }
}

export async function logAnalyticsEvent(eventName: string, params?: Record<string, any>): Promise<void> {
  if (typeof window === "undefined" || !firebaseApp) return;
  try {
    const { getAnalytics, logEvent } = await import("firebase/analytics");
    const analytics = getAnalytics(firebaseApp);
    logEvent(analytics, eventName, params);
  } catch {}
}

export async function startPerformanceTrace(traceName: string): Promise<{ stop: () => void } | null> {
  if (typeof window === "undefined" || !firebaseApp) return null;
  try {
    const { getPerformance, trace } = await import("firebase/performance");
    const perf = getPerformance(firebaseApp);
    const t = trace(perf, traceName);
    t.start();
    return { stop: () => { try { t.stop(); } catch {} } };
  } catch {
    return null;
  }
}
