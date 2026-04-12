/**
 * Injected into the page context (not content script isolated world)
 * to monkey-patch window.fetch and intercept Tinder API responses.
 * Also captures auth headers from outgoing requests for replay.
 */

import type { MatchData, InjectedMessage } from "../types";

const TINDER_API = "https://api.gotinder.com";

const originalFetch = window.fetch;

window.fetch = async function (...args: Parameters<typeof fetch>) {
  const request = args[0];
  const init = args[1];
  const url = typeof request === "string" ? request : (request as Request).url;

  const method = init?.method ?? (request instanceof Request ? request.method : "GET");

  try {
    if (url.startsWith(TINDER_API)) {
      captureAuthHeaders(request, init);
    }
  } catch {
    // Never break the page
  }

  const response = await originalFetch.apply(this, args);

  try {
    if (url.startsWith(TINDER_API)) {
      handleTinderResponse(url, response.clone());

      // Detect manual unmatches via Tinder's UI and sync storage
      if (method === "DELETE" && response.ok) {
        const unmatchMatch = url.match(/\/user\/matches\/([^?/]+)/);
        if (unmatchMatch) {
          window.postMessage({
            source: "tinder-cleanup-injected",
            type: "MATCH_DELETED",
            matchId: unmatchMatch[1],
          }, "*");
        }
      }
    }
  } catch {
    // Never break the page
  }

  return response;
};

function captureAuthHeaders(input: RequestInfo | URL, init?: RequestInit) {
  const headers: Record<string, string> = {};

  if (init?.headers) {
    if (init.headers instanceof Headers) {
      init.headers.forEach((v, k) => (headers[k] = v));
    } else if (Array.isArray(init.headers)) {
      for (const [k, v] of init.headers) headers[k] = v;
    } else {
      Object.assign(headers, init.headers);
    }
  }

  if (input instanceof Request) {
    input.headers.forEach((v, k) => {
      if (!headers[k]) headers[k] = v;
    });
  }

  const token =
    headers["X-Auth-Token"] ||
    headers["x-auth-token"] ||
    headers["X-AUTH-TOKEN"];

  if (token) {
    window.postMessage(
      { source: "tinder-cleanup-injected", type: "AUTH_TOKEN", token, headers },
      "*"
    );
  }
}

async function handleTinderResponse(url: string, response: Response) {
  // Match list endpoint: GET /v2/matches
  if (/\/v2\/matches(\?|$)/.test(url) && response.ok) {
    const json = await response.json();
    const matches = parseMatchList(json);
    if (matches.length > 0) postMatches(matches);
  }

  // Individual match messages: GET /v2/matches/{id}/messages
  const msgMatch = url.match(/\/v2\/matches\/([^/]+)\/messages/);
  if (msgMatch && response.ok) {
    const json = await response.json();
    const matchId = msgMatch[1];
    const data = parseMessages(matchId, json);
    if (data) postMatches([data]);
  }
}

function parseMatchList(json: any): MatchData[] {
  const matches: MatchData[] = [];
  const list = json?.data?.matches ?? json?.matches ?? [];

  for (const m of list) {
    try {
      const lastMsg = m.messages?.[0];
      const myId = getMyId(m);

      // Tinder's message_count is often wrong (0 when messages exist).
      // The match list only includes the most recent message(s), not all,
      // so counts are approximate until the full conversation is loaded.
      const apiMsgCount = m.message_count ?? m.messageCount ?? 0;
      const myMsgCount = countMessages(m.messages, myId, true);
      const theirMsgCount = countMessages(m.messages, myId, false);
      const arrayMsgCount = m.messages?.length ?? 0;
      const totalMsgCount = Math.max(apiMsgCount, arrayMsgCount, myMsgCount + theirMsgCount);

      matches.push({
        matchId: m._id ?? m.id,
        matchDate: m.created_date ?? m.createdDate ?? new Date().toISOString(),
        lastMessageTimestamp:
          lastMsg?.sent_date ?? lastMsg?.sentDate ??
          m.last_activity_date ?? m.lastActivityDate ?? null,
        lastMessageFromMe: lastMsg ? lastMsg.from === myId : null,
        messageCount: totalMsgCount,
        myMessageCount: myMsgCount,
        theirMessageCount: theirMsgCount,
        personName: m.person?.name ?? "Unknown",
        personPhotoUrl:
          m.person?.photos?.[0]?.url ??
          m.person?.photos?.[0]?.processedFiles?.[0]?.url ??
          "",
        capturedAt: new Date().toISOString(),
      });
    } catch {
      // Skip malformed entries
    }
  }

  return matches;
}

function parseMessages(matchId: string, json: any): MatchData | null {
  const messages = json?.data?.messages ?? json?.messages ?? [];
  if (!messages.length) return null;

  const sorted = [...messages].sort(
    (a: any, b: any) =>
      new Date(b.sent_date ?? b.sentDate).getTime() -
      new Date(a.sent_date ?? a.sentDate).getTime()
  );

  const lastMsg = sorted[0];

  return {
    matchId,
    matchDate: "",
    lastMessageTimestamp: lastMsg?.sent_date ?? lastMsg?.sentDate ?? null,
    lastMessageFromMe: null,
    messageCount: messages.length,
    myMessageCount: 0,
    theirMessageCount: 0,
    personName: "",
    personPhotoUrl: "",
    capturedAt: new Date().toISOString(),
  };
}

function getMyId(match: any): string | null {
  const personId = match.person?._id ?? match.person?.user_id;
  const matchId: string = match._id ?? match.id ?? "";
  if (personId && matchId.includes(personId)) {
    return matchId.replace(personId, "");
  }
  return null;
}

function countMessages(
  messages: any[] | undefined,
  myId: string | null,
  fromMe: boolean
): number {
  if (!messages || !myId) return 0;
  return messages.filter((m: any) =>
    fromMe ? m.from === myId : m.from !== myId
  ).length;
}

function postMatches(matches: MatchData[]) {
  const msg: InjectedMessage = {
    source: "tinder-cleanup-injected",
    matches,
  };
  window.postMessage(msg, "*");
}

window.postMessage(
  { source: "tinder-cleanup-injected", type: "ALIVE" },
  "*"
);
