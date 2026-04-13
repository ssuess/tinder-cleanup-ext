<template>
  <q-layout style="min-width: 320px">
    <q-page-container>
      <q-page padding class="q-gutter-sm page-flex">
        <!-- Header -->
        <div class="row items-center q-mb-sm">
          <div class="text-h6 text-weight-bold" style="color: #fd5068">
            Tinder Cleanup
          </div>
          <q-space />
          <q-btn
            icon="refresh"
            flat
            dense
            round
            size="sm"
            @click="refreshData"
            :loading="refreshing"
          >
            <q-tooltip>Reload Tinder &amp; refresh data</q-tooltip>
          </q-btn>
        </div>

        <!-- Stats bar -->
        <q-card flat bordered class="q-pa-sm">
          <div class="row items-center justify-between text-body2">
            <div>
              <q-icon name="people" class="q-mr-xs" />
              <strong>{{ status.matchCount }}</strong> matches tracked
            </div>
            <div>
              <q-icon name="filter_alt" class="q-mr-xs" />
              <strong>{{ previewMatches.length }}</strong> matching rules
            </div>
          </div>
        </q-card>

        <!-- Rule Builder -->
        <q-card flat bordered>
          <q-card-section class="q-pb-none">
            <div class="text-subtitle2 text-weight-medium">Filter Rules</div>
            <div class="text-caption text-grey-7">All enabled filters combine with AND logic</div>
          </q-card-section>
          <q-card-section class="q-gutter-sm q-pt-sm">
            <!-- Match age -->
            <div class="row items-center no-wrap q-gutter-sm">
              <q-checkbox v-model="matchAgeEnabled" dense size="sm" />
              <span class="text-body2">Match older than</span>
              <q-input
                v-model.number="config.rules.matchOlderThanDays"
                type="number"
                dense
                outlined
                style="width: 70px"
                :disable="!matchAgeEnabled"
                :min="1"
              />
              <span class="text-body2">days</span>
            </div>

            <!-- Inactivity -->
            <div class="row items-center no-wrap q-gutter-sm">
              <q-checkbox v-model="inactiveEnabled" dense size="sm" />
              <span class="text-body2">Inactive for</span>
              <q-input
                v-model.number="config.rules.inactiveDays"
                type="number"
                dense
                outlined
                style="width: 70px"
                :disable="!inactiveEnabled"
                :min="1"
              />
              <span class="text-body2">days</span>
            </div>

            <!-- No response -->
            <div class="row items-center no-wrap q-gutter-sm">
              <q-checkbox v-model="noResponseEnabled" dense size="sm" />
              <span class="text-body2">No reply in</span>
              <q-input
                v-model.number="config.rules.noResponseDays"
                type="number"
                dense
                outlined
                style="width: 70px"
                :disable="!noResponseEnabled"
                :min="1"
              />
              <span class="text-body2">days</span>
            </div>

            <!-- Fewer than X messages -->
            <div class="row items-center no-wrap q-gutter-sm">
              <q-checkbox v-model="fewerThanEnabled" dense size="sm" />
              <span class="text-body2">Fewer than</span>
              <q-input
                v-model.number="config.rules.fewerThanMessages"
                type="number"
                dense
                outlined
                style="width: 70px"
                :disable="!fewerThanEnabled"
                :min="1"
              />
              <span class="text-body2">messages</span>
            </div>

            <!-- Empty -->
            <div class="row items-center no-wrap q-gutter-sm">
              <q-checkbox v-model="config.rules.empty" dense size="sm" />
              <span class="text-body2">Empty — zero messages</span>
            </div>
          </q-card-section>

          <!-- Contradiction warning -->
          <q-card-section v-if="ruleWarning" class="q-pt-none">
            <q-banner dense rounded class="bg-amber-1 text-amber-10 text-caption">
              <template v-slot:avatar>
                <q-icon name="warning" color="amber-8" size="xs" />
              </template>
              {{ ruleWarning }}
            </q-banner>
          </q-card-section>
        </q-card>

        <!-- Settings -->
        <q-expansion-item
          dense
          dense-toggle
          label="Settings"
          icon="settings"
          header-class="text-body2"
        >
          <q-card flat>
            <q-card-section class="q-gutter-sm q-pt-sm">
              <div class="row items-center no-wrap q-gutter-sm">
                <span class="text-body2" style="min-width: 150px">Delay between (sec)</span>
                <q-input
                  v-model.number="config.minDelaySeconds"
                  type="number"
                  dense
                  outlined
                  style="width: 60px"
                  :min="10"
                />
                <span class="text-body2">–</span>
                <q-input
                  v-model.number="config.maxDelaySeconds"
                  type="number"
                  dense
                  outlined
                  style="width: 60px"
                  :min="10"
                />
              </div>
              <div class="row items-center no-wrap q-gutter-sm">
                <span class="text-body2" style="min-width: 150px">Max unmatches/session</span>
                <q-input
                  v-model.number="config.maxUnmatchesPerSession"
                  type="number"
                  dense
                  outlined
                  style="width: 80px"
                  :min="1"
                />
              </div>
              <q-btn
                label="Save Settings"
                color="primary"
                dense
                flat
                size="sm"
                @click="saveConfig"
              />
              <q-banner v-if="delayWarning" dense rounded class="bg-amber-1 text-amber-10 text-caption q-mt-sm">
                <template v-slot:avatar>
                  <q-icon name="warning" color="amber-8" size="xs" />
                </template>
                {{ delayWarning }}
              </q-banner>
            </q-card-section>
          </q-card>
        </q-expansion-item>

        <!-- Action buttons -->
        <div class="row q-gutter-sm">
          <q-btn
            label="Preview"
            icon="visibility"
            color="primary"
            outline
            dense
            class="col"
            @click="preview"
            :loading="previewing"
          />
          <q-btn
            v-if="!session.running"
            :label="selectedIds.size > 0 ? `Execute (${selectedIds.size})` : 'Execute'"
            icon="delete_sweep"
            color="negative"
            dense
            class="col"
            :disable="selectedIds.size === 0"
            @click="execute"
          />
          <q-btn
            v-else
            label="Stop"
            icon="stop"
            color="warning"
            dense
            class="col"
            @click="stop"
          />
        </div>

        <!-- Execute error -->
        <q-banner v-if="executeError" dense rounded class="bg-red-1 text-red-10 text-caption">
          <template v-slot:avatar>
            <q-icon name="error" color="red-8" size="xs" />
          </template>
          {{ executeError }}
        </q-banner>

        <!-- Progress -->
        <q-card v-if="session.running || session.queue.length > 0" flat bordered>
          <q-card-section class="q-pb-none">
            <div class="text-subtitle2">
              Progress
              <q-badge
                :color="session.running ? 'orange' : 'positive'"
                :label="session.running ? 'Running' : 'Done'"
                class="q-ml-sm"
              />
            </div>
          </q-card-section>
          <q-card-section>
            <q-linear-progress
              :value="queueProgress"
              color="negative"
              track-color="grey-3"
              rounded
              class="q-mb-sm"
            />
            <div class="text-caption text-grey-7">
              {{ completedCount }} / {{ session.queue.length }} processed
              <q-tooltip v-if="session.running && timeEstimate" anchor="top middle" self="bottom middle">
                Based on your delay settings of {{ config.minDelaySeconds }}–{{ config.maxDelaySeconds }}s, the remaining {{ session.queue.length - completedCount }} unmatches will take between {{ timeEstimate.min }} and {{ timeEstimate.max }} to finish.
              </q-tooltip>
              <template v-if="session.running && timeEstimate">
                — {{ timeEstimate.min }} – {{ timeEstimate.max }} remaining
              </template>
            </div>
          </q-card-section>
        </q-card>

        <!-- No results after preview (only show if no session log visible) -->
        <q-card v-if="previewRan && previewMatches.length === 0 && !session.running && sessionLog.length === 0" flat bordered>
          <q-card-section>
            <div class="text-body2 text-grey-7 text-center">
              No matches found for the current rules.
              <template v-if="ruleWarning">
                <br />Check the warning above — some rules contradict each other.
              </template>
            </div>
          </q-card-section>
        </q-card>

        <!-- Preview list -->
        <q-card v-if="previewMatches.length > 0 && !session.running" flat bordered>
          <q-card-section class="q-pb-none">
            <div class="row items-center justify-between">
              <div class="text-subtitle2">
                Matches to unmatch ({{ selectedIds.size }} / {{ previewMatches.length }} selected)
              </div>
              <q-btn
                :label="selectedIds.size === previewMatches.length ? 'None' : 'All'"
                dense
                flat
                size="sm"
                color="primary"
                @click="toggleSelectAll"
              />
            </div>
          </q-card-section>
          <q-list separator class="preview-list">
            <q-item v-for="m in previewMatches" :key="m.matchId" class="q-py-sm">
              <q-item-section side>
                <q-checkbox
                  :model-value="selectedIds.has(m.matchId)"
                  @update:model-value="toggleSelect(m.matchId, $event)"
                  dense
                  size="sm"
                />
              </q-item-section>
              <q-item-section avatar>
                <q-avatar
                  size="36px"
                  class="cursor-pointer"
                  @click="openMatch(m.matchId)"
                >
                  <img
                    v-if="m.personPhotoUrl"
                    :src="m.personPhotoUrl"
                    referrerpolicy="no-referrer"
                  />
                  <q-icon v-else name="person" />
                  <q-tooltip>Open conversation</q-tooltip>
                </q-avatar>
              </q-item-section>
              <q-item-section>
                <q-item-label>
                  <span class="match-name">{{ m.personName }}</span>
                  <q-badge
                    :label="m.messageCount + ' msgs'"
                    :color="m.messageCount === 0 ? 'grey-5' : 'blue-grey-4'"
                    class="q-ml-xs"
                    dense
                  />
                </q-item-label>
                <q-item-label caption>
                  Matched {{ formatDate(m.matchDate) }}
                  <template v-if="m.lastMessageTimestamp">
                    · Last msg {{ formatDate(m.lastMessageTimestamp) }}
                  </template>
                </q-item-label>
                <div class="q-mt-xs q-gutter-xs">
                  <q-badge
                    v-for="(rule, i) in m.matchedRules"
                    :key="i"
                    :label="rule"
                    color="deep-orange-4"
                    text-color="white"
                    dense
                    class="text-caption"
                    style="font-size: 10px"
                  />
                </div>
              </q-item-section>
            </q-item>
          </q-list>
        </q-card>

        <!-- Session log -->
        <q-card v-if="sessionLog.length > 0" flat bordered class="session-log-card">
          <q-card-section class="q-pb-none">
            <div class="text-subtitle2">Session Log</div>
          </q-card-section>
          <q-list dense separator class="session-log-list">
            <q-item v-for="entry in sessionLog" :key="entry.matchId">
              <q-item-section avatar>
                <q-icon
                  :name="entry.status === 'done' ? 'check_circle' : entry.status === 'failed' ? 'error' : entry.status === 'processing' ? 'hourglass_top' : 'schedule'"
                  :color="entry.status === 'done' ? 'positive' : entry.status === 'failed' ? 'negative' : 'grey'"
                />
              </q-item-section>
              <q-item-section>
                <q-item-label><span class="match-name">{{ entry.personName }}</span></q-item-label>
                <q-item-label v-if="entry.error" caption class="text-negative">
                  {{ entry.error }}
                </q-item-label>
                <q-item-label v-else-if="entry.completedAt" caption>
                  {{ formatDate(entry.completedAt) }}
                </q-item-label>
              </q-item-section>
            </q-item>
          </q-list>
          <q-card-section v-if="!session.running">
            <q-btn
              label="Refresh & Reload Tinder"
              icon="refresh"
              color="primary"
              outline
              dense
              class="full-width"
              @click="refreshData"
              :loading="refreshing"
            />
          </q-card-section>
        </q-card>
      </q-page>
    </q-page-container>
  </q-layout>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from "vue";
