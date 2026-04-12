/**
 * Background service worker for Tinder Cleanup.
 * Handles match storage, rules engine, and unmatch execution.
 */

import type {
  MatchData,
  PreviewMatch,
  UserConfig,
  FilterRule,
  SessionState,
  UnmatchQueueItem,
  Message,
} from "../types";
import { DEFAULT_CONFIG } from "../types";

// ── State ───────────────────────────────────────────────────────────────────

let contentScriptAliveAt: number | null = null;
const ALIVE_TIMEOUT_MS = 60_000;

let authToken: string | null = null;
let capturedHeaders: Record<string, string> = {};

let session: SessionState = {
  running: false,
  queue: [],
  completedCount: 0,
  startedAt: null,
};

let unmatchTimer: ReturnType<typeof setTimeout> | null = null;

// Serialization lock for storage writes to prevent race conditions
let ingestionQueue: Promise<void> = Promise.resolve();

// ── Storage helpers ─────────────────────────────────────────────────────────

async function getMatches(): Promise<Record<string, MatchData>> {
  const result = await chrome.storage.local.get("matches");
  return result.matches ?? {};
}

async function saveMatches(matches: Record<string, MatchData>) {
  await chrome.storage.local.set({ matches });
}

async function getConfig(): Promise<UserConfig> {
  const result = await chrome.storage.local.get("config");
  return result.config ?? { ...DEFAULT_CONFIG };
}

async function saveConfig(config: UserConfig) {
  await chrome.storage.local.set({ config });
}

// ── Match data ingestion (serialized) ───────────────────────────────────────

function enqueueIngestion(incoming: MatchData[]) {
  ingestionQueue = ingestionQueue.then(() => ingestMatches(incoming));
}

async function ingestMatches(incoming: MatchData[]) {
  const stored = await getMatches();

  for (const m of incoming) {
    const existing = stored[m.matchId];
    if (!existing) {
      stored[m.matchId] = m;
    } else {
      stored[m.matchId] = {
        ...existing,
        matchDate: m.matchDate || existing.matchDate,
        lastMessageTimestamp:
          m.lastMessageTimestamp ?? existing.lastMessageTimestamp,
        lastMessageFromMe:
          m.lastMessageFromMe ?? existing.lastMessageFromMe,
        messageCount: Math.max(m.messageCount, existing.messageCount),
        myMessageCount: Math.max(m.myMessageCount, existing.myMessageCount),
        theirMessageCount: Math.max(
          m.theirMessageCount,
          existing.theirMessageCount
        ),
        personName: m.personName || existing.personName,
        personPhotoUrl: m.personPhotoUrl || existing.personPhotoUrl,
        capturedAt: m.capturedAt,
      };
    }
  }

  await saveMatches(stored);
}

// ── Rules engine ────────────────────────────────────────────────────────────

function getMatchedRules(match: MatchData, rules: FilterRule): string[] {
  const now = Date.now();
  const dayMs = 86_400_000;
  const passed: string[] = [];
  const failed: boolean[] = [];

  if (rules.matchOlderThanDays != null) {
    const ageDays = (now - new Date(match.matchDate).getTime()) / dayMs;
    if (ageDays > rules.matchOlderThanDays) {
      passed.push(`Matched ${Math.floor(ageDays)}d ago (>${rules.matchOlderThanDays}d)`);
    } else {
      failed.push(true);
    }
  }

  if (rules.inactiveDays != null) {
    const lastActivity = match.lastMessageTimestamp
      ? new Date(match.lastMessageTimestamp).getTime()
      : new Date(match.matchDate).getTime();
    const inactiveDays = (now - lastActivity) / dayMs;
    if (inactiveDays > rules.inactiveDays) {
      passed.push(`Inactive ${Math.floor(inactiveDays)}d (>${rules.inactiveDays}d)`);
    } else {
      failed.push(true);
    }
  }

  if (rules.noResponseDays != null) {
    if (match.lastMessageFromMe === true && match.lastMessageTimestamp) {
      const sinceDays =
        (now - new Date(match.lastMessageTimestamp).getTime()) / dayMs;
      if (sinceDays > rules.noResponseDays) {
        passed.push(`No reply ${Math.floor(sinceDays)}d (>${rules.noResponseDays}d)`);
      } else {
        failed.push(true);
      }
    } else if (match.lastMessageFromMe === true) {
      passed.push("No reply (no timestamp)");
    } else {
      failed.push(true);
    }
  }

  if (rules.empty) {
    if (match.messageCount === 0) {
      passed.push("Empty (0 messages)");
    } else {
      failed.push(true);
    }
  }

  if (passed.length === 0 || failed.length > 0) return [];
  return passed;
}

async function evaluateRules(rules: FilterRule): Promise<PreviewMatch[]> {
  const stored = await getMatches();
  const allMatches = Object.values(stored);

  const results: PreviewMatch[] = [];
  for (const m of allMatches) {
    const matchedRules = getMatchedRules(m, rules);
    if (matchedRules.length > 0) {
      results.push({ ...m, matchedRules });
    }
  }

  // Sort by match date descending (newest first)
  results.sort(
    (a, b) => new Date(b.matchDate).getTime() - new Date(a.matchDate).getTime()
  );

  return results;
}

// ── Unmatch executor ────────────────────────────────────────────────────────

