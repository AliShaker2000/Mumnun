// Offline queue: stores requests/messages when network is down and replays them on reconnect.

type QueuedAction = {
  id: string;
  type: "message" | "request" | "location" | "generic";
  payload: any;
  createdAt: number;
  retries: number;
  maxRetries: number;
};

const QUEUE_KEY = "mumnun_offline_queue";
const MAX_RETRIES = 5;
const BASE_DELAY = 2000;

function loadQueue(): QueuedAction[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveQueue(queue: QueuedAction[]) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue.slice(0, 100)));
  } catch {}
}

export function enqueueAction(type: QueuedAction["type"], payload: any, maxRetries = MAX_RETRIES) {
  const queue = loadQueue();
  const action: QueuedAction = {
    id: Math.random().toString(36).slice(2) + Date.now().toString(36),
    type,
    payload,
    createdAt: Date.now(),
    retries: 0,
    maxRetries,
  };
  queue.push(action);
  saveQueue(queue);
}

export function getQueuedActions(): QueuedAction[] {
  return loadQueue();
}

export function removeAction(id: string) {
  const queue = loadQueue().filter((a) => a.id !== id);
  saveQueue(queue);
}

export function incrementRetry(id: string): boolean {
  const queue = loadQueue();
  const action = queue.find((a) => a.id === id);
  if (!action) return true;
  action.retries++;
  if (action.retries >= action.maxRetries) {
    saveQueue(queue.filter((a) => a.id !== id));
    return true;
  }
  saveQueue(queue);
  return false;
}

export function getRetryDelay(retries: number): number {
  return Math.min(BASE_DELAY * Math.pow(2, retries), 30000);
}

let processing = false;
const processors: ((action: QueuedAction) => Promise<boolean>)[] = [];

export function registerProcessor(fn: (action: QueuedAction) => Promise<boolean>) {
  processors.push(fn);
}

export async function processQueue() {
  if (processing || typeof navigator === "undefined" || !navigator.onLine) return;
  processing = true;
  try {
    const queue = loadQueue();
    for (const action of queue) {
      let success = false;
      for (const processor of processors) {
        try {
          success = await processor(action);
          if (success) break;
        } catch {
          continue;
        }
      }
      if (success) {
        removeAction(action.id);
      } else {
        incrementRetry(action.id);
        const delay = getRetryDelay(action.retries);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  } finally {
    processing = false;
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    setTimeout(processQueue, 1000);
  });
}
