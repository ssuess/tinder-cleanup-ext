/**
 * Content script — runs in isolated world on tinder.com.
 * Injects the page-level script and relays intercepted data to the background worker.
 */

import type { InjectedMessage } from "../types";

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
    chrome.runtime.sendMessage({ type: "CONTENT_SCRIPT_ALIVE" });
    return;
  }

  if (data.type === "MATCH_DELETED") {
    chrome.runtime.sendMessage({
      type: "MATCH_DELETED",
      payload: { matchId: data.matchId },
    });
    return;
  }

  if (data.type === "AUTH_TOKEN") {
    chrome.runtime.sendMessage({
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
    chrome.runtime.sendMessage({
      type: "MATCH_DATA",
      payload: msg.matches,
    });
  }
});

// Clear stale match data on page load — Tinder will re-fetch everything
chrome.runtime.sendMessage({ type: "CLEAR_MATCHES" });

// Periodically ping background to signal we're alive
setInterval(() => {
  chrome.runtime.sendMessage({ type: "CONTENT_SCRIPT_ALIVE" });
}, 30_000);

chrome.runtime.sendMessage({ type: "CONTENT_SCRIPT_ALIVE" });
