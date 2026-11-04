// Professional logging system with levels, remote reporting, and local buffering.

export type LogLevel = "debug" | "info" | "warn" | "error" | "fatal";

interface LogEntry {
  level: LogLevel;
  message: string;
  data?: any;
  timestamp: string;
  url?: string;
  userId?: string;
}

const LOG_BUFFER_KEY = "mumnun_log_buffer";
const MAX_BUFFER = 50;
let remoteEndpoint: string | null = null;
let userId: string | null = null;

export function configureLogging(opts: { endpoint?: string; userId?: string }) {
  if (opts.endpoint) remoteEndpoint = opts.endpoint;
  if (opts.userId) userId = opts.userId;
}

function getBuffer(): LogEntry[] {
  try {
    const raw = sessionStorage.getItem(LOG_BUFFER_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveBuffer(entries: LogEntry[]) {
  try {
    sessionStorage.setItem(LOG_BUFFER_KEY, JSON.stringify(entries.slice(-MAX_BUFFER)));
  } catch {}
}

function log(level: LogLevel, message: string, data?: any) {
  const entry: LogEntry = {
    level,
    message,
    data: data instanceof Error ? { name: data.name, message: data.message, stack: data.stack } : data,
    timestamp: new Date().toISOString(),
    url: typeof window !== "undefined" ? window.location.href : undefined,
    userId: userId ?? undefined,
  };

  const fn = level === "error" || level === "fatal" ? console.error : level === "warn" ? console.warn : console.log;
  fn(`[${level.toUpperCase()}] ${message}`, data ?? "");

  const buffer = getBuffer();
  buffer.push(entry);
  saveBuffer(buffer);

  if ((level === "error" || level === "fatal") && remoteEndpoint) {
    try {
      fetch(remoteEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(entry),
        keepalive: true,
      }).catch(() => {});
    } catch {}
  }
}

export const logger = {
  debug: (msg: string, data?: any) => log("debug", msg, data),
  info: (msg: string, data?: any) => log("info", msg, data),
  warn: (msg: string, data?: any) => log("warn", msg, data),
  error: (msg: string, data?: any) => log("error", msg, data),
  fatal: (msg: string, data?: any) => log("fatal", msg, data),
  getBuffer: () => getBuffer(),
  clearBuffer: () => saveBuffer([]),
};

if (typeof window !== "undefined") {
  window.addEventListener("error", (e) => {
    log("error", `Uncaught error: ${e.message}`, { filename: e.filename, line: e.lineno, col: e.colno });
  });
  window.addEventListener("unhandledrejection", (e) => {
    log("error", `Unhandled rejection: ${e.reason?.message ?? e.reason}`, e.reason);
  });
}
