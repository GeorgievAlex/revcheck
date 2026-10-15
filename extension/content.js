// Bridge between the RevCheck page and the background worker. The page asks
// with window.postMessage; only messages from this same page are relayed.
const VERSION = chrome.runtime.getManifest().version;

function answer(data) {
  window.postMessage({ source: "revcheck-reader", version: VERSION, ...data }, location.origin);
}

window.addEventListener("message", (event) => {
  if (event.source !== window || event.origin !== location.origin) return;
  const msg = event.data;
  if (!msg || msg.source !== "revcheck-page") return;
  if (msg.type === "ping") return answer({ type: "ready" });
  if (msg.type === "fetch") {
    chrome.runtime.sendMessage({ type: "fetch", url: msg.url }, (res) => {
      const failed = chrome.runtime.lastError || !res;
      answer({ type: "result", id: msg.id, ok: !failed && res.ok, html: res && res.html, error: failed ? "The extension didn't respond." : res.error });
    });
  }
});

answer({ type: "ready" });
