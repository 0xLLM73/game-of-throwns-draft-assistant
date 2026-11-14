"use strict";
if (typeof importScripts === "function") importScripts("lib/weekly.js", "lib/weekly-source.js", "lib/weekly-calendar.js", "lib/weekly-weather.js");

let weeklyAutoInFlight = null;
async function downloadWeeklyCalendar(season, now = Date.now()) {
  // ESPN groups "dates=YYYY" by calendar year, so the season's January games live in the next year's response.
  // (ESPN stopped accepting date-range queries in Nov 2026.)
  const urls = [season, season + 1].map(year => `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${year}&seasontype=2&limit=1000`);
  const [metadata, january] = await Promise.all(urls.map(async endpoint => {
    const response = await fetch(endpoint, { credentials: "omit", cache: "no-store", signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw Error(`ESPN schedule HTTP ${response.status}`);
    return response.json();
  }));
  const events = new Map([...(metadata.events || []), ...(january.events || [])].map(e => [e.id, e]));
  const cached = { calendar: globalThis.WeeklyVegasCalendar.build({ ...metadata, events: [...events.values()] }, season), fetchedAt: now };
  await chrome.storage.local.set({ weeklyVegasCalendar: cached });
  return cached;
}
async function automaticWeekly() {
  if (weeklyAutoInFlight) return weeklyAutoInFlight;
  weeklyAutoInFlight = (async () => {
    const now = Date.now();
    const C = globalThis.WeeklyVegasCalendar;
    const season = C.seasonAt(now);
    const saved = await chrome.storage.local.get(["weeklyVegasCalendar", "weeklyVegasAutoAttempts"]);
    let cached = saved.weeklyVegasCalendar;
    let scheduleWarning = "";
    if (cached?.calendar?.season !== season || !cached?.calendar?.teamTotals || now - cached.fetchedAt >= 6 * 3600000) {
      try {
        cached = await downloadWeeklyCalendar(season, now);
      } catch (error) {
        if (cached?.calendar?.season !== season) throw Error(`Cannot determine the week: ${error.message}. You can choose a week manually.`);
        scheduleWarning = "Using cached ESPN schedule; kickoff changes could not be checked.";
      }
    }
    const selected = C.select(cached.calendar, now);
    if (selected.ended) return { ok: true, ...selected, warning: "Regular season complete; automatic refresh paused." };
    const key = `${season}:${selected.week}`;
    const attempts = saved.weeklyVegasAutoAttempts || {};
    const last = attempts[key];
    let projectionWarning = last?.error || "";
    const projectionData = (await chrome.storage.local.get("weeklyVegasDatasets")).weeklyVegasDatasets?.[key];
    const needsTeamTotals = projectionData?.players?.some(p => p.team && !Object.hasOwn(p, "impliedTeamTotal")) && Object.keys(cached.calendar.teamTotals || {}).length > 0;
    if (!last || now >= last.nextAt || needsTeamTotals) {
      // Persist the retry window before fetching, so reloads and other tabs don't hammer the provider.
      attempts[key] = { nextAt: now + 15 * 60000, error: "" };
      await chrome.storage.local.set({ weeklyVegasAutoAttempts: attempts });
      try {
        await refreshWeekly({ season, week: selected.week });
        attempts[key] = { nextAt: Date.now() + 3600000, error: "" };
        projectionWarning = "";
      } catch (error) {
        projectionWarning = `Week ${selected.week} refresh unavailable: ${error.message} Automatic retry in 15 minutes.`;
        attempts[key].error = projectionWarning;
      }
      await chrome.storage.local.set({ weeklyVegasAutoAttempts: attempts });
    }
    await refreshWeather(cached.calendar, selected.week).catch(() => {});
    return { ok: true, ...selected, warning: [scheduleWarning, projectionWarning].filter(Boolean).join(" ") };
  })();
  try { return await weeklyAutoInFlight; } finally { weeklyAutoInFlight = null; }
}

// Forecasts change slowly; refetch at most every 3 hours unless the user forces a refresh.
async function refreshWeather(calendar, week, force = false) {
  const key = `${calendar.season}:${week}`;
  const stored = (await chrome.storage.local.get("weeklyVegasWeather")).weeklyVegasWeather || {};
  if (!force && stored[key] && Date.now() - stored[key].fetchedAt < 3 * 3600000) return stored[key];
  const byTeam = await globalThis.WeeklyVegasWeather.fetchForWeek(globalThis.WeeklyVegasCalendar.gamesForWeek(calendar, week));
  // Keep only recent weeks so storage doesn't grow all season.
  const next = Object.fromEntries(Object.entries(stored).filter(([k]) => k.startsWith(`${calendar.season}:`) && Math.abs(Number(k.split(":")[1]) - week) <= 1));
  next[key] = { fetchedAt: Date.now(), byTeam };
  await chrome.storage.local.set({ weeklyVegasWeather: next });
  return next[key];
}

// Inactives are announced ~90 minutes before kickoff. Remind the user about starters in each kickoff window.
const INACTIVE_PREFIX = "got-inactives:";
async function scheduleInactiveAlerts(message) {
  const settings = await chrome.storage.local.get("weeklyVegasAlerts");
  const enabled = settings.weeklyVegasAlerts !== false;
  const existing = (await chrome.alarms.getAll()).filter(a => a.name.startsWith(INACTIVE_PREFIX));
  await Promise.all(existing.map(a => chrome.alarms.clear(a.name)));
  const starters = (message.starters || []).filter(s => s && s.name && Number.isFinite(Date.parse(s.kickoff)));
  await chrome.storage.local.set({ weeklyVegasAlertRoster: { teamUrl: String(message.teamUrl || ""), starters } });
  if (!enabled) return { ok: true, scheduled: 0 };
  const kickoffs = [...new Set(starters.map(s => Date.parse(s.kickoff)))].filter(t => t - 85 * 60000 > Date.now());
  for (const kickoff of kickoffs) await chrome.alarms.create(`${INACTIVE_PREFIX}${kickoff}`, { when: kickoff - 85 * 60000 });
  return { ok: true, scheduled: kickoffs.length };
}
async function fireInactiveAlert(name) {
  const kickoff = Number(name.slice(INACTIVE_PREFIX.length));
  const { weeklyVegasAlertRoster: roster } = await chrome.storage.local.get("weeklyVegasAlertRoster");
  const players = (roster?.starters || []).filter(s => Date.parse(s.kickoff) === kickoff);
  if (!players.length) return;
  const time = new Date(kickoff).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  await notify(`inactives:${kickoff}`, `Inactives are out for ${time} games`, `Check ${players.map(p => p.name).join(", ")} before kickoff.`, roster.teamUrl);
}
async function notify(id, title, message, url) {
  const { weeklyVegasNotified: sent = {} } = await chrome.storage.local.get("weeklyVegasNotified");
  if (sent[id]) return { ok: true, duplicate: true };
  sent[id] = Date.now();
  for (const [key, at] of Object.entries(sent)) if (Date.now() - at > 14 * 86400000) delete sent[key];
  await chrome.storage.local.set({ weeklyVegasNotified: sent, [`weeklyVegasNotifyUrl:${id}`]: url || "" });
  await chrome.notifications.create(id, { type: "basic", iconUrl: "icons/icon128.png", title, message, priority: 2 });
  return { ok: true };
}
chrome.notifications?.onClicked.addListener(async (id) => {
  const key = `weeklyVegasNotifyUrl:${id}`;
  const url = (await chrome.storage.local.get(key))[key];
  if (/^https:\/\/fantasy\.espn\.com\//.test(url || "")) await chrome.tabs.create({ url });
  chrome.notifications.clear(id);
});

let weeklyRefreshInFlight = false;
async function refreshWeekly(message) {
  const season = Number(message.season), week = Number(message.week);
  if (!Number.isInteger(season) || season < 2026 || season > 2100 || !Number.isInteger(week) || week < 1 || week > 18) throw Error("Choose a valid season and week first.");
  if (weeklyRefreshInFlight) throw Error("A weekly refresh is already running. Please wait.");
  weeklyRefreshInFlight = true;
  try {
    let schedule = (await chrome.storage.local.get("weeklyVegasCalendar")).weeklyVegasCalendar;
    if (schedule?.calendar?.season !== season || !schedule?.calendar?.teamTotals || Date.now() - schedule.fetchedAt >= 6 * 3600000) {
      try { schedule = await downloadWeeklyCalendar(season); } catch { /* Player projections remain useful; team totals will be labeled unavailable. */ }
    }
    const response = await fetch(`https://www.parlaysavant.com/fantasy/vegas-rankings/week-${week}/all/half-ppr?season=${season}`, { credentials: "omit", cache: "no-store", signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw Error(`Weekly source returned HTTP ${response.status}. Saved data was kept.`);
    let data = globalThis.WeeklyVegasSource.parse(await response.text(), season, week);
    const stored = await chrome.storage.local.get(["weeklyVegasDatasets", "weeklyVegasBackups", "weeklyVegasCalendar", "weeklyVegasAutoAttempts"]);
    const totals = schedule?.calendar?.season === season ? schedule.calendar.teamTotals || {} : {};
    data = globalThis.WeeklyVegas.validate({ ...data, players: data.players.map(player => {
      const line = totals[`${week}:${player.team}`];
      return line ? { ...player, ...line, oddsProvider: line.provider } : player;
    }) });
    const datasets = stored.weeklyVegasDatasets || {}, backups = stored.weeklyVegasBackups || {};
    const key = `${season}:${week}`;
    if (datasets[key]) backups[key] = datasets[key];
    datasets[key] = data;
    const attempts = stored.weeklyVegasAutoAttempts || {};
    attempts[key] = { nextAt: Date.now() + 3600000, error: "" };
    await chrome.storage.local.set({ weeklyVegasDatasets: datasets, weeklyVegasBackups: backups, weeklyVegasAutoAttempts: attempts });
    if (schedule?.calendar?.season === season) await refreshWeather(schedule.calendar, week, true).catch(() => {});
    return { ok: true, count: data.players.length };
  } finally { weeklyRefreshInFlight = false; }
}

const LOCK_TTL_MS = 20000;
const AUTO_ALARM_PREFIX = "got-auto-alarm:";
const KEEP_AWAKE_TABS_KEY = "got-keep-awake-tabs";
const TAB_ACTIVATION_SETTLE_MS = 750;
let lockQueue = Promise.resolve();
const autoTimers = new Map();

function lockKey(draftId, pickNumber) {
  return `draft-lock:${draftId}:${pickNumber}`;
}

async function acquireLock(message, sender) {
  const now = Date.now();
  const key = lockKey(message.draftId, message.pickNumber);
  const stored = await chrome.storage.session.get(key);
  const existing = stored[key];
  if (existing && existing.expiresAt > now && existing.actionId !== message.actionId) {
    return { ok: false, reason: "another-tab", lock: existing };
  }
  const lock = {
    actionId: message.actionId,
    ownerTabId: sender.tab?.id ?? null,
    playerId: message.playerId,
    acquiredAt: now,
    expiresAt: now + LOCK_TTL_MS,
    status: "acquired",
  };
  await chrome.storage.session.set({ [key]: lock });
  return { ok: true, lock };
}

async function updateLock(message, sender) {
  const key = lockKey(message.draftId, message.pickNumber);
  const stored = await chrome.storage.session.get(key);
  const existing = stored[key];
  if (!existing || existing.actionId !== message.actionId || existing.ownerTabId !== (sender.tab?.id ?? null)) {
    return { ok: false };
  }
  await chrome.storage.session.set({
    [key]: { ...existing, status: message.status, expiresAt: Date.now() + LOCK_TTL_MS },
  });
  return { ok: true };
}

async function releaseLock(message, sender) {
  const key = lockKey(message.draftId, message.pickNumber);
  const stored = await chrome.storage.session.get(key);
  const existing = stored[key];
  if (existing?.actionId === message.actionId && existing.ownerTabId === (sender.tab?.id ?? null)) {
    await chrome.storage.session.remove(key);
  }
  return { ok: true };
}

function autoAlarmName(tabId, draftId, pickNumber) {
  return `${AUTO_ALARM_PREFIX}${tabId}:${encodeURIComponent(draftId)}:${pickNumber}`;
}

async function scheduleAutoAlarm(message, sender) {
  const tabId = sender.tab?.id;
  if (!Number.isInteger(tabId) || !Number.isFinite(message.fireAt) || !message.pickNumber) {
    return { ok: false, reason: "invalid-alarm" };
  }
  const name = autoAlarmName(tabId, message.draftId, message.pickNumber);
  await chrome.storage.session.set({
    [name]: {
      tabId,
      draftId: message.draftId,
      pickNumber: message.pickNumber,
      fireAt: message.fireAt,
      deadlineAt: message.deadlineAt,
      triggerSeconds: message.triggerSeconds,
      minimumSeconds: message.minimumSeconds,
      attempt: message.attempt,
    },
  });
  await scheduleAutoWake(name, message.fireAt);
  return { ok: true, name };
}

async function scheduleAutoWake(name, fireAt) {
  const existingTimer = autoTimers.get(name);
  if (existingTimer) clearTimeout(existingTimer);
  autoTimers.delete(name);
  const remaining = fireAt - Date.now();
  const when = Math.max(Date.now() + 1, fireAt);
  await chrome.alarms.create(name, { when });
  const timer = setTimeout(() => fireAutoAlarm(name).catch(() => {}), Math.max(0, remaining));
  autoTimers.set(name, timer);
}

async function fireAutoAlarm(name) {
  const timer = autoTimers.get(name);
  if (timer) clearTimeout(timer);
  autoTimers.delete(name);
  const stored = await chrome.storage.session.get(name);
  const payload = stored[name];
  if (!payload) return;
  const remaining = payload.fireAt - Date.now();
  if (remaining > 250) {
    await scheduleAutoWake(name, payload.fireAt);
    return;
  }
  await Promise.all([chrome.alarms.clear(name), chrome.storage.session.remove(name)]);
  let tabActivated = false;
  try {
    await chrome.tabs.update(payload.tabId, { active: true });
    tabActivated = true;
    await new Promise((resolve) => setTimeout(resolve, TAB_ACTIVATION_SETTLE_MS));
  } catch {
    // The content script will fail closed if ESPN is still hidden or unavailable.
  }
  await chrome.tabs.sendMessage(payload.tabId, { type: "got-auto-alarm:fire", ...payload, tabActivated }).catch(() => {});
}

async function clearAutoAlarm(message, sender) {
  const tabId = sender.tab?.id;
  if (!Number.isInteger(tabId) || !message.pickNumber) return { ok: false };
  const name = autoAlarmName(tabId, message.draftId, message.pickNumber);
  const timer = autoTimers.get(name);
  if (timer) clearTimeout(timer);
  autoTimers.delete(name);
  await Promise.all([chrome.alarms.clear(name), chrome.storage.session.remove(name)]);
  return { ok: true };
}

async function setKeepAwake(message, sender) {
  const tabId = sender.tab?.id;
  if (!Number.isInteger(tabId)) return { ok: false, reason: "invalid-tab" };
  const stored = await chrome.storage.session.get(KEEP_AWAKE_TABS_KEY);
  const tabIds = new Set(Array.isArray(stored[KEEP_AWAKE_TABS_KEY]) ? stored[KEEP_AWAKE_TABS_KEY] : []);
  if (message.enabled) tabIds.add(tabId);
  else tabIds.delete(tabId);
  await chrome.storage.session.set({ [KEEP_AWAKE_TABS_KEY]: [...tabIds] });
  if (tabIds.size) chrome.power.requestKeepAwake("system");
  else chrome.power.releaseKeepAwake();
  return { ok: true, activeTabs: tabIds.size };
}

async function removeKeepAwakeTab(tabId) {
  const stored = await chrome.storage.session.get(KEEP_AWAKE_TABS_KEY);
  const tabIds = new Set(Array.isArray(stored[KEEP_AWAKE_TABS_KEY]) ? stored[KEEP_AWAKE_TABS_KEY] : []);
  if (!tabIds.delete(tabId)) return;
  await chrome.storage.session.set({ [KEEP_AWAKE_TABS_KEY]: [...tabIds] });
  if (tabIds.size) chrome.power.requestKeepAwake("system");
  else chrome.power.releaseKeepAwake();
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name.startsWith(INACTIVE_PREFIX)) { await fireInactiveAlert(alarm.name).catch(() => {}); return; }
  if (!alarm.name.startsWith(AUTO_ALARM_PREFIX)) return;
  await fireAutoAlarm(alarm.name);
});

chrome.tabs.onRemoved.addListener((tabId) => {
  void removeKeepAwakeTab(tabId).catch(() => {});
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "got-weekly:auto") {
    automaticWeekly().then(sendResponse, error => sendResponse({ ok: false, reason: error.message }));
    return true;
  }
  if (message.type === "got-weekly:open") {
    chrome.tabs.create({ url: chrome.runtime.getURL("weekly.html") }).then(() => sendResponse({ ok: true }), error => sendResponse({ ok: false, reason: error.message }));
    return true;
  }
  if (message.type === "got-weekly:roster") {
    scheduleInactiveAlerts(message).then(sendResponse, error => sendResponse({ ok: false, reason: error.message }));
    return true;
  }
  if (message.type === "got-weekly:notify") {
    chrome.storage.local.get("weeklyVegasAlerts").then(s => s.weeklyVegasAlerts === false ? { ok: true, disabled: true } : notify(String(message.id), String(message.title), String(message.message), String(message.url || "")))
      .then(sendResponse, error => sendResponse({ ok: false, reason: error.message }));
    return true;
  }
  if (message.type === "got-weekly:refresh") {
    refreshWeekly(message).then(sendResponse, error => sendResponse({ ok: false, reason: error.message }));
    return true;
  }
  if (!message?.type?.startsWith("got-draft-lock:") && !message?.type?.startsWith("got-auto-alarm:") && message?.type !== "got-keep-awake:set") return false;
  lockQueue = lockQueue.catch(() => {}).then(async () => {
    if (message.type === "got-keep-awake:set") return setKeepAwake(message, sender);
    if (message.type === "got-auto-alarm:schedule") return scheduleAutoAlarm(message, sender);
    if (message.type === "got-auto-alarm:clear") return clearAutoAlarm(message, sender);
    if (message.type === "got-draft-lock:acquire") return acquireLock(message, sender);
    if (message.type === "got-draft-lock:update") return updateLock(message, sender);
    if (message.type === "got-draft-lock:release") return releaseLock(message, sender);
    return { ok: false, reason: "unknown-message" };
  });
  lockQueue.then(sendResponse, () => sendResponse({ ok: false, reason: "storage-error" }));
  return true;
});