import type {
  PreviewMatch,
  UserConfig,
  SessionState,
  UnmatchQueueItem,
} from "../types";
import { DEFAULT_CONFIG } from "../types";

// ── Reactive state ──────────────────────────────────────────────────────────

const status = ref({
  matchCount: 0,
  contentScriptActive: false,
  session: {
    running: false,
    queue: [] as UnmatchQueueItem[],
    completedCount: 0,
    startedAt: null as string | null,
  } as SessionState,
});

const config = ref<UserConfig>(structuredClone(DEFAULT_CONFIG));
const previewMatches = ref<PreviewMatch[]>([]);
const sessionLog = ref<UnmatchQueueItem[]>([]);
const previewing = ref(false);
const previewRan = ref(false);
const refreshing = ref(false);
const selectedIds = ref(new Set<string>());
const executeError = ref<string | null>(null);

// Checkbox toggles for optional numeric fields
const matchAgeEnabled = ref(false);
const inactiveEnabled = ref(false);
const noResponseEnabled = ref(false);
const fewerThanEnabled = ref(false);

// Sync checkboxes with config
watch(matchAgeEnabled, (v) => {
  if (!v) config.value.rules.matchOlderThanDays = null;
  else if (config.value.rules.matchOlderThanDays == null)
    config.value.rules.matchOlderThanDays = 30;
});
watch(inactiveEnabled, (v) => {
  if (!v) config.value.rules.inactiveDays = null;
  else if (config.value.rules.inactiveDays == null)
    config.value.rules.inactiveDays = 14;
});
watch(noResponseEnabled, (v) => {
  if (!v) config.value.rules.noResponseDays = null;
  else if (config.value.rules.noResponseDays == null)
    config.value.rules.noResponseDays = 7;
});
watch(fewerThanEnabled, (v) => {
  if (!v) config.value.rules.fewerThanMessages = null;
  else if (config.value.rules.fewerThanMessages == null)
    config.value.rules.fewerThanMessages = 5;
});

