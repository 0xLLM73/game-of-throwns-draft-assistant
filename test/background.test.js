import test from "node:test";
import assert from "node:assert/strict";

test("delivers an auto-draft trigger through redundant timer and persistent alarm paths", async () => {
  const session = new Map();
  const delivered = [];
  const activatedTabs = [];
  const alarmCreates = [];
  let failNextStorageWrite = false;
  let messageListener;
  let alarmListener;
  let tabRemovedListener;
  let keepAwakeMode = null;
  globalThis.chrome = {
    storage: {
      session: {
        async get(key) { return { [key]: session.get(key) }; },
        async set(values) {
          if (failNextStorageWrite) {
            failNextStorageWrite = false;
            throw new Error("simulated storage failure");
          }
          for (const [key, value] of Object.entries(values)) session.set(key, value);
        },
        async remove(key) { session.delete(key); },
      },
    },
    alarms: {
      async create(name, details) { alarmCreates.push({ name, details }); },
      async clear() { return true; },
      onAlarm: { addListener(listener) { alarmListener = listener; } },
    },
    tabs: {
      async update(tabId, changes) { activatedTabs.push({ tabId, changes }); return { id: tabId }; },
      async sendMessage(tabId, message) { delivered.push({ tabId, message }); },
      onRemoved: { addListener(listener) { tabRemovedListener = listener; } },
    },
    power: {
      requestKeepAwake(mode) { keepAwakeMode = mode; },
      releaseKeepAwake() { keepAwakeMode = null; },
    },
    runtime: {
      onMessage: { addListener(listener) { messageListener = listener; } },
    },
  };

  await import(`../extension/background.js?test=${Date.now()}`);
  assert.equal(typeof alarmListener, "function");
  assert.equal(typeof messageListener, "function");
  assert.equal(typeof tabRemovedListener, "function");

  const response = await new Promise((resolve) => {
    messageListener({
      type: "got-auto-alarm:schedule",
      draftId: "practice",
      pickNumber: 4,
      fireAt: Date.now() + 40,
      deadlineAt: Date.now() + 5000,
      triggerSeconds: 25,
    }, { tab: { id: 99 } }, resolve);
  });
  assert.equal(response.ok, true);

  await new Promise((resolve) => setTimeout(resolve, 850));
  assert.equal(delivered.length, 1);
  assert.deepEqual(activatedTabs[0], { tabId: 99, changes: { active: true } });
  assert.equal(delivered[0].tabId, 99);
  assert.equal(delivered[0].message.type, "got-auto-alarm:fire");
  assert.equal(delivered[0].message.pickNumber, 4);
  assert.equal(delivered[0].message.tabActivated, true);
  assert.equal(alarmCreates.length, 1);
  assert.ok(alarmCreates[0].details.when > Date.now() - 1000);

  await alarmListener({ name: alarmCreates[0].name });
  assert.equal(delivered.length, 1, "the second wake path must not deliver twice");

  const awake = await new Promise((resolve) => {
    messageListener({ type: "got-keep-awake:set", enabled: true }, { tab: { id: 99 } }, resolve);
  });
  assert.equal(awake.ok, true);
  assert.equal(keepAwakeMode, "system");
  tabRemovedListener(99);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(keepAwakeMode, null);

  failNextStorageWrite = true;
  const failed = await new Promise((resolve) => {
    messageListener({
      type: "got-auto-alarm:schedule",
      draftId: "practice",
      pickNumber: 5,
      fireAt: Date.now() + 40,
      deadlineAt: Date.now() + 5000,
      triggerSeconds: 25,
    }, { tab: { id: 99 } }, resolve);
  });
  assert.equal(failed.ok, false);

  const recovered = await new Promise((resolve) => {
    messageListener({
      type: "got-auto-alarm:schedule",
      draftId: "practice",
      pickNumber: 6,
      fireAt: Date.now() + 40,
      deadlineAt: Date.now() + 5000,
      triggerSeconds: 25,
    }, { tab: { id: 99 } }, resolve);
  });
  assert.equal(recovered.ok, true);
  await new Promise((resolve) => setTimeout(resolve, 850));
  assert.equal(delivered.at(-1).message.pickNumber, 6);
});