async function executeUnmatch(matchId: string): Promise<void> {
  if (!authToken) {
    throw new Error(
      "No auth token captured — browse Tinder to capture a session first"
    );
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Auth-Token": authToken,
  };

  for (const key of [
    "app-session-id", "app-session-time-elapsed",
    "platform", "app-version", "User-Agent",
  ]) {
    const val = capturedHeaders[key] || capturedHeaders[key.toLowerCase()];
    if (val) headers[key] = val;
  }

  const response = await fetch(
    `https://api.gotinder.com/user/matches/${matchId}?locale=en`,
    { method: "DELETE", headers }
  );

  if (!response.ok) {
    throw new Error(
      `Unmatch failed: ${response.status} ${response.statusText}`
    );
  }

  const stored = await getMatches();
  delete stored[matchId];
  await saveMatches(stored);
}

function getRandomDelay(min: number, max: number): number {
  return (min + Math.random() * (max - min)) * 1000;
}

async function processQueue() {
  if (!session.running) return;

  const config = await getConfig();
  const nextIdx = session.queue.findIndex((item) => item.status === "pending");

  if (nextIdx === -1 || session.completedCount >= config.maxUnmatchesPerSession) {
    session.running = false;
    return;
  }

  const item = session.queue[nextIdx];
  item.status = "processing";

  try {
    await executeUnmatch(item.matchId);
    item.status = "done";
    item.completedAt = new Date().toISOString();
    session.completedCount++;
  } catch (e: any) {
    item.status = "failed";
    item.error = e.message ?? String(e);
  }

  // Check if there's anything left to process
  const hasMorePending = session.queue.some((q) => q.status === "pending");
  if (!session.running || !hasMorePending || session.completedCount >= config.maxUnmatchesPerSession) {
    session.running = false;
  } else {
    const delay = getRandomDelay(config.minDelaySeconds, config.maxDelaySeconds);
    unmatchTimer = setTimeout(processQueue, delay);
  }
}

interface MatchInfo {
  matchId: string;
  personName: string;
  personPhotoUrl: string;
}

function startUnmatchSession(matchInfo: MatchInfo[]) {
  session = {
    running: true,
    queue: matchInfo.map((m) => ({
      matchId: m.matchId,
      personName: m.personName || "Unknown",
      personPhotoUrl: m.personPhotoUrl || "",
      status: "pending",
    })),
    completedCount: 0,
    startedAt: new Date().toISOString(),
  };
  processQueue();
}

function stopUnmatchSession() {
  session.running = false;
  if (unmatchTimer) {
    clearTimeout(unmatchTimer);
    unmatchTimer = null;
  }
}

// ── Message handler ─────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener(
  (message: Message, _sender, sendResponse) => {
    handleMessage(message).then(sendResponse);
    return true;
  }
);

async function handleMessage(message: Message): Promise<any> {
  switch (message.type) {
    case "MATCH_DATA":
      enqueueIngestion(message.payload);
      return { ok: true };

    case "AUTH_TOKEN":
      authToken = message.payload.token;
      capturedHeaders = message.payload.headers;
      return { ok: true };

    case "MATCH_DELETED": {
      const stored = await getMatches();
      delete stored[message.payload.matchId];
      await saveMatches(stored);
      return { ok: true };
    }

    case "CLEAR_MATCHES":
      await saveMatches({});
      session = {
        running: false,
        queue: [],
        completedCount: 0,
        startedAt: null,
      };
      if (unmatchTimer) {
        clearTimeout(unmatchTimer);
        unmatchTimer = null;
      }
      return { ok: true };

    case "CONTENT_SCRIPT_ALIVE":
      contentScriptAliveAt = Date.now();
      return { ok: true };

    case "GET_STATUS": {
      const stored = await getMatches();
      return {
        type: "STATUS",
        payload: {
          matchCount: Object.keys(stored).length,
          contentScriptActive:
            contentScriptAliveAt != null &&
            Date.now() - contentScriptAliveAt < ALIVE_TIMEOUT_MS,
          session,
        },
      };
    }

    case "GET_MATCHES": {
      const stored = await getMatches();
      return {
        type: "MATCHES_RESULT",
        payload: Object.values(stored),
      };
    }

    case "PREVIEW_RULES": {
      const results = await evaluateRules(message.payload);
      return { type: "PREVIEW_RESULT", payload: results };
    }

    case "EXECUTE_UNMATCH": {
      if (!authToken) {
        return {
          error: "No auth token — open Tinder and browse your matches first",
        };
      }
      startUnmatchSession(message.payload.matchInfo ?? message.payload.matchIds.map(
        (id: string) => ({ matchId: id, personName: "Unknown", personPhotoUrl: "" })
      ));
      return { ok: true };
    }

    case "STOP_UNMATCH":
      stopUnmatchSession();
      return { ok: true };

    case "GET_CONFIG": {
      const config = await getConfig();
      return { type: "CONFIG_RESULT", payload: config };
    }

    case "SAVE_CONFIG": {
      await saveConfig(message.payload);
      return { ok: true };
    }

    case "GET_SESSION_LOG":
      return { type: "SESSION_LOG_RESULT", payload: session.queue };

    default:
      return { error: "Unknown message type" };
  }
}

// Only open side panel on tinder.com tabs
chrome.action.onClicked.addListener((tab) => {
  if (tab.id && tab.url?.match(/^https:\/\/(www\.)?tinder\.com\//)) {
    chrome.sidePanel.open({ tabId: tab.id });
  }
});