const ruleWarning = computed(() => {
  const r = config.value.rules;
  if (r.empty && r.noResponseDays != null) {
    return "No reply + Empty conflict: No reply requires you sent a message, but Empty means zero messages total.";
  }
  if (r.empty && r.fewerThanMessages != null) {
    return "Fewer than + Empty conflict: Empty is already a subset of fewer than X messages.";
  }
  return null;
});

const timeEstimate = computed(() => {
  const remaining = session.value.queue.length - completedCount.value;
  if (remaining <= 0) return null;
  // Each unmatch takes: browse delay (2-6s) + inter-unmatch delay (min-max)
  const browseAvg = 4;
  const minPerItem = config.value.minDelaySeconds + browseAvg;
  const maxPerItem = config.value.maxDelaySeconds + browseAvg;
  const minTotal = remaining * minPerItem;
  const maxTotal = remaining * maxPerItem;
  return { min: formatDuration(minTotal), max: formatDuration(maxTotal) };
});

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  if (mins < 60) return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const remainMins = mins % 60;
  return remainMins > 0 ? `${hrs}h ${remainMins}m` : `${hrs}h`;
}

const delayWarning = computed(() => {
  const { minDelaySeconds, maxDelaySeconds } = config.value;
  if (minDelaySeconds < 30 || maxDelaySeconds < 30) {
    return "Delays under 30 seconds may trigger Tinder's rate limiting and get your account blocked.";
  }
  return null;
});

