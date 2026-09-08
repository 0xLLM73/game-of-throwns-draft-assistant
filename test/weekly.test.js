import test from "node:test";
import assert from "node:assert/strict";
import "../extension/lib/weekly.js";
const W = globalThis.WeeklyVegas;
const snapshot = (players) => ({ season: 2026, week: 1, scoring: "half-ppr", source: "Synthetic tests", updatedAt: "2026-09-01T00:00:00Z", players });
test("lineup advice compares only eligible one-for-one improvements", () => {
  const roster = [{ name: "Starter RB", slot: "RB" }, { name: "Starter flex", slot: "FLEX" }, { name: "Bench WR", slot: "Bench" }, { name: "Bench QB", slot: "BE" }];
  const data = snapshot([{ name: "Starter RB", position: "RB", halfPprPoints: 8 }, { name: "Starter flex", position: "RB", halfPprPoints: 10 }, { name: "Bench WR", position: "WR", halfPprPoints: 15 }, { name: "Bench QB", position: "QB", halfPprPoints: 30 }]);
  const result = W.lineupSuggestions(roster, data);
  assert.equal(result.length, 1); assert.equal(result[0].gain, 5);
  assert.equal(result[0].starter.slot, "FLEX");
  for (const patch of [{ locked: true }, { status: "OUT" }, { slot: "IR" }]) {
    assert.equal(W.lineupSuggestions(roster.map(p => p.name === "Bench WR" ? { ...p, ...patch } : p), data).length, 0);
  }
  assert.equal(W.lineupSuggestions(roster, snapshot(data.players.map(p => p.name === "Starter flex" ? { ...p, halfPprPoints: null, stats: {} } : p))).length, 0);
  assert.equal(W.lineupSuggestions(roster, snapshot(data.players.map(p => ({ ...p, kickoff: "2026-09-01T00:00:00Z" }))), Date.parse("2026-09-02")).length, 0);
});
test("half-PPR scoring includes fractional expected touchdowns and turnover penalties", () => {
  const p = { position: "QB", stats: { passingYards: 250, passingTDs: 1.5, interceptions: 0.5, rushingYards: 30, rushingTDs: 0.25, fumblesLost: 0.2, twoPointConversions: 0.1 } };
  assert.ok(Math.abs(W.projection(p).points - 19.3) < 1e-9);
  assert.equal(W.projection({ position: "RB", stats: { rushingYards: 70, rushingTDs: 0.5, receptions: 4, receivingYards: 30, receivingTDs: 0 } }).points, 15);
});
test("missing props never become zero or a full projection; explicit zero is valid", () => {
  assert.equal(W.projection({ position: "WR", stats: { receivingYards: 60 } }).points, null);
  assert.equal(W.projection({ halfPprPoints: 0 }).points, 0);
  assert.equal(W.projection({ halfPprPoints: 15, unavailable: true }).points, null);
  assert.equal(W.projection(null).points, null);
  assert.equal(W.projection({ position: "K", stats: { rushingYards: 0 } }).points, null);
});
test("season, scoring, source time and stat schema must be valid", () => {
  const data = snapshot([{ name: "Test Player", position: "RB", halfPprPoints: 12 }]);
  assert.equal(W.validate(data).players[0].halfPprPoints, 12);
  for (const change of [{ week: 19 }, { scoring: "ppr" }, { updatedAt: "invalid" }, { players: [{ name: "Bad", position: "RB", stats: { anytimeTDProbability: 0.5 } }] }, { players: [...data.players, ...data.players] }]) assert.throws(() => W.validate({ ...data, ...change }));
});
test("matching rejects conflicting ESPN IDs and ambiguous names; snapshots never cross weeks", () => {
  const players = [{ name: "Test Player", espnId: "1" }, { name: "Test Player", espnId: "2" }];
  assert.equal(W.match(players, { name: "Test Player" }), null);
  assert.equal(W.match(players, { name: "Test Player", espnId: "3" }), null);
  assert.equal(W.match(players, { name: "Test Player", espnId: "2" }), players[1]);
  assert.equal(W.forWeek({ "2026:1": snapshot([]) }, 2026, 2), null);
  assert.equal(W.forWeek({ "2026:1": snapshot([]) }, 2027, 1), null);
});
