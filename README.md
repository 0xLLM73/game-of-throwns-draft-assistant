# Game of Throwns Draft Assistant

An open-source, local-only Chrome extension that overlays draft recommendations and guarded one-click drafting on ESPN fantasy-football draft rooms.

> This repository contains the extension and ranking-engine code, not a third-party rankings database. The maintainer's local `extension/data/rankings.json`, downloaded source pages, and ingestion script are intentionally excluded from version control. Before loading the extension, provide a rankings file containing only data you are authorized to use; see `extension/data/rankings.example.json` for the schema.

The locally configured 2026 model can blend fields representing:

- DraftSharks Half-PPR 3D value, projection range, injury risk, and overall rank.
- FantasyPros Half-PPR expert consensus rank.
- First Down Studio Vegas-derived Half-PPR projection, converted to value over replacement.
- DraftSharks' ESPN ADP, used as the primary platform-specific timing signal. The currently available feed is ESPN PPR/12-team, so it is labeled as an approximation; Sleeper Half-PPR ADP remains a fallback only.

The league preset is 10 teams, 17 rounds, one starting QB, two RB, two WR, one RB/WR, one FLEX, one TE, one D/ST, and one kicker. ESPN position maximums are enforced at QB 2, RB 8, WR 8, TE 3, D/ST 3, and K 3; unsupported TQB, IDP, punter, and head-coach positions remain unavailable.

Recommendations are hard-filtered through those exact starter, bench, roster-size, and position-maximum rules. Near the end of the draft, the assistant reserves legal lineup space and will force a missing K, D/ST, or other required starter instead of suggesting a player ESPN can only place on an already-full bench.

## Ranking models

The overlay and settings page expose five interchangeable models:

- **Think · Pro RMV experimental** implements the Extended Pro architecture with the data available locally. It builds a cardinal projection from 65% Vegas and 35% DraftSharks consensus projection, moves at most eight points toward positional FantasyPros ECR, calculates dynamic joint RB/WR/TE/RB-WR/FLEX replacement frontiers, and ranks candidates by the improvement to a completed legal lineup. ESPN ADP affects only categorical wait-versus-draft-now timing. Bench ceiling is separate and capped at ten points. Bench-only selections are blocked until all eight offensive starter assignments are filled; early QB2/TE2 picks are suppressed, and overstocked RB or WR benches receive a strong balance discount. This is an inspectable MVP: FantasyPros raw-stat projections, calibrated ESPN pick distributions, weekly injury availability, and matchup-based K/DST projections are not yet available.
- **Sharp value · new** uses 55% DraftSharks 3D value, 35% FantasyPros Half-PPR ECR, and 10% Vegas value over replacement. DraftSharks ceiling and injury data make small adjustments. ESPN ADP controls timing and reach decisions, and a soft RB/WR balance penalty prevents extreme benches.
- **Vegas 80 / DraftSharks 20 · RB/WR priority** uses 80% Vegas value over positional replacement and 20% DraftSharks 3D value. It adds a modest RB/WR scarcity premium and QB discount for this one-QB, multi-flex league, while retaining soft roster-balance and duplicate-QB safeguards.
- **Vegas only · positional value** uses Vegas projections as its only player-data signal. It compares each player with the Vegas projection at his positional replacement frontier, preventing raw QB totals from overwhelming scarce RB/WR value. ADP, FantasyPros, and DraftSharks do not affect its order; legal-roster and duplicate-position safeguards still apply.
- **Balanced v0.4 · backup** preserves the prior 55% FantasyPros and 45% Vegas formula, including its original ADP and roster adjustments.

All models retain the same ESPN synchronization, legal-roster filters, auto-draft safeguards, and final-round K/D/ST constraints.

All five models apply a small RB close-call preference. It is worth 0.025 in normalized-score models and 1.5 point-equivalents in Think RMV—enough to favor an RB over a nearly equal WR, but not enough to override a materially stronger player or the soft RB/WR bench-balance controls. In the Vegas-only model, Vegas remains the sole player-data source; this is a league-position adjustment rather than another projection source.

The optional **Block QB/TE through Round 8** button is an eligibility experiment for mock drafts. When enabled, QB and TE are removed from manual recommendations and automatic best-pick selection during rounds 1–8, then restored automatically in round 9. It does not modify any ranking-model weights or player scores, defaults to off, and persists locally until toggled again.

When your team is on the clock, the overlay provides a one-click Draft button for both the top recommendation and each of the four alternatives. Manual alternative picks use the same fresh-state validation, cross-tab action lock, ESPN identity check, and search cleanup as the best-pick action. Automatic drafting always selects only the top recommendation.

The Suggestions selector can show the top five overall players or filter the board to QB, RB, WR, TE, D/ST, or K. Position filtering affects only the displayed manual choices; automatic drafting continues to use the unfiltered overall top recommendation.

## Load in Chrome

1. Create `extension/data/rankings.json` using the structure in `extension/data/rankings.example.json` and data you have permission to use.
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Choose **Load unpacked**.
5. Select the `extension` directory in this project.
6. Open or reload an ESPN football draft room.

While your team is on the clock, the overlay enables a **Draft [player] — Pick [number]** button. The action requires one ESPN player-ID match plus matching team and position, two stable draft snapshots, the expected roster count, a known draft slot, and a cross-tab lock keyed by draft and pick. Manual reconciliation, ESPN Autopick, paused/resumed state, stale roster state, or an uncertain prior action disables executable drafting.

After an extension-triggered pick or failed lookup, the ESPN player search is cleared and blurred so the complete available-player board is visible again.

The overlay includes an explicit **Arm auto-draft** / **Disarm auto-draft** button. Each pick gets one stable random trigger with 5–55 seconds remaining, allowing an early selection in a 60-second league while preserving the original late-clock range. The selected trigger is shown only while your team is on the clock. The unattended scheduler registers both a persistent Chrome alarm and an exact timer for the same idempotent action, so switching tabs or suspending the extension worker does not leave a single wake path. At the trigger it activates the ESPN tab, waits 750 ms for ESPN's React UI to resume, and then requires a visible, freshly synchronized page before drafting. This avoids background-tab throttling during 60-second real drafts. Any pick requiring ESPN search still uses a 10-second minimum. If a transient ESPN sync or lookup failure occurs before the safety cutoff, it makes one bounded retry; it never retries after a click or uncertain submission. The arm setting persists locally.

While auto-draft is armed, the extension uses Chrome's system-awake guard so macOS does not sleep even if the display turns off. The guard is released when auto-draft is disarmed, the ESPN tab closes, or the 17-player roster is complete. The ESPN draft tab must remain open and signed in, with a working network connection.

The timer status explicitly shows **OFF**, **ARMED**, or **BLOCKED · ESPN AUTOPICK**. ESPN's own Autopick mode disables its player Draft buttons, so it must be disabled before the extension can submit a recommendation.

## Rankings data and third-party rights

The extension reads `extension/data/rankings.json` locally and does not upload it. This repository does not grant a license to scrape, copy, or redistribute rankings, projections, ADP, or other content from third-party providers. Follow each provider's terms and use an authorized API, export, or independently created dataset. Third-party names and trademarks—including ESPN, FantasyPros, DraftSharks, Sleeper, and First Down Studio—belong to their respective owners; this project is independent and is not endorsed by them.

The example JSON is synthetic and exists only to document the input schema. It is not a usable fantasy ranking board.

## Tests

```sh
npm test
```

Use ESPN Practice Drafts to validate the live selectors. The overlay's **Draft sync** section reports the current pick, detected drafted players, roster count, and visible available-player count. A manual drafted-player control is included as a fallback.
