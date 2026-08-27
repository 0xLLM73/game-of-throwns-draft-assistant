"use strict";

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
  if (!alarm.name.startsWith(AUTO_ALARM_PREFIX)) return;
  await fireAutoAlarm(alarm.name);
});

chrome.tabs.onRemoved.addListener((tabId) => {
  void removeKeepAwakeTab(tabId).catch(() => {});
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
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
