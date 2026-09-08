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
- **Vegas only · positional value** is the draft-night default and uses Vegas projections as its only player-data signal. It compares each player with the Vegas projection at his positional replacement frontier, preventing raw QB totals from overwhelming scarce RB/WR value. ESPN ADP is displayed for context but does not affect the order; FantasyPros and DraftSharks also do not affect it. Legal-roster and duplicate-position safeguards still apply.
- **Balanced v0.4 · backup** preserves the prior 55% FantasyPros and 45% Vegas formula, including its original ADP and roster adjustments.

All models retain the same ESPN synchronization, legal-roster filters, auto-draft safeguards, and final-round K/D/ST constraints.

On draft day, the local board can be enriched with ESPN's official player-pool metadata without changing any model weights. Meaningful ESPN ADP values replace the older platform-timing approximation, while FantasyPros, DraftSharks, Sleeper, and Vegas fields retain their own labeled source dates. ESPN `QUESTIONABLE` players remain eligible and are labeled in the overlay. Players marked `OUT`, `DOUBTFUL`, `INJURY_RESERVE`, `SUSPENSION`, `PUP`, `NFI`, or inactive are removed from every model before roster and strategy rules are applied.

All five models apply a small RB close-call preference. It is worth 0.025 in normalized-score models and 1.5 point-equivalents in Think RMV—enough to favor an RB over a nearly equal WR, but not enough to override a materially stronger player or the soft RB/WR bench-balance controls. In the Vegas-only model, Vegas remains the sole player-data source; this is a league-position adjustment rather than another projection source.

The optional **Block QB/TE through Round 8** button is an eligibility experiment for mock drafts. When enabled, QB and TE are removed from manual recommendations and automatic best-pick selection during rounds 1–8, then restored automatically in round 9. It does not modify any ranking-model weights or player scores, defaults to off, and persists locally until toggled again.

The mutually exclusive **Allow only one QB or TE through Round 8** button starts with both positions eligible. After the roster contains either one QB or one TE, both positions are removed from manual recommendations and automatic best-pick selection until round 9. This also defaults to off and does not modify ranking scores.

The independent **Require 5 RBs in first 6 picks** button allows at most one non-RB among the team's first six selections. It permits the non-RB at any point, but once every remaining pick is needed to reach five running backs, all other positions are removed from manual recommendations and automatic best-pick selection. The gate ends after the sixth team selection, defaults to off, and does not modify any player score or model weight.

The mutually exclusive **Require 6 RBs in first 6 picks** button removes every non-RB from manual recommendations and automatic best-pick selection for all six opening team selections. After the sixth selection, every position becomes eligible under the normal roster and strategy rules. It also defaults to off and changes no ranking score or model weight.

The third mutually exclusive sequence button, **Draft 6 RBs, then 4 WRs**, permits only RBs for team selections 1–6 and only WRs for selections 7–10. Normal position eligibility resumes with selection 11. The button shows progress through both phases, defaults to off, and changes no ranking score or model weight.

The fourth sequence button, **6 RBs → 4 WRs + QB · max 1 QB/TE**, permits only RBs for selections 1–6. Selections 7–11 must contain exactly four WRs and one QB; the WR and QB can occur in ranking order, but the gate forces whichever quota is still missing as the phase closes. When the QB slot is selected, the highest-ranked available QB is first. TE and all other positions are ineligible through selection 11. Starting with selection 12, normal position eligibility resumes except the roster remains capped at one QB and one TE: the required quarterback is the only QB, one TE may be selected, and QB2/TE2 remain blocked. This button is mutually exclusive with the other RB sequence modes, defaults to off, and changes no ranking score or model weight.

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

Player identity matching normalizes common platform team aliases, including `LVR`/`LV`, `JAX`/`JAC`, and `WAS`/`WSH`, while still requiring a matching player name, position, team, and stable ESPN player ID before a draft click.

The overlay includes an explicit **Arm auto-draft** / **Disarm auto-draft** button. Each pick gets one stable random trigger; the draft-day default is 10–20 seconds remaining for a 60-second league, and the controls allow 5–55 seconds. The selected trigger is shown only while your team is on the clock. The unattended scheduler registers both a persistent Chrome alarm and an exact timer for the same idempotent action, so switching tabs or suspending the extension worker does not leave a single wake path. At the trigger it activates the ESPN tab, waits 750 ms for ESPN's React UI to resume, and then requires a visible, freshly synchronized page before drafting. This avoids background-tab throttling during 60-second real drafts. Any pick requiring ESPN search still uses a 10-second minimum. If a transient ESPN sync or lookup failure occurs before the safety cutoff, it makes one bounded retry; it never retries after a click or uncertain submission. The arm setting persists locally.

While auto-draft is armed, the extension uses Chrome's system-awake guard so macOS does not sleep even if the display turns off. The guard is released when auto-draft is disarmed, the ESPN tab closes, or the 17-player roster is complete. The ESPN draft tab must remain open and signed in, with a working network connection.

The timer status explicitly shows **OFF**, **ARMED**, or **BLOCKED · ESPN AUTOPICK**. ESPN's own Autopick mode disables its player Draft buttons, so it must be disabled before the extension can submit a recommendation.

## Rankings data and third-party rights

