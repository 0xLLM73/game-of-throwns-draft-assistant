import test from 'node:test';
import assert from 'node:assert/strict';
import '../extension/lib/weekly.js';
import '../extension/lib/weekly-matchup.js';
test('matchup totals retain missing coverage rather than inventing zero projections', () => {
  const team = { name: 'Synthetic team', players: [{ name: 'RB', position: 'RB' }, { name: 'Defense', position: 'DST' }] };
  const data = { players: [{ name: 'RB', position: 'RB', halfPprPoints: 14.5 }] };
  const result = WeeklyVegasMatchup.summarize(team, data);
  assert.equal(result.total, 14.5); assert.equal(result.covered, 1); assert.equal(result.complete, false);
  assert.equal(result.players[1].points, null);
  assert.equal(WeeklyVegasMatchup.summarize({ ...team, players: team.players.slice(0, 1) }, data).complete, true);
  assert.equal(WeeklyVegasMatchup.summarize(team, null).covered, 0);
  assert.equal(WeeklyVegasMatchup.summarize({ players: [] }, data).complete, false);
});
