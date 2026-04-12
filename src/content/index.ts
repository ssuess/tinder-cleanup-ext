/**
 * Content script — runs in isolated world on tinder.com.
 * Injects the page-level script and relays intercepted data to the background worker.
 */

import type { InjectedMessage } from "../types";

// Wrap all sendMessage calls to silently handle "Extension context invalidated"
function safeSend(message: any) {
  try {
    chrome.runtime.sendMessage(message).catch(() => {});
  } catch {
    // Extension was reloaded or uninstalled — ignore
  }
}

// Inject the page-level fetch interceptor
function injectScript() {
  const script = document.createElement("script");
  script.src = chrome.runtime.getURL("injected.js");
  script.type = "module";
  (document.head || document.documentElement).appendChild(script);
  script.onload = () => script.remove();
}

injectScript();

// Listen for messages from the injected script
window.addEventListener("message", (event) => {
  if (event.source !== window) return;
  const data = event.data;

  if (data?.source !== "tinder-cleanup-injected") return;

  if (data.type === "ALIVE") {
    safeSend({ type: "CONTENT_SCRIPT_ALIVE" });
    return;
  }

  if (data.type === "MATCH_DELETED") {
    safeSend({
      type: "MATCH_DELETED",
      payload: { matchId: data.matchId },
    });
    return;
  }

  if (data.type === "AUTH_TOKEN") {
    safeSend({
      type: "AUTH_TOKEN",
      payload: {
        token: data.token,
        headers: data.headers,
      },
    });
    return;
  }

  // Match data received
  const msg = data as InjectedMessage;
  if (msg.matches?.length) {
    safeSend({
      type: "MATCH_DATA",
      payload: msg.matches,
    });
  }
});

// Clear stale match data on page load — Tinder will re-fetch everything
safeSend({ type: "CLEAR_MATCHES" });

// Periodically ping background to signal we're alive
setInterval(() => {
  safeSend({ type: "CONTENT_SCRIPT_ALIVE" });
}, 30_000);

safeSend({ type: "CONTENT_SCRIPT_ALIVE" });
