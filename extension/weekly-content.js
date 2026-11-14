(async function () {
  "use strict";
  if (window.top !== window || document.getElementById("got-weekly-host")) return;
  const W = globalThis.WeeklyVegas, E = globalThis.WeeklyVegasEstimates, C = globalThis.WeeklyVegasCalendar, D = globalThis.WeeklyVegasDom;
  const PAGES = /^\/football\/(team|boxscore|players\/add)\/?$/;
  const num = (n) => typeof n === "number" && Number.isFinite(n);
  const fmt = (n) => (num(n) ? n.toFixed(1) : "—");

  // ---------- Small DOM helper (never uses innerHTML for data) ----------
  function h(tag, attrs = {}, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else if (k === "style") el.style.cssText = v;
      else el.setAttribute(k, v === true ? "" : v);
    }
    for (const c of children.flat()) if (c != null && c !== false) el.append(c instanceof Node ? c : String(c));
    return el;
  }
  const ICONS = {
    refresh: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/></svg>',
    gear: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
    minus: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M5 12h14"/></svg>',
    ball: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><ellipse cx="12" cy="12" rx="9" ry="5.5" transform="rotate(-35 12 12)" fill="#8c4a21"/><path d="M8.5 15.5l7-7M10 11.6l1.4 1.4M11.6 10l1.4 1.4M13.2 8.4l1.4 1.4" stroke="#fff" stroke-width="1.3" stroke-linecap="round"/></svg>',
  };
  const icon = (name) => { const s = h("span", { class: "icon" }); s.innerHTML = ICONS[name]; return s; };

  // ---------- Shell ----------
  const host = h("div", { id: "got-weekly-host" });
  const shadow = host.attachShadow({ mode: "open" });
  shadow.append(h("style", {}, `
    :host{all:initial;position:fixed;right:16px;bottom:16px;z-index:99999;font:13px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#0f172a;
      --bg:#fff;--soft:#f8fafc;--line:#e2e8f0;--muted:#64748b;--ink:#0f172a;--accent:#15803d;--accent-soft:#dcfce7;--warn:#b45309;--warn-soft:#fef3c7;--bad:#b91c1c;--bad-soft:#fee2e2;--info:#1d4ed8;--info-soft:#dbeafe}
    *{box-sizing:border-box}
    button,select,input{font:inherit;color:inherit}
    button{cursor:pointer}
    button:focus-visible,select:focus-visible,input:focus-visible,a:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
    [hidden]{display:none!important}
    .icon{display:inline-flex}
    .pill{display:flex;align-items:center;gap:8px;padding:10px 14px;border-radius:999px;border:1px solid var(--line);background:var(--bg);box-shadow:0 6px 24px rgba(15,23,42,.18);font-weight:600}
    .pill:hover{border-color:var(--accent)}
    .pill b{color:var(--accent)}
    .panel{width:min(400px,calc(100vw - 32px));max-height:min(78vh,760px);display:flex;flex-direction:column;background:var(--bg);border:1px solid var(--line);border-radius:14px;box-shadow:0 12px 40px rgba(15,23,42,.22);overflow:hidden}
    header{display:flex;align-items:center;gap:10px;padding:12px 12px 10px 14px;border-bottom:1px solid var(--line)}
    header .t{flex:1;min-width:0}
    h2{font-size:15px;margin:0;line-height:1.2}
    .sub{margin:2px 0 0;color:var(--muted);font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .dot{display:inline-block;width:7px;height:7px;border-radius:50%;margin-right:5px;vertical-align:1px;background:var(--accent)}
    .dot.stale{background:#f59e0b}.dot.none{background:#cbd5e1}
    .ib{width:32px;height:32px;display:inline-flex;align-items:center;justify-content:center;border:0;border-radius:8px;background:transparent;color:var(--muted)}
    .ib:hover{background:var(--soft);color:var(--ink)}
    .ib[aria-pressed=true]{background:var(--soft);color:var(--ink)}
    .spin .icon{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}
    .body{overflow:auto;flex:1}
    .settings{padding:12px 14px;background:var(--soft);border-bottom:1px solid var(--line);display:grid;grid-template-columns:1fr 1fr;gap:10px 12px}
    .settings label{display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--muted)}
    .settings .row{grid-column:1/-1;flex-direction:row;align-items:center;gap:8px;color:var(--ink)}
    .settings select,.settings input[type=number]{height:34px;border:1px solid var(--line);border-radius:8px;background:#fff;padding:0 8px}
    .settings a{grid-column:1/-1;color:var(--accent);font-size:12px}
    .alerts{display:flex;flex-direction:column;gap:6px;padding:10px 14px 0}
    .alerts:empty{display:none}
    .alert{padding:8px 10px;border-radius:8px;font-size:12px;border-left:3px solid}
    .alert.bad{background:var(--bad-soft);border-color:var(--bad);color:#7f1d1d}
    .alert.warn{background:var(--warn-soft);border-color:var(--warn);color:#78350f}
    .alert.info{background:var(--info-soft);border-color:var(--info);color:#1e3a8a}
    .alert b{display:block}
    .hero{padding:12px 14px}
    .hero:empty{display:none}
    .totals{display:flex;align-items:flex-end;justify-content:space-between;gap:12px}
    .big{font-size:28px;font-weight:700;letter-spacing:-.02em;line-height:1}
    .big small{font-size:13px;font-weight:500;color:var(--muted);margin-left:4px}
    .label{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);font-weight:600}
    .gain{color:var(--accent);font-weight:700}
    .moves{margin-top:10px;border:1px solid #bbf7d0;background:#f0fdf4;border-radius:10px;padding:10px}
    .moves ul{margin:6px 0 0;padding:0;list-style:none;display:flex;flex-direction:column;gap:4px}
    .moves li{display:flex;gap:6px;align-items:baseline}
    .tag{font-size:10px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;padding:1px 6px;border-radius:4px}
    .tag.in{background:var(--accent);color:#fff}.tag.out{background:#e2e8f0;color:#334155}
    .ok{margin-top:10px;font-size:12px;color:var(--muted)}
    .strategy{display:flex;align-items:center;gap:8px;margin-top:10px;font-size:12px;color:var(--muted)}
    .seg{display:inline-flex;border:1px solid var(--line);border-radius:8px;overflow:hidden;flex-wrap:wrap}
    .seg button{border:0;background:#fff;padding:5px 9px;font-size:12px;color:var(--muted)}
    .seg button+button{border-left:1px solid var(--line)}
    .seg button[aria-pressed=true]{background:var(--ink);color:#fff}
    .bar{position:relative;height:8px;border-radius:999px;background:#fecaca;overflow:hidden;margin:8px 0 4px}
    .bar span{position:absolute;inset:0 auto 0 0;background:var(--accent);border-radius:999px}
    .vs{display:grid;grid-template-columns:1fr auto 1fr;gap:8px;align-items:center}
    .vs .r{text-align:right}
    .vs .name{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .section{padding:6px 14px 2px;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);font-weight:700;background:var(--soft);border-top:1px solid var(--line);border-bottom:1px solid var(--line);display:flex;justify-content:space-between}
    .p{display:grid;grid-template-columns:44px 1fr auto;gap:10px;align-items:center;padding:8px 14px;border-bottom:1px solid #f1f5f9;width:100%;text-align:left;background:#fff;border-left:0;border-right:0;border-top:0}
    .p:hover{background:#fafafa}
    .p.dim{opacity:.55}
    .slot{font-size:11px;font-weight:700;color:#334155;background:#f1f5f9;border-radius:6px;text-align:center;padding:4px 0}
    .who{min-width:0}
    .n{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .n .st{font-size:10px;font-weight:700;margin-left:4px;padding:0 4px;border-radius:3px;vertical-align:1px}
    .st.bad{background:var(--bad);color:#fff}.st.warn{background:#f59e0b;color:#fff}
    .meta{font-size:11.5px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .chips{display:flex;flex-wrap:wrap;gap:4px;margin-top:3px}
    .chip{font-size:10.5px;padding:1px 6px;border-radius:999px;background:#f1f5f9;color:#475569}
    .chip.warn{background:var(--warn-soft);color:#92400e}.chip.bad{background:var(--bad-soft);color:#991b1b}
    .pts{text-align:right}
    .pts b{display:block;font-size:16px}
    .src{font-size:10.5px;color:var(--muted)}
    .src.est,.src.espn,.src.partial{color:var(--warn)}
    .more{grid-column:2/-1;font-size:12px;color:#334155;background:var(--soft);border-radius:8px;padding:8px;margin-top:2px}
    .more div+div{margin-top:3px}
    .controls{display:flex;flex-direction:column;gap:8px;padding:10px 14px}
    .controls label{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--muted)}
    .controls select{height:30px;border:1px solid var(--line);border-radius:8px;background:#fff;padding:0 6px}
    footer{padding:8px 14px;border-top:1px solid var(--line);font-size:11px;color:var(--muted);background:var(--soft)}
    .empty{padding:18px 14px;color:var(--muted);text-align:center}
    .cta{margin-top:8px;border:0;border-radius:8px;background:var(--accent);color:#fff;padding:8px 14px;font-weight:600}
  `));
  const pill = h("button", { class: "pill", type: "button", "aria-label": "Open Weekly Vegas panel" }, icon("ball"), h("span", { id: "pilltext" }, "Vegas"));
  const refreshBtn = h("button", { class: "ib", type: "button", title: "Refresh projections", "aria-label": "Refresh projections" }, icon("refresh"));
  const settingsBtn = h("button", { class: "ib", type: "button", title: "Settings", "aria-label": "Settings", "aria-pressed": "false" }, icon("gear"));
  const collapseBtn = h("button", { class: "ib", type: "button", title: "Minimize", "aria-label": "Minimize panel" }, icon("minus"));
  const titleEl = h("h2", {}, "Weekly Vegas");
  const subEl = h("p", { class: "sub" });
  const seasonInput = h("input", { type: "number", min: "2026", max: "2100" });
  const weekSelect = h("select", {}, h("option", { value: "" }, "Choose"), ...Array.from({ length: 18 }, (_, i) => h("option", { value: String(i + 1) }, `Week ${i + 1}`)));
  const autoBox = h("input", { type: "checkbox" });
  const alertsBox = h("input", { type: "checkbox" });
  const settings = h("div", { class: "settings", hidden: true },
    h("label", {}, "Season", seasonInput), h("label", {}, "Week", weekSelect),
    h("label", { class: "row" }, autoBox, "Follow the current NFL week automatically"),
    h("label", { class: "row" }, alertsBox, "Desktop alerts for inactive or Out starters"),
    h("a", { href: "#", onclick: (e) => { e.preventDefault(); chrome.runtime.sendMessage({ type: "got-weekly:open" }).catch(() => {}); } }, "Manual projections & import"));
  const alertsEl = h("div", { class: "alerts", role: "status" });
  const heroEl = h("div", { class: "hero" });
  const listEl = h("div");
  const footEl = h("footer");
  const panel = h("section", { class: "panel", "aria-label": "Weekly Vegas" },
    h("header", {}, icon("ball"), h("div", { class: "t" }, titleEl, subEl), refreshBtn, settingsBtn, collapseBtn),
    settings, h("div", { class: "body" }, alertsEl, heroEl, listEl), footEl);
  shadow.append(pill, panel);

  // ---------- State ----------
  const store = await chrome.storage.local.get(["weeklyVegasDatasets", "weeklyVegasCalendar", "weeklyVegasWeather", "weeklyVegasAutomatic", "weeklyVegasAlerts", "weeklyVegasStrategy", "weeklyVegasPanelOpen", "weeklyVegasWinProb", "weeklyVegasMyTeams"]);
  let datasets = store.weeklyVegasDatasets || {};
  let calendar = store.weeklyVegasCalendar?.calendar || null;
  let weather = store.weeklyVegasWeather || {};
  let winProbs = store.weeklyVegasWinProb || {};
  let myTeams = store.weeklyVegasMyTeams || {};
  let strategy = store.weeklyVegasStrategy || "auto";
  let open = store.weeklyVegasPanelOpen !== false;
  autoBox.checked = store.weeklyVegasAutomatic !== false;
  alertsBox.checked = store.weeklyVegasAlerts !== false;
  const url0 = new URL(location.href);
  seasonInput.value = url0.searchParams.get("seasonId") || C.seasonAt();
  weekSelect.value = url0.searchParams.get("scoringPeriodId") || "";
  let notice = null; // { tone, title, text }
  let busy = false;
  const expanded = new Set();
  let waiverPosition = "ALL", waiverSort = "points";
  let lastFingerprint = "", lastRosterPing = "";

  function setOpen(value) {
    open = value;
    pill.hidden = open; panel.hidden = !open;
    chrome.storage.local.set({ weeklyVegasPanelOpen: open }).catch(() => {});
  }
  setOpen(open);
  pill.onclick = () => setOpen(true);
  collapseBtn.onclick = () => setOpen(false);
  settingsBtn.onclick = () => { settings.hidden = !settings.hidden; settingsBtn.setAttribute("aria-pressed", String(!settings.hidden)); };
  seasonInput.onchange = weekSelect.onchange = () => { autoBox.checked = false; chrome.storage.local.set({ weeklyVegasAutomatic: false }); render(true); };
  autoBox.onchange = () => { chrome.storage.local.set({ weeklyVegasAutomatic: autoBox.checked }); nextAuto = 0; checkAutomatic(); render(true); };
  alertsBox.onchange = () => { chrome.storage.local.set({ weeklyVegasAlerts: alertsBox.checked }); lastRosterPing = ""; render(true); };

  // ESPN shows the week it's displaying in the table header; follow it so the panel always matches the page.
  function displayedWeek() {
    const scope = document.querySelector('[aria-label="Lineup"], .Roster, .matchup-pregame-tables, .boxscore-overview') || document;
    const text = Array.from(scope.querySelectorAll("thead th, thead td")).map(e => e.textContent.trim()).find(t => /^NFL Week \d+$/i.test(t));
    return Number(text?.match(/\d+/)?.[0]) || null;
  }
  const season = () => Number(seasonInput.value);
  const week = () => displayedWeek() || Number(weekSelect.value) || null;
  function context(wk = week()) {
    const data = wk ? W.forWeek(datasets, season(), wk) : null;
    const games = calendar?.season === season() && wk ? C.gamesForWeek(calendar, wk) : {};
    return { data, ctx: { players: data?.players || [], games, weather: weather[`${season()}:${wk}`]?.byTeam || {}, now: Date.now() } };
  }

  async function refresh() {
    const wk = week();
    if (!wk) { notice = { tone: "warn", title: "Choose a week", text: "Open settings and pick a week to load." }; settings.hidden = false; render(true); return; }
    busy = true; refreshBtn.classList.add("spin"); refreshBtn.disabled = true;
    try {
      const result = await chrome.runtime.sendMessage({ type: "got-weekly:refresh", season: season(), week: wk });
      if (!result?.ok) throw Error(result?.reason || "Refresh failed. Reload ESPN if you just updated the extension.");
      notice = { tone: "info", title: "Updated", text: `${result.count} player projections loaded for Week ${wk}.` };
      setTimeout(() => { if (notice?.title === "Updated") { notice = null; render(true); } }, 6000);
    } catch (error) {
      notice = { tone: "bad", title: "Refresh failed", text: error.message };
    } finally { busy = false; refreshBtn.classList.remove("spin"); refreshBtn.disabled = false; render(true); }
  }
  refreshBtn.onclick = refresh;

  let autoBusy = false, nextAuto = 0;
  async function checkAutomatic() {
    if (!autoBox.checked || autoBusy || document.hidden || !PAGES.test(location.pathname) || Date.now() < nextAuto) return;
    autoBusy = true; nextAuto = Date.now() + 30000;
    try {
      const result = await chrome.runtime.sendMessage({ type: "got-weekly:auto" });
      if (!autoBox.checked) return;
      if (!result?.ok) throw Error(result?.reason || "Automatic refresh unavailable. Reload ESPN to reconnect.");
      seasonInput.value = result.season; weekSelect.value = String(result.week);
      notice = result.warning ? { tone: "warn", title: "Heads up", text: result.warning } : (notice?.tone === "bad" ? null : notice);
      render(true);
    } catch (error) { notice = { tone: "warn", title: "Automatic refresh", text: error.message }; render(true); }
    finally { autoBusy = false; }
  }

  // ---------- Shared bits ----------
  function kickoffText(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    return `${d.toLocaleDateString([], { weekday: "short" })} ${d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
  }
  const SOURCE = { vegas: "Vegas", partial: "Vegas (partial)", est: "Estimate", espn: "ESPN", bye: "Bye" };
  function statusTag(r) {
    if (!r.status) return null;
    return h("span", { class: `st ${/^(O|OUT|IR|SSPD|SUSP|D|DOUBTFUL)$/i.test(r.status) ? "bad" : "warn"}` }, r.status);
  }
  function chipsFor(r) {
    const chips = [];
    if (r.locked && !r.bye) chips.push(h("span", { class: "chip" }, "Locked"));
    for (const c of r.weather?.chips || []) chips.push(h("span", { class: `chip ${c.tone === "bad" ? "bad" : c.tone === "warn" ? "warn" : ""}` }, c.text));
    if (num(r.game?.impliedTeamTotal)) chips.push(h("span", { class: "chip" }, `Team total ${r.game.impliedTeamTotal.toFixed(1)}`));
    return chips.length ? h("div", { class: "chips" }, chips) : null;
  }
  function playerRow(r, { slot = r.slot, key = r.name, dim = false } = {}) {
    const lo = num(r.points) && num(r.sd) ? Math.max(0, r.points - r.sd) : null, hi = num(r.points) && num(r.sd) ? r.points + r.sd : null;
    const opp = r.bye ? "Bye" : r.game ? `${r.game.home ? "vs" : "@"} ${r.game.opponent}` : r.opp || "";
    const btn = h("button", { class: `p${dim ? " dim" : ""}`, type: "button", "aria-expanded": String(expanded.has(key)) },
      h("span", { class: "slot" }, (slot || r.position || "").replace("Bench", "BN") || "—"),
      h("span", { class: "who" },
        h("div", { class: "n" }, r.name, statusTag(r)),
        h("div", { class: "meta" }, [r.team, r.position === "DST" ? "D/ST" : r.position, opp, r.bye ? "" : kickoffText(r.kickoff)].filter(Boolean).join(" · ")),
        chipsFor(r)),
      h("span", { class: "pts" }, h("b", {}, fmt(r.points)), h("span", { class: `src ${r.source || ""}` }, r.source ? SOURCE[r.source] : "No data")));
    if (expanded.has(key)) {
      btn.append(h("div", { class: "more" },
        h("div", {}, r.detail || ""),
        num(lo) ? h("div", {}, `Likely range ${lo.toFixed(1)}–${hi.toFixed(1)} pts`) : null,
        r.game && num(r.game.gameOverUnder) ? h("div", {}, `${r.team} ${r.game.teamSpread > 0 ? "+" : ""}${r.game.teamSpread} · O/U ${r.game.gameOverUnder} (${r.game.provider})`) : null,
        r.weather ? h("div", {}, r.weather.summary) : null,
        num(r.espnProj) && r.source !== "espn" ? h("div", {}, `ESPN projects ${r.espnProj.toFixed(1)}`) : null));
    }
    btn.onclick = () => { expanded.has(key) ? expanded.delete(key) : expanded.add(key); render(true); };
    return btn;
  }
  function freshness(data) {
    if (!data) return { cls: "none", text: "No projections loaded" };
    const age = (Date.now() - Date.parse(data.updatedAt)) / 60000;
    const ago = age < 1 ? "just now" : age < 60 ? `${Math.round(age)}m ago` : age < 1440 ? `${Math.round(age / 60)}h ago` : `${Math.round(age / 1440)}d ago`;
    return { cls: age > 24 * 60 ? "stale" : "", text: `Updated ${ago}` };
  }
  function header(title, data, wk) {
    titleEl.textContent = title;
    const f = freshness(data);
    subEl.replaceChildren(h("span", { class: `dot ${f.cls}` }), `${season()} · Week ${wk ?? "?"} · ${f.text}`);
  }
  function baseAlerts(data, wk) {
    const out = [];
    if (notice) out.push(h("div", { class: `alert ${notice.tone}` }, h("b", {}, notice.title), notice.text));
    if (data && Date.now() - Date.parse(data.updatedAt) > 24 * 3600000) out.push(h("div", { class: "alert warn" }, h("b", {}, "Projections are over a day old"), "Refresh before kickoff, since lines move."));
    if (!data && wk) out.push(h("div", { class: "alert info" }, h("b", {}, `No Vegas data for Week ${wk} yet`), "Kickers and defenses still get estimates; click refresh to load player props."));
    return out;
  }

  // ---------- My Team ----------
  function readRoster() {
    const scope = document.querySelector('[aria-label="Lineup"], .Roster');
    if (!scope) return [];
    const seen = new Set();
    return Array.from(scope.querySelectorAll("tbody tr")).map(D.readRow).filter(r => {
      if (!r || r.empty) return false;
      const key = r.espnId || W.normalize(r.name);
      if (seen.has(key)) return false;
      seen.add(key); return true;
    });
  }
  function leagueKey(wk) { return `${new URL(location.href).searchParams.get("leagueId")}:${season()}:${wk}`; }
  function renderTeam() {
    const wk = week();
    const { data, ctx } = context(wk);
    header("My lineup", data, wk);
    const leagueId = new URL(location.href).searchParams.get("leagueId");
    const myName = document.title.split(" Clubhouse")[0].trim();
    if (leagueId && myName && myTeams[leagueId] !== myName && !/Fantasy Football/i.test(myName)) { myTeams = { ...myTeams, [leagueId]: myName }; chrome.storage.local.set({ weeklyVegasMyTeams: myTeams }); }
    const rows = readRoster().map(identity => E.project(identity, ctx));
    if (!rows.length) {
      alertsEl.replaceChildren(...baseAlerts(data, wk));
      heroEl.replaceChildren(); listEl.replaceChildren(h("div", { class: "empty" }, "Waiting for ESPN's lineup table…"));
      footEl.textContent = ""; return;
    }
    const starters = rows.filter(r => E.SLOTS[String(r.slot).toUpperCase()]);
    const bench = rows.filter(r => E.isBench(r.slot));
    const ir = rows.filter(r => E.isIR(r.slot));
    const odds = winProbs[leagueKey(wk)];
    const tilt = E.tiltFor(strategy, odds?.prob);
    const plan = E.optimize(rows, tilt);
    const maxPlan = tilt ? E.optimize(rows, 0) : plan;

    // Alerts: Out/inactive starters first, they cost the most.
    const alerts = baseAlerts(data, wk);
    for (const r of starters.filter(r => r.out && !r.locked)) {
      const sub = plan.moves.start.find(m => E.SLOTS[m.slot]?.includes(r.position) || m.slot === String(r.slot).toUpperCase());
      alerts.unshift(h("div", { class: "alert bad" }, h("b", {}, `${r.name} is ${r.status || "out"} and in your lineup`), sub ? `Best replacement: ${sub.row.name} (${fmt(sub.row.points)} pts).` : "No healthy replacement on your bench; check waivers."));
      if (alertsBox.checked) chrome.runtime.sendMessage({ type: "got-weekly:notify", id: `out:${season()}:${wk}:${r.name}`, title: `${r.name} is ${r.status || "out"}`, message: sub ? `He's in your lineup. Best replacement: ${sub.row.name} (${fmt(sub.row.points)} pts).` : "He's in your lineup and you have no healthy bench replacement.", url: location.href }).catch(() => {});
    }
    for (const r of starters.filter(r => r.risky && !r.locked && !r.out)) {
      // After the 1 PM ET slate starts, only players in later games can be swapped in.
      const etHour = r.kickoff ? Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", hourCycle: "h23" }).format(new Date(r.kickoff))) : 0;
      const late = etHour >= 16 ? " His game is late, so keep a bench option from a game at the same time or later in case he's ruled out." : "";
      alerts.push(h("div", { class: "alert warn" }, h("b", {}, `${r.name} is ${r.status === "Q" ? "questionable" : "doubtful"}`), `Check the inactive list ~90 min before kickoff.${late}`));
    }
    if (data && starters.some(r => r.source === "espn")) alerts.push(h("div", { class: "alert info" }, `${starters.filter(r => r.source === "espn").length} starter(s) use ESPN's projection because Vegas lines aren't posted yet.`));
    alertsEl.replaceChildren(...alerts);

    // Hero: current vs optimal, strategy and win odds.
    const strategyLabel = { auto: "Auto", max: "Max points", safe: "Safe", upside: "Upside" };
    const seg = h("div", { class: "seg", role: "group", "aria-label": "Lineup strategy" }, ...Object.entries(strategyLabel).map(([k, label]) =>
      h("button", { type: "button", "aria-pressed": String(strategy === k), onclick: () => { strategy = k; chrome.storage.local.set({ weeklyVegasStrategy: k }); render(true); } }, label)));
    const why = strategy === "auto" ? (num(odds?.prob) ? (tilt < 0 ? "you're favored, so it favors steady players" : tilt > 0 ? "you're the underdog, so it favors boom-or-bust players" : "it's a close matchup, so it maximizes points") : "maximizes points until you open your matchup page once to get win odds") : strategy === "safe" ? "favors steady players" : strategy === "upside" ? "favors boom-or-bust players" : "maximizes projected points";
    const moves = plan.moves.start.length || plan.moves.bench.length;
    heroEl.replaceChildren(
      h("div", { class: "totals" },
        h("div", {}, h("div", { class: "label" }, "Projected starters"), h("div", { class: "big" }, fmt(plan.currentTotal), h("small", {}, "pts"))),
        num(odds?.prob) ? h("div", { style: "text-align:right" }, h("div", { class: "label" }, `vs ${odds.opponent}`), h("div", { class: "big", style: `color:${odds.prob >= 0.5 ? "var(--accent)" : "var(--bad)"}` }, `${Math.round(odds.prob * 100)}%`, h("small", {}, "to win"))) : null),
      moves ? h("div", { class: "moves" },
        h("div", {}, h("b", {}, tilt < 0 ? "Steadier lineup: " : tilt > 0 ? "Higher-ceiling lineup: " : "Better lineup: "), h("span", { class: "gain" }, `${plan.gain >= 0 ? "+" : ""}${plan.gain.toFixed(1)} pts`), plan !== maxPlan ? h("span", { class: "src" }, ` (max-points lineup: +${maxPlan.gain.toFixed(1)})`) : null),
        h("ul", {}, ...plan.moves.start.map(m => h("li", {}, h("span", { class: "tag in" }, "Start"), `${m.row.name} (${m.row.position === "DST" ? "D/ST" : m.row.position}) · ${fmt(m.row.points)}`)),
          ...plan.moves.bench.map(r => h("li", {}, h("span", { class: "tag out" }, "Bench"), `${r.name} · ${r.out ? r.status || "Out" : fmt(r.points)}`))))
        : h("div", { class: "ok" }, "Your lineup is already the best one for this strategy."),
      h("div", { class: "strategy" }, "Strategy", seg),
      h("div", { class: "src", style: "margin-top:4px" }, `This strategy ${why}.`));

    listEl.replaceChildren(
      h("div", { class: "section" }, h("span", {}, "Starters"), h("span", {}, fmt(plan.currentTotal))), ...starters.map(r => playerRow(r)),
      bench.length ? h("div", { class: "section" }, h("span", {}, "Bench")) : null, ...bench.map(r => playerRow(r, { slot: "BN" })),
      ir.length ? h("div", { class: "section" }, h("span", {}, "IR")) : null, ...ir.map(r => playerRow(r, { dim: true })));
    footEl.textContent = "Tap a player for details. K and D/ST are estimates from betting lines. Nothing is changed on ESPN for you.";
    updatePill(`${fmt(plan.currentTotal)}${moves ? ` · +${plan.gain.toFixed(1)} available` : ""}`);

    // Hand the starters' kickoff times to the background worker for pre-game inactive alerts.
    const current = autoBox.checked ? Number(weekSelect.value) : wk;
    if (wk === current) {
      const ping = JSON.stringify([alertsBox.checked, starters.map(r => [r.name, r.kickoff])]);
      if (ping !== lastRosterPing) {
        lastRosterPing = ping;
        chrome.runtime.sendMessage({ type: "got-weekly:roster", teamUrl: location.href, starters: starters.filter(r => !r.bye && r.kickoff).map(r => ({ name: r.name, kickoff: r.kickoff })) }).catch(() => {});
      }
    }
  }

  // ---------- Matchup ----------
  function renderMatchup() {
    const teams = globalThis.WeeklyVegasMatchup.read(document);
    const wk = teams[0]?.week || week();
    const { data, ctx } = context(wk);
    header("Matchup", data, wk);
    const alerts = baseAlerts(data, wk);
    if (teams.length !== 2) {
      alertsEl.replaceChildren(...alerts); heroEl.replaceChildren();
      listEl.replaceChildren(h("div", { class: "empty" }, "Waiting for ESPN's two lineup tables…")); footEl.textContent = ""; return;
    }
    const [a, b] = teams.map(t => globalThis.WeeklyVegasMatchup.summarize(t, ctx));
    const p = E.winProbability(a, b);
    const leagueId = new URL(location.href).searchParams.get("leagueId");
    const mine = [a, b].findIndex(t => t.name === myTeams[leagueId]);
    if (mine >= 0) {
      const key = `${leagueId}:${season()}:${wk}`, prob = mine === 0 ? p : 1 - p, opponent = (mine === 0 ? b : a).name;
      if (Math.abs((winProbs[key]?.prob ?? -1) - prob) > 0.005) { winProbs = { ...winProbs, [key]: { prob, opponent, at: Date.now() } }; chrome.storage.local.set({ weeklyVegasWinProb: winProbs }); }
    }
    const missing = a.missing + b.missing;
    if (missing) alerts.push(h("div", { class: "alert warn" }, `${missing} starter(s) have no projection yet, so the odds are rough.`));
    alertsEl.replaceChildren(...alerts);
    heroEl.replaceChildren(
      h("div", { class: "vs" },
        h("div", {}, h("div", { class: "name" }, a.name), h("div", { class: "big" }, fmt(a.mean))),
        h("div", { class: "label" }, "vs"),
        h("div", { class: "r" }, h("div", { class: "name" }, b.name), h("div", { class: "big" }, fmt(b.mean)))),
      h("div", { class: "bar", role: "img", "aria-label": `${a.name} ${Math.round(p * 100)}% to win` }, h("span", { style: `width:${(p * 100).toFixed(1)}%` })),
      h("div", { class: "vs" }, h("div", { class: "gain" }, `${Math.round(p * 100)}% to win`), h("span"), h("div", { class: "r", style: "color:var(--bad);font-weight:700" }, `${Math.round((1 - p) * 100)}%`)),
      mine >= 0 ? h("div", { class: "src", style: "margin-top:6px" }, (mine === 0 ? p : 1 - p) >= 0.65 ? "You're favored: on My Team, Auto strategy will lean on steady players." : (mine === 0 ? p : 1 - p) <= 0.35 ? "You're the underdog: on My Team, Auto strategy will chase upside." : "Close one: Auto strategy will maximize projected points.") : null);
    listEl.replaceChildren(...[a, b].flatMap(t => [
      h("div", { class: "section" }, h("span", {}, t.name), h("span", {}, `${fmt(t.mean)} · ${t.covered}/${t.count}`)),
      ...t.players.map(r => playerRow(r, { key: `${t.name}:${r.name}` }))]));
    footEl.textContent = "Starters only. Win odds use projections and typical game-to-game swings; they're estimates, not a betting line.";
    updatePill(`${Math.round(p * 100)}% · ${a.name}`);
  }

  // ---------- Waivers ----------
  function renderWaivers() {
    const wk = week();
    const { data, ctx } = context(wk);
    header("Waiver wire", data, wk);
    const loaded = globalThis.WeeklyVegasWaivers.read(document);
    const players = globalThis.WeeklyVegasWaivers.rank(loaded, ctx, { position: waiverPosition, sort: waiverSort });
    alertsEl.replaceChildren(...baseAlerts(data, wk));
    const positions = [["ALL", "All"], ["STREAM", "Streamers"], ["QB", "QB"], ["RB", "RB"], ["WR", "WR"], ["TE", "TE"], ["K", "K"], ["DST", "D/ST"]];
    const seg = h("div", { class: "seg", role: "group", "aria-label": "Position" }, ...positions.map(([k, label]) =>
      h("button", { type: "button", "aria-pressed": String(waiverPosition === k), onclick: () => { waiverPosition = k; render(true); } }, label)));
    const sort = h("select", { "aria-label": "Sort by", onchange: (e) => { waiverSort = e.target.value; render(true); } },
      h("option", { value: "points" }, "Projected points"), h("option", { value: "ceiling" }, "Ceiling (boom weeks)"), h("option", { value: "teamTotal" }, "Team implied total"));
    sort.value = waiverSort;
    heroEl.replaceChildren(h("div", { class: "controls", style: "padding:0" }, seg, h("label", {}, "Sort by", sort)));
    listEl.replaceChildren(
      h("div", { class: "section" }, h("span", {}, `${players.length} of ${loaded.length} loaded players`), h("span", {}, "pts")),
      ...players.map((r, i) => playerRow({ ...r, status: r.status }, { slot: `#${i + 1}`, key: `w:${r.name}` })));
    footEl.textContent = "Ranks the players loaded on this ESPN page; use ESPN's filters or next page to see more. Streamers = QB, TE, K and D/ST.";
    if (!loaded.length) listEl.replaceChildren(h("div", { class: "empty" }, "Waiting for ESPN's player list…"));
    updatePill("Waivers");
  }

  function updatePill(text) { pill.querySelector("#pilltext").textContent = `Vegas · ${text}`; }

  // ---------- Render loop ----------
  function render(force = false) {
    host.hidden = !PAGES.test(location.pathname);
    if (host.hidden) return;
    const page = location.pathname.includes("/boxscore") ? "matchup" : location.pathname.includes("/players/add") ? "waivers" : "team";
    const fp = JSON.stringify([location.href, page, week(), season(), Object.keys(datasets).length, datasets[`${season()}:${week()}`]?.updatedAt, Math.floor(Date.now() / 60000),
      document.querySelector('[aria-label="Lineup"], .Roster, .matchup-pregame-tables, .boxscore-overview, .players-table, table tbody')?.textContent?.length]);
    if (!force && fp === lastFingerprint) return;
    lastFingerprint = fp;
    try {
      if (page === "matchup") renderMatchup(); else if (page === "waivers") renderWaivers(); else renderTeam();
    } catch (error) {
      alertsEl.replaceChildren(h("div", { class: "alert bad" }, h("b", {}, "Something went wrong"), error.message));
    }
  }
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.weeklyVegasDatasets) datasets = changes.weeklyVegasDatasets.newValue || {};
    if (changes.weeklyVegasCalendar) calendar = changes.weeklyVegasCalendar.newValue?.calendar || null;
    if (changes.weeklyVegasWeather) weather = changes.weeklyVegasWeather.newValue || {};
    if (changes.weeklyVegasWinProb) winProbs = changes.weeklyVegasWinProb.newValue || {};
    if (changes.weeklyVegasDatasets || changes.weeklyVegasCalendar || changes.weeklyVegasWeather || changes.weeklyVegasWinProb) render(true);
  });
  document.body.append(host);
  render(true);
  checkAutomatic();
  document.addEventListener("visibilitychange", () => { if (!document.hidden) { nextAuto = 0; checkAutomatic(); } });
  window.addEventListener("focus", () => { nextAuto = 0; checkAutomatic(); });
  // ESPN swaps rows and navigates without full page loads.
  let scheduled = false;
  new MutationObserver(() => { if (scheduled) return; scheduled = true; setTimeout(() => { scheduled = false; render(); }, 300); }).observe(document.body, { childList: true, subtree: true, characterData: true });
  setInterval(() => { render(); checkAutomatic(); }, 30000);
})();
