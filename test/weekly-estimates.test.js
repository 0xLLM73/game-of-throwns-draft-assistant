import test from "node:test";
import assert from "node:assert/strict";
import "../extension/lib/weekly.js";
import "../extension/lib/weekly-estimates.js";
import "../extension/lib/weekly-weather.js";
const E = globalThis.WeeklyVegasEstimates;
const game = (team, implied, ou, extra = {}) => ({ team, opponent: "OPP", impliedTeamTotal: implied, gameOverUnder: ou, teamSpread: -3, venue: "Lambeau Field", indoor: false, ...extra });

test("kickers track their team's implied total and lose points in wind", () => {
  const calm = E.project({ name: "K", position: "K", team: "GB" }, { games: { GB: game("GB", 27, 48) } });
  const low = E.project({ name: "K", position: "K", team: "GB" }, { games: { GB: game("GB", 17, 38) } });
  const windy = E.project({ name: "K", position: "K", team: "GB" }, { games: { GB: game("GB", 27, 48) }, weather: { GB: { windMph: 22, gustMph: 34 } } });
  assert.ok(calm.points > low.points);
  assert.ok(windy.points < calm.points - 1.5);
  assert.equal(calm.source, "est");
  assert.ok(windy.weather.chips.some(c => /Wind 22/.test(c.text)));
});
test("defenses score better against low opponent totals", () => {
  const good = E.project({ name: "D", position: "DST", team: "A" }, { games: { A: game("A", 27, 42) } });
  const bad = E.project({ name: "D", position: "DST", team: "A" }, { games: { A: game("A", 20, 52) } });
  assert.ok(good.points > bad.points);
});
test("falls back to ESPN when Vegas has no line, or a partial line projects lower", () => {
  const players = [{ name: "Partial", position: "RB", halfPprPoints: 5, partial: true, note: "Partial" }, { name: "Gone", position: "WR", unavailable: true, note: "No Vegas lines posted yet" }];
  assert.equal(E.project({ name: "Partial", position: "RB", espnProj: 9 }, { players }).source, "espn");
  assert.equal(E.project({ name: "Partial", position: "RB", espnProj: 3 }, { players }).points, 5);
  const gone = E.project({ name: "Gone", position: "WR", espnProj: 7 }, { players });
  assert.equal(gone.points, 7); assert.equal(gone.source, "espn");
  assert.equal(E.project({ name: "Bye", position: "WR", bye: true, espnProj: 7 }, {}).points, null);
});
test("optimizer replaces Out starters, respects locks and fills flex correctly", () => {
  const r = (name, position, slot, points, extra = {}) => ({ name, position, slot, points, sd: points * 0.3, ...extra });
  const rows = [r("QB", "QB", "QB", 20), r("RB1", "RB", "RB", 15, { out: true }), r("RB2", "RB", "RB", 12), r("WR1", "WR", "WR", 14), r("WR2", "WR", "WR", 9, { locked: true }),
    r("TE", "TE", "TE", 7), r("FX", "WR", "FLEX", 8), r("bRB", "RB", "Bench", 11), r("bWR", "WR", "Bench", 10), r("bTE", "TE", "Bench", 9), r("lockedBench", "WR", "Bench", 30, { locked: true })];
  const plan = E.optimize(rows);
  assert.equal(plan.currentTotal, 70);
  assert.equal(plan.optimalTotal, 85);
  assert.deepEqual(plan.moves.start.map(m => m.row.name).sort(), ["bRB", "bTE", "bWR"]);
  assert.ok(!plan.moves.start.some(m => m.row.name === "lockedBench"));
  assert.deepEqual(E.optimize([r("A", "RB", "RB", 10), r("B", "RB", "Bench", 10)]).moves.start, [], "no pointless swaps on ties");
});
test("win probability and strategy tilt", () => {
  assert.ok(Math.abs(E.winProbability({ mean: 100, variance: 400 }, { mean: 100, variance: 400 }) - 0.5) < 1e-6);
  const p = E.winProbability({ mean: 110, variance: 400 }, { mean: 100, variance: 400 });
  assert.ok(p > 0.6 && p < 0.7);
  assert.ok(E.tiltFor("auto", 0.8) < 0); assert.ok(E.tiltFor("auto", 0.2) > 0); assert.equal(E.tiltFor("auto", 0.5), 0); assert.equal(E.tiltFor("auto"), 0);
});
test("weather fetch averages the game window and skips domes", async () => {
  const fetchBefore = globalThis.fetch;
  let requested;
  globalThis.fetch = async (url) => {
    requested = new URL(url);
    const time = Array.from({ length: 24 }, (_, h) => `2026-11-15T${String(h).padStart(2, "0")}:00`);
    const hourly = { time, temperature_2m: time.map(() => 30), precipitation_probability: time.map(() => 60), precipitation: time.map(() => 0.1), wind_speed_10m: time.map((_, h) => (h >= 18 && h <= 21 ? 20 : 2)), wind_gusts_10m: time.map(() => 30) };
    return { ok: true, json: async () => ({ hourly }) };
  };
  try {
    const kickoff = "2026-11-15T18:00:00Z";
    const games = { GB: { id: "1", team: "GB", venue: "Lambeau Field", indoor: false, kickoff }, MIN: { id: "1", team: "MIN", venue: "Lambeau Field", indoor: false, kickoff }, DET: { id: "2", team: "DET", venue: "Ford Field", indoor: true, kickoff } };
    const wx = await globalThis.WeeklyVegasWeather.fetchForWeek(games, Date.parse("2026-11-14T00:00:00Z"));
    assert.deepEqual(Object.keys(wx).sort(), ["GB", "MIN"]);
    assert.ok(wx.GB.windMph > 15);
    assert.equal(requested.searchParams.get("latitude"), "44.5013");
  } finally { globalThis.fetch = fetchBefore; }
});
