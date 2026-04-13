/**
 * Content script — runs in isolated world on tinder.com.
 * Injects the page-level script and relays intercepted data to the background worker.
 */

import type { InjectedMessage, ContentCommand } from "../types";

// Check if the extension context is still valid
function isContextValid(): boolean {
  try {
    return !!chrome.runtime?.id;
  } catch {
    return false;
  }
}

// Wrap all sendMessage calls to silently handle "Extension context invalidated"
function safeSend(message: any) {
  if (!isContextValid()) return;
  try {
    chrome.runtime.sendMessage(message).catch(() => {});
  } catch {
    // Extension was reloaded or uninstalled — ignore
  }
}

// Inject the page-level fetch interceptor
function injectScript() {
  try {
    const script = document.createElement("script");
    script.src = chrome.runtime.getURL("injected.js");
    script.type = "module";
    (document.head || document.documentElement).appendChild(script);
    script.onload = () => script.remove();
  } catch {
    // Context invalidated
  }
}

injectScript();

// ── Proxy command bridging (background -> content -> injected -> content -> background) ──

const pendingProxyRequests = new Map<string, { callback: (response: any) => void; createdAt: number }>();

// Cleanup stale entries every 30 seconds
setInterval(() => {
  const now = Date.now();
  for (const [id, entry] of pendingProxyRequests) {
    if (now - entry.createdAt > 30_000) {
      pendingProxyRequests.delete(id);
    }
  }
}, 30_000);

// Listen for proxy commands from the background
chrome.runtime.onMessage.addListener(
  (message, _sender, sendResponse) => {
    if (message.type === "PROXY_BROWSE" || message.type === "PROXY_UNMATCH") {
      const { requestId, matchId } = message.payload;

      pendingProxyRequests.set(requestId, { callback: sendResponse, createdAt: Date.now() });

      // Forward to injected script
      window.postMessage(
        {
          source: "tinder-cleanup-content",
          command: { type: message.type, requestId, matchId },
        } satisfies ContentCommand,
        "*"
      );

      // Keep sendResponse channel open for async reply
      return true;
    }
    return false;
  }
);

// Listen for messages from the injected script
window.addEventListener("message", (event) => {
  if (event.source !== window) return;
  if (!isContextValid()) return;

  const data = event.data;
  if (data?.source !== "tinder-cleanup-injected") return;

  // Handle proxy results from the injected script
  if (data.type === "PROXY_RESULT") {
    const { result } = data;
    const pending = pendingProxyRequests.get(result.requestId);
    if (pending) {
      pendingProxyRequests.delete(result.requestId);
      pending.callback(result);
    }
    return;
  }

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