const session = computed(() => status.value.session);

const completedCount = computed(
  () => session.value.queue.filter((q) => q.status === "done" || q.status === "failed").length
);

const queueProgress = computed(() => {
  if (session.value.queue.length === 0) return 0;
  return completedCount.value / session.value.queue.length;
});

// ── Chrome messaging helpers ────────────────────────────────────────────────

function send(message: any): Promise<any> {
  return chrome.runtime.sendMessage(message);
}

async function refreshStatus() {
  const res = await send({ type: "GET_STATUS" });
  if (res?.payload) {
    status.value.matchCount = res.payload.matchCount;
    status.value.contentScriptActive = res.payload.contentScriptActive;
    status.value.session = res.payload.session;
  }
  const logRes = await send({ type: "GET_SESSION_LOG" });
  if (logRes?.payload) {
    sessionLog.value = logRes.payload;
  }
}

async function loadConfig() {
  const res = await send({ type: "GET_CONFIG" });
  if (res?.payload) {
    config.value = res.payload;
    matchAgeEnabled.value = config.value.rules.matchOlderThanDays != null;
    inactiveEnabled.value = config.value.rules.inactiveDays != null;
    noResponseEnabled.value = config.value.rules.noResponseDays != null;
    fewerThanEnabled.value = config.value.rules.fewerThanMessages != null;
  }
}

