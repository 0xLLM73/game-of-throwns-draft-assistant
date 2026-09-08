import test from 'node:test';
import assert from 'node:assert/strict';
import '../extension/lib/weekly.js';
import '../extension/lib/weekly-waivers.js';
test('waiver ranking sorts weekly points without treating missing as zero or mixing identities', () => {
  const players = [{ name: 'Low', position: 'RB' }, { name: 'High', position: 'WR' }, { name: 'Missing', position: 'QB' }, { name: 'Conflict', position: 'TE', espnId: '2' }];
  const data = { players: [{ name: 'Low', position: 'RB', halfPprPoints: 0 }, { name: 'High', position: 'WR', halfPprPoints: 12 }, { name: 'Conflict', position: 'TE', halfPprPoints: 20, espnId: '1' }] };
  const result = WeeklyVegasWaivers.rank(players, data);
  assert.deepEqual(result.slice(0, 2).map(p => p.name), ['High', 'Low']);
  assert.equal(result.find(p => p.name === 'Conflict').points, null);
  assert.equal(result.find(p => p.name === 'Missing').points, null);
  assert.ok(WeeklyVegasWaivers.rank(players, null).every(p => p.points === null));
});
