import test from 'node:test';
import assert from 'node:assert/strict';
import '../extension/lib/weekly.js';
import '../extension/lib/weekly-estimates.js';
import '../extension/lib/weekly-matchup.js';
test('matchup totals retain missing coverage rather than inventing zero projections', () => {
  const team = { name: 'Synthetic team', players: [{ name: 'RB', position: 'RB' }, { name: 'Defense', position: 'DST', team: 'EX' }] };
  const ctx = { players: [{ name: 'RB', position: 'RB', halfPprPoints: 14.5 }] };
  const result = WeeklyVegasMatchup.summarize(team, ctx);
  assert.equal(result.total, 14.5); assert.equal(result.covered, 1); assert.equal(result.complete, false);
  assert.equal(result.players[1].points, null);
  assert.equal(WeeklyVegasMatchup.summarize({ ...team, players: team.players.slice(0, 1) }, ctx).complete, true);
  assert.equal(WeeklyVegasMatchup.summarize(team, {}).covered, 0);
  assert.equal(WeeklyVegasMatchup.summarize({ players: [] }, ctx).complete, false);
});
test('matchup totals include K/DST estimates once a betting line exists', () => {
  const team = { name: 'T', players: [{ name: 'RB', position: 'RB' }, { name: 'Defense', position: 'DST', team: 'EX' }] };
  const ctx = { players: [{ name: 'RB', position: 'RB', halfPprPoints: 14.5 }], games: { EX: { team: 'EX', opponent: 'OP', impliedTeamTotal: 24, gameOverUnder: 44, teamSpread: -4 } } };
  const result = WeeklyVegasMatchup.summarize(team, ctx);
  assert.equal(result.complete, true);
  assert.equal(result.players[1].source, 'est');
  assert.ok(result.total > 14.5);
});