async function saveConfig() {
  await send({ type: "SAVE_CONFIG", payload: config.value });
}

async function preview() {
  previewing.value = true;
  previewRan.value = false;
  executeError.value = null;
  selectedIds.value = new Set();
  await saveConfig();
  const res = await send({ type: "PREVIEW_RULES", payload: config.value.rules });
  if (res?.payload) {
    previewMatches.value = res.payload;
    // Auto-select all on fresh preview
    selectedIds.value = new Set(res.payload.map((m: PreviewMatch) => m.matchId));
  }
  previewRan.value = true;
  previewing.value = false;
}

function toggleSelect(matchId: string, checked: boolean) {
  const next = new Set(selectedIds.value);
  if (checked) next.add(matchId);
  else next.delete(matchId);
  selectedIds.value = next;
}

function toggleSelectAll() {
  if (selectedIds.value.size === previewMatches.value.length) {
    selectedIds.value = new Set();
  } else {
    selectedIds.value = new Set(previewMatches.value.map((m) => m.matchId));
  }
}

async function execute() {
  const ids = [...selectedIds.value];
  if (ids.length === 0) return;
  // Send match info so background doesn't depend on storage lookup for names
  const matchInfo = previewMatches.value
    .filter((m) => selectedIds.value.has(m.matchId))
    .map((m) => ({ matchId: m.matchId, personName: m.personName, personPhotoUrl: m.personPhotoUrl }));
  const res = await send({ type: "EXECUTE_UNMATCH", payload: { matchIds: ids, matchInfo } });
  if (res?.error) {
    executeError.value = res.error;
    return;
  }
  executeError.value = null;
  previewMatches.value = [];
  selectedIds.value = new Set();
  await refreshStatus();
}

async function stop() {
  await send({ type: "STOP_UNMATCH" });
  await refreshStatus();
}

async function refreshData() {
  refreshing.value = true;
  previewMatches.value = [];
  previewRan.value = false;
  selectedIds.value = new Set();
  // Reload the Tinder tab — content script will clear storage and re-capture
  const tabs = await chrome.tabs.query({ url: "https://tinder.com/*" });
  for (const tab of tabs) {
    if (tab.id) await chrome.tabs.reload(tab.id);
  }
  // Wait a moment for data to start flowing in
  await new Promise((r) => setTimeout(r, 2000));
  await refreshStatus();
  refreshing.value = false;
}

async function openMatch(matchId: string) {
  const url = `https://tinder.com/app/messages/${matchId}`;
  const tabs = await chrome.tabs.query({ url: "https://tinder.com/*" });
  if (tabs.length > 0 && tabs[0].id) {
    await chrome.tabs.update(tabs[0].id, { url, active: true });
  } else {
    await chrome.tabs.create({ url });
  }
}

function formatDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / 86_400_000);
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "yesterday";
  if (diffDays < 30) return `${diffDays}d ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`;
  return `${Math.floor(diffDays / 365)}y ago`;
}

// ── Lifecycle ───────────────────────────────────────────────────────────────

let pollTimer: ReturnType<typeof setInterval>;

onMounted(async () => {
  await loadConfig();
  await refreshStatus();
  pollTimer = setInterval(refreshStatus, 3000);
});

onUnmounted(() => {
  clearInterval(pollTimer);
});
</script>

<style>
html, body {
  margin: 0;
  height: 100%;
  min-width: 320px;
}

.page-flex {
  display: flex;
  flex-direction: column;
}

.preview-list {
  max-height: calc(100vh - 500px);
  min-height: 100px;
  overflow-y: auto;
}

.session-log-card {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.session-log-list {
  flex: 1;
  min-height: 60px;
  overflow-y: auto;
}

.cursor-pointer {
  cursor: pointer;
}
</style>
