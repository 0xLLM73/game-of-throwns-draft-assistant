import test from "node:test";
import assert from "node:assert/strict";
import "../extension/lib/weekly.js";
import "../extension/lib/weekly-source.js";
const now = new Date("2026-09-07T00:00:00Z");
const pageData = () => ({ initialWeek: 1, initialSeason: 2026, initialPosition: "ALL", initialScoring: "HALF_PPR", initialRows: Array.from({ length: 6 }, (_, i) => ({ playerName: `Synthetic ${i}`, position: "RB", team: "EX", week: 1, startsAt: "2026-09-13T17:00:00Z", halfPprPoints: 12 + i, playerImageUrl: `https://a.espncdn.com/i/headshots/nfl/players/full/${1000 + i}.png` })) });
const html = (data) => `<script>self.__next_f.push(${JSON.stringify([1, `6:[${JSON.stringify(data)}]`])})</script>`;
test("weekly source reads published JSON as data and preserves IDs and retrieval provenance", () => {
  const result = WeeklyVegasSource.parse(html(pageData()), 2026, 1, now);
  assert.equal(result.players.length, 6);
  assert.equal(result.players[0].espnId, "1000");
  assert.equal(result.players[0].halfPprPoints, 12);
  assert.equal(result.timestampKind, "retrieved");
  assert.equal(result.updatedAt, now.toISOString());
});
test("weekly source refuses stale seasons, different weeks, invalid scoring and incomplete rows", () => {
  for (const changes of [{ initialWeek: 2 }, { initialSeason: 2025 }, { initialScoring: "PPR" }, { initialPosition: "QB" }, { initialRows: [] }, { initialRows: pageData().initialRows.map(p => ({ ...p, week: 2 })) }, { initialRows: pageData().initialRows.map(p => ({ ...p, halfPprPoints: null })) }]) assert.throws(() => WeeklyVegasSource.parse(html({ ...pageData(), ...changes }), 2026, 1, now));
  assert.throws(() => WeeklyVegasSource.parse("<h1>Sign in</h1>", 2026, 1, now));
});
test("January games belong to the preceding NFL season", () => {
  const data = pageData();
  data.initialWeek = 18;
  data.initialRows = data.initialRows.map(p => ({ ...p, week: 18, startsAt: "2027-01-10T18:00:00Z" }));
  assert.equal(WeeklyVegasSource.parse(html(data), 2026, 18, now).players.length, 6);
});
test("refresh failures preserve cached projections and return a useful error", async () => {
  let listener;
  let values = { weeklyVegasDatasets: { "2026:1": { source: "old" } } };
  globalThis.chrome = {
    runtime: { onMessage: { addListener: fn => { listener = fn; } } },
    alarms: { onAlarm: { addListener() {} } },
    tabs: { onRemoved: { addListener() {} } },
    storage: { local: { get: async () => structuredClone(values), set: async x => { values = { ...values, ...x }; } } },
  };
  await import("../extension/background.js?weekly-test");
  const request = () => new Promise(resolve => listener({ type: "got-weekly:refresh", season: 2026, week: 1 }, { tab: { id: 1 } }, resolve));
  const fetchBefore = globalThis.fetch;
  try {
    globalThis.fetch = async () => ({ ok: true, text: async () => html({ ...pageData(), initialWeek: 2 }) });
    assert.equal((await request()).ok, false);
    assert.equal(values.weeklyVegasDatasets["2026:1"].source, "old");
    globalThis.fetch = async () => ({ ok: true, text: async () => html(pageData()) });
    const result = await request();
    assert.equal(result.ok, true);
    assert.equal(result.count, 6);
    assert.equal(values.weeklyVegasBackups["2026:1"].source, "old");
    globalThis.fetch = async () => { throw Error("Network unavailable"); };
    assert.match((await request()).reason, /Network unavailable/);
    assert.equal(values.weeklyVegasDatasets["2026:1"].players.length, 6);
  } finally { globalThis.fetch = fetchBefore; }
});
