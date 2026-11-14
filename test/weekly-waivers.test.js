import test from 'node:test';
import assert from 'node:assert/strict';
import '../extension/lib/weekly.js';
import '../extension/lib/weekly-estimates.js';
import '../extension/lib/weekly-waivers.js';
test('waiver ranking sorts weekly points without treating missing as zero or mixing identities', () => {
  const players = [{ name: 'Low', position: 'RB' }, { name: 'High', position: 'WR' }, { name: 'Missing', position: 'QB' }, { name: 'Conflict', position: 'TE', espnId: '2' }];
  const ctx = { players: [{ name: 'Low', position: 'RB', halfPprPoints: 0 }, { name: 'High', position: 'WR', halfPprPoints: 12 }, { name: 'Conflict', position: 'TE', halfPprPoints: 20, espnId: '1' }] };
  const result = WeeklyVegasWaivers.rank(players, ctx);
  assert.deepEqual(result.slice(0, 2).map(p => p.name), ['High', 'Low']);
  assert.equal(result.find(p => p.name === 'Conflict').points, null);
  assert.equal(result.find(p => p.name === 'Missing').points, null);
  assert.ok(WeeklyVegasWaivers.rank(players, {}).every(p => p.points === null));
});
test('streamer filter keeps QB, TE, K and D/ST and falls back to ESPN projections', () => {
  const players = [{ name: 'Q', position: 'QB', espnProj: 15 }, { name: 'R', position: 'RB', espnProj: 30 }, { name: 'K1', position: 'K', espnProj: 8 }];
  const result = WeeklyVegasWaivers.rank(players, {}, { position: 'STREAM' });
  assert.deepEqual(result.map(p => p.name), ['Q', 'K1']);
  assert.equal(result[0].source, 'espn');
});
