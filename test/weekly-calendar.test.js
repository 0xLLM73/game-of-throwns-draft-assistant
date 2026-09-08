import test from "node:test";
import assert from "node:assert/strict";
import "../extension/lib/weekly-calendar.js";
const C = globalThis.WeeklyVegasCalendar;
function fixture() {
  const base = Date.parse("2026-09-15T00:15:00Z");
  const entries = Array.from({ length: 18 }, (_, i) => ({ value: String(i + 1), endDate: new Date(base + i * 604800000 + 86400000).toISOString() }));
  const events = entries.map((_, i) => ({ season: { year: 2026, type: 2 }, week: { number: i + 1 }, date: new Date(base + i * 604800000).toISOString() }));
  return { leagues: [{ calendar: [{ value: "2", startDate: "2026-09-06", endDate: entries.at(-1).endDate, entries }] }], events };
}
test("rolls at the first Monday kickoff, including doubleheaders and January", () => {
  const f = fixture();
  f.events.push({ ...f.events[0], date: "2026-09-15T02:00:00Z" });
  const c = C.build(f, 2026), boundary = Date.parse("2026-09-15T00:15:00Z");
  assert.equal(C.select(c, boundary - 1).week, 1);
  assert.equal(C.select(c, boundary).week, 2);
  assert.equal(C.select(c, Date.parse("2027-01-01")).week, 17);
  assert.equal(C.seasonAt(Date.parse("2027-01-01")), 2026);
  assert.equal(C.select(c, Date.parse("2026-08-01")).week, 1);
  assert.equal(C.select(c, Date.parse("2027-02-01")).week, 18);
  assert.equal(C.select(c, Date.parse("2027-02-01")).ended, true);
});
test("uses a labeled official week-end fallback and rejects mismatched seasons", () => {
  const f = fixture(); f.events = f.events.filter(e => e.week.number !== 2);
  const c = C.build(f, 2026);
  assert.equal(c.weeks[1].rolloverAt, Date.parse(f.leagues[0].calendar[0].entries[1].endDate));
  assert.match(c.weeks[1].boundary, /no Monday/);
  assert.throws(() => C.build(f, 2027));
});
test("automatic worker throttles refreshes and keeps old weeks when next week is unpublished", async () => {
  let listener, requests = 0;
  const realNow = Date.now, realFetch = globalThis.fetch;
  let now = Date.parse("2026-09-14T23:00:00Z");
  const calendar = C.build(fixture(), 2026);
  let values = { weeklyVegasCalendar: { calendar, fetchedAt: now }, weeklyVegasDatasets: { "2026:1": { source: "saved" } } };
  globalThis.chrome = {
    runtime: { onMessage: { addListener: fn => { listener = fn; } } },
    alarms: { onAlarm: { addListener() {} } }, tabs: { onRemoved: { addListener() {} } },
    storage: { local: { get: async () => structuredClone(values), set: async x => { values = { ...values, ...x }; } } }
  };
  await import("../extension/background.js?auto-test");
  const request = () => new Promise(resolve => listener({ type: "got-weekly:auto" }, {}, resolve));
  try {
    Date.now = () => now;
    globalThis.fetch = async () => { requests++; throw Error("Not published"); };
    assert.equal((await request()).week, 1);
    await request(); assert.equal(requests, 1);
    now = Date.parse("2026-09-15T00:15:00Z");
    const result = await request();
    assert.equal(result.week, 2); assert.match(result.warning, /retry in 15/);
    assert.equal(requests, 2);
    assert.equal(values.weeklyVegasDatasets["2026:1"].source, "saved");
    assert.equal(values.weeklyVegasDatasets["2026:2"], undefined);
  } finally { Date.now = realNow; globalThis.fetch = realFetch; }
});
