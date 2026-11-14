(function (root) {
  "use strict";
  // Coordinates for open-air venues only. Domes and SoFi's covered field don't need a forecast.
  const VENUES = {
    "Tom Benson Hall of Fame Stadium": [40.8206, -81.3986], "Paycor Stadium": [39.0955, -84.5161], "Acrisure Stadium": [40.4468, -80.0158],
    "Gillette Stadium": [42.0909, -71.2643], "Levi's Stadium": [37.403, -121.97], "MetLife Stadium": [40.8135, -74.0745],
    "Northwest Stadium": [38.9078, -76.8645], "Highmark Stadium": [42.7738, -78.787], "Soldier Field": [41.8623, -87.6167],
    "Arrowhead Stadium": [39.0489, -94.4839], "GEHA Field at Arrowhead Stadium": [39.0489, -94.4839], "M&T Bank Stadium": [39.278, -76.6227],
    "Lumen Field": [47.5952, -122.3316], "EverBank Stadium": [30.3239, -81.6373], "Empower Field at Mile High": [39.7439, -105.0201],
    "Huntington Bank Field": [41.5061, -81.6995], "Hard Rock Stadium": [25.958, -80.2389], "Raymond James Stadium": [27.9759, -82.5033],
    "Nissan Stadium": [36.1665, -86.7713], "Bank of America Stadium": [35.2258, -80.8528], "Lambeau Field": [44.5013, -88.0622],
    "Lincoln Financial Field": [39.9008, -75.1675], "Melbourne Cricket Ground": [-37.82, 144.9834], "Maracanã Stadium": [-22.9122, -43.2302],
    "Tottenham Hotspur Stadium": [51.6043, -0.0664], "Wembley Stadium": [51.556, -0.2796], "Stade de France": [48.9245, 2.3602],
    "FC Bayern Munich Stadium": [48.2188, 11.6247], "Allianz Arena": [48.2188, 11.6247], "Estadio Banorte": [19.3029, -99.1505], "Estadio Azteca": [19.3029, -99.1505],
  };
  const HOUR = 3600000;

  // games: { TEAM: game } for one week. Returns { TEAM: { windMph, gustMph, precipProb, precipIn, tempF } }.
  async function fetchForWeek(games, now = Date.now()) {
    const targets = new Map();
    for (const game of Object.values(games)) {
      const coords = VENUES[game.venue];
      const kickoff = Date.parse(game.kickoff);
      // Open-Meteo forecasts 16 days out; skip finished games and domes.
      if (game.indoor || !coords || !Number.isFinite(kickoff) || kickoff < now - 4 * HOUR || kickoff > now + 15 * 24 * HOUR) continue;
      if (!targets.has(game.id)) targets.set(game.id, { coords, kickoff, teams: [] });
      targets.get(game.id).teams.push(game.team);
    }
    if (!targets.size) return {};
    const list = [...targets.values()];
    const day = (ms) => new Date(ms).toISOString().slice(0, 10);
    const start = day(Math.min(...list.map(t => t.kickoff))), end = day(Math.max(...list.map(t => t.kickoff)) + 4 * HOUR);
    const params = new URLSearchParams({
      latitude: list.map(t => t.coords[0]).join(","), longitude: list.map(t => t.coords[1]).join(","),
      hourly: "temperature_2m,precipitation_probability,precipitation,wind_speed_10m,wind_gusts_10m",
      wind_speed_unit: "mph", temperature_unit: "fahrenheit", precipitation_unit: "inch", timezone: "UTC", start_date: start, end_date: end,
    });
    const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, { credentials: "omit", cache: "no-store", signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw Error(`Weather HTTP ${response.status}`);
    let body = await response.json();
    if (!Array.isArray(body)) body = [body];
    const out = {};
    list.forEach((target, i) => {
      const hourly = body[i]?.hourly;
      if (!hourly?.time) return;
      // Average over the ~3 hours the game is played.
      const idx = hourly.time.map((t, j) => [Date.parse(`${t}Z`), j]).filter(([t]) => t >= target.kickoff - HOUR / 2 && t <= target.kickoff + 3 * HOUR).map(([, j]) => j);
      if (!idx.length) return;
      const avg = (key) => { const v = idx.map(j => hourly[key]?.[j]).filter(Number.isFinite); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
      const max = (key) => { const v = idx.map(j => hourly[key]?.[j]).filter(Number.isFinite); return v.length ? Math.max(...v) : null; };
      const sum = (key) => { const v = idx.map(j => hourly[key]?.[j]).filter(Number.isFinite); return v.length ? v.reduce((a, b) => a + b, 0) : null; };
      const wx = { windMph: avg("wind_speed_10m"), gustMph: max("wind_gusts_10m"), precipProb: max("precipitation_probability"), precipIn: sum("precipitation"), tempF: avg("temperature_2m") };
      for (const team of target.teams) out[team] = wx;
    });
    return out;
  }
  root.WeeklyVegasWeather = { VENUES, fetchForWeek };
})(globalThis);
