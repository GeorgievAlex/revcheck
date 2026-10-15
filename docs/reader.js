// Talks to the RevCheck Reader extension (extension/content.js) through
// window.postMessage. mobile.bg and cars.bg refuse cloud servers, so the
// listings are read from the visitor's own browser.

const PENDING = new Map();
let nextId = 1;
let ready = false;
const readyWaiters = [];

window.addEventListener("message", (event) => {
  if (event.source !== window || event.origin !== location.origin) return;
  const msg = event.data;
  if (!msg || msg.source !== "revcheck-reader") return;
  if (msg.type === "ready") {
    ready = true;
    readyWaiters.splice(0).forEach((resolve) => resolve(true));
  } else if (msg.type === "result" && PENDING.has(msg.id)) {
    const { resolve, reject } = PENDING.get(msg.id);
    PENDING.delete(msg.id);
    msg.ok ? resolve(msg.html) : reject(new Error(msg.error || "read failed"));
  }
});

// True once the extension has answered; false after timeoutMs without it.
export function readerReady(timeoutMs = 1500) {
  if (ready) return Promise.resolve(true);
  window.postMessage({ source: "revcheck-page", type: "ping" }, location.origin);
  return new Promise((resolve) => {
    readyWaiters.push(resolve);
    setTimeout(() => resolve(ready), timeoutMs);
  });
}

export function readPage(url, timeoutMs = 25000) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    PENDING.set(id, { resolve, reject });
    window.postMessage({ source: "revcheck-page", type: "fetch", id, url }, location.origin);
    setTimeout(() => {
      if (PENDING.delete(id)) reject(new Error("timed out"));
    }, timeoutMs);
  });
}
