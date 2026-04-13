/** Raw match data extracted from Tinder API responses */
export interface MatchData {
  matchId: string;
  matchDate: string; // ISO timestamp
  lastMessageTimestamp: string | null;
  lastMessageFromMe: boolean | null;
  messageCount: number;
  myMessageCount: number;
  theirMessageCount: number;
  personName: string;
  personPhotoUrl: string;
  /** When we last captured/updated this record */
  capturedAt: string;
}

/** User-configurable filter rule */
export interface FilterRule {
  /** Match is older than X days */
  matchOlderThanDays: number | null;
  /** No messages exchanged in last X days */
  inactiveDays: number | null;
  /** I sent last message more than X days ago (no response) */
  noResponseDays: number | null;
  /** Zero messages exchanged */
  empty: boolean;
}

/** User-configurable settings */
export interface UserConfig {
  rules: FilterRule;
  minDelaySeconds: number; // default 30
  maxDelaySeconds: number; // default 90
  maxUnmatchesPerSession: number; // default 12
}

/** A match annotated with which rules it triggered */
export interface PreviewMatch extends MatchData {
  /** Human-readable labels for each rule that matched */
  matchedRules: string[];
}

/** Unmatch queue item */
export interface UnmatchQueueItem {
  matchId: string;
  personName: string;
  personPhotoUrl: string;
  status: "pending" | "processing" | "done" | "failed";
  error?: string;
  completedAt?: string;
}

/** Session state */
export interface SessionState {
  running: boolean;
  queue: UnmatchQueueItem[];
  completedCount: number;
  startedAt: string | null;
}

/** Proxy command sent from background -> content -> injected */
export type ProxyCommand =
  | { type: "PROXY_BROWSE"; requestId: string; matchId: string }
  | { type: "PROXY_UNMATCH"; requestId: string; matchId: string };

/** Result of a proxied API call, sent from injected -> content -> background */
export interface ProxyResult {
  requestId: string;
  ok: boolean;
  status?: number;
  error?: string;
}

/** Message posted from content script to injected script via window.postMessage */
export interface ContentCommand {
  source: "tinder-cleanup-content";
  command: ProxyCommand;
}

/** Messages between content script, background, and popup */
export type Message =
  | { type: "MATCH_DATA"; payload: MatchData[] }
  | { type: "CONTENT_SCRIPT_ALIVE"; payload: { tabId?: number } }
  | {
      type: "AUTH_TOKEN";
      payload: { token: string; headers: Record<string, string> };
    }
  | { type: "MATCH_DELETED"; payload: { matchId: string } }
  | { type: "CLEAR_MATCHES"; payload?: undefined }
  | { type: "GET_STATUS"; payload?: undefined }
  | {
      type: "STATUS";
      payload: {
        matchCount: number;
        contentScriptActive: boolean;
        session: SessionState;
      };
    }
  | { type: "GET_MATCHES"; payload?: undefined }
  | { type: "MATCHES_RESULT"; payload: MatchData[] }
  | { type: "PREVIEW_RULES"; payload: FilterRule }
  | { type: "PREVIEW_RESULT"; payload: PreviewMatch[] }
  | { type: "EXECUTE_UNMATCH"; payload: { matchIds: string[]; matchInfo?: { matchId: string; personName: string; personPhotoUrl: string }[] } }
  | { type: "STOP_UNMATCH"; payload?: undefined }
  | { type: "GET_CONFIG"; payload?: undefined }
  | { type: "CONFIG_RESULT"; payload: UserConfig }
  | { type: "SAVE_CONFIG"; payload: UserConfig }
  | { type: "GET_SESSION_LOG"; payload?: undefined }
  | { type: "SESSION_LOG_RESULT"; payload: UnmatchQueueItem[] }
  | { type: "PROXY_BROWSE"; payload: { requestId: string; matchId: string } }
  | { type: "PROXY_UNMATCH"; payload: { requestId: string; matchId: string } };

/** Message posted from injected script to content script via window.postMessage */
export interface InjectedMessage {
  source: "tinder-cleanup-injected";
  matches: MatchData[];
}

export const DEFAULT_CONFIG: UserConfig = {
  rules: {
    matchOlderThanDays: null,
    inactiveDays: null,
    noResponseDays: null,
    empty: false,
  },
  minDelaySeconds: 30,
  maxDelaySeconds: 90,
  maxUnmatchesPerSession: 12,
};