The extension reads `extension/data/rankings.json` locally and does not upload it. This repository does not grant a license to scrape, copy, or redistribute rankings, projections, ADP, or other content from third-party providers. Follow each provider's terms and use an authorized API, export, or independently created dataset. Third-party names and trademarks—including ESPN, FantasyPros, DraftSharks, Sleeper, and First Down Studio—belong to their respective owners; this project is independent and is not endorsed by them.

The maintainer's August 28 draft-day board uses the August 26 local provider snapshots as its ranking foundation and ESPN's official August 28 player pool for current platform timing and availability. The pre-refresh JSON is retained locally as a rollback snapshot; neither file belongs in the public repository.

The example JSON is synthetic and exists only to document the input schema. It is not a usable fantasy ranking board.

## Weekly Vegas lineup (v0.11)

The **Add Players** page shows a weekly Vegas waiver-wire board sorted by projected points for available players on the currently loaded ESPN page. It follows ESPN position/search filters and pagination; it does not crawl the full pool or retain stale availability from other pages. FA/waiver status and injuries are displayed, rostered players excluded, and missing projections stay blank. Weekly points are not season-long value or a waiver spending recommendation. No acquisitions are submitted.

On ESPN's pregame **Matchup / boxscore** page, the same panel shows both teams' starters and their Vegas-derived totals. Bench tables are excluded using the observed starter-comparison container. Missing players and custom K/DST scoring remain blank; incomplete totals are labeled partial and never produce a full-team winner claim. These are pregame estimates, not sportsbook fantasy matchup odds or live win probabilities. Live/postgame layouts fail closed. Select the same week as the matchup if Automatic has advanced to the next week.

**Suggested lineup changes** lists up to five eligible bench-to-starter swaps, ordered by projected half-PPR gain. RB/WR and FLEX slot eligibility is respected. Suggestions are independent alternatives, not a combined optimized lineup; repeat comparisons after each manual move. Missing projections are never treated as zero, IR and known locked/started players are excluded, and the ESPN table week must match the panel week. This is advisory only and never submits a lineup change.

Reload the extension in Chrome and refresh ESPN **My Team**. A **Weekly Vegas · Half PPR** panel lists players detected in the visible lineup table, including bench players. **Automatic week & refresh** defaults on: ESPN's official NFL schedule selects the season/week and advances at the first Monday-night kickoff (including doubleheaders). Weeks without a scheduled Monday-night game use the labeled ESPN week-end boundary. January stays in the preceding NFL season; the panel stops at Week 18 and pauses refresh after the regular season.

The panel checks the date every 30 seconds while visible, and catches up when reopened or refocused. Projections refresh on first use of a week, then hourly; unpublished/failed requests retry after 15 minutes without replacing saved data or borrowing another week's values. The schedule refreshes every six hours; a failed schedule refresh is labeled when using cached dates. No Codex session, account, or scheduled task is needed. Changing Season or Week switches to manual mode; re-enable Automatic to resume. The panel does not change ESPN's displayed week or submit lineup changes, so after Monday kickoff its next-week projections may differ from the week still displayed by ESPN.

Click **Add / refresh weekly projections** (also linked from extension settings). Enter each player's published weekly half-PPR total with the source and source update time, or bulk import a JSON snapshot. Bulk imports support direct `halfPprPoints` or expected `stats` converted using your league's half-PPR scoring. The format and a clearly synthetic example are shown on that screen. No downloaded provider data is included in source control.

The **Refresh from Vegas** button also allows an immediate manual refresh from Parlay Savant's published weekly half-PPR page, with a 20-second timeout. Its source adapter checks season, week, scoring, position coverage, and game dates before replacing the local snapshot; failed requests preserve existing data. It reads embedded JSON without executing downloaded code. Tested September 7, 2026 against 205 published Week 1 QB/RB/WR/TE projections. First Down's weekly page was still awaiting Week 1 data, so the weekly feature uses the clearly labeled Parlay Savant source. Season draft projections are never substituted for weekly values. Chrome may request the Parlay Savant and ESPN schedule API site permissions when reloading.

The automatic source uses 4 points per passing TD, 25 passing yards per point, -2 per interception, 10 rushing/receiving yards per point, 6 points per non-passing TD, and 0.5 per reception. Lost fumbles and 2-point conversions are not included by that source; this is explicitly labeled. K and D/ST are excluded from automatic imports because the provider's scoring does not match this league's custom rules. Imported snapshots carry a retrieval timestamp and an explicit unknown-source-update-time label; fetching a page is not proof its underlying odds just updated.

Snapshots are stored in Chrome local storage by season/week, with one rollback copy per replaced week. Source updates older than 24 hours are labeled stale. Missing or incomplete props display a dash; questionable players remain visible with ESPN's status when detectable. Props are estimates, and touchdown probabilities must not be passed as expected touchdown counts. K/DST require direct provider totals matching the league's custom scoring. The panel shows coverage rather than assuming all players are present. Its selectors are covered by a synthetic browser fixture; a signed-in ESPN lineup must still be checked after installation.

## Tests

```sh
npm test
```

Use ESPN Practice Drafts to validate the live selectors. The overlay's **Draft sync** section reports the current pick, detected drafted players, roster count, and visible available-player count. A manual drafted-player control is included as a fallback.
