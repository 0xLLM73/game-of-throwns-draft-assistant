(function (root) {
  "use strict";
  function seasonAt(now = Date.now()) {
    const date = new Date(now);
    return date.getUTCMonth() < 3 ? date.getUTCFullYear() - 1 : date.getUTCFullYear();
  }
  function build(payload, season) {
    const calendar = payload.leagues?.[0]?.calendar?.find(c => String(c.value) === "2");
    if (!calendar || new Date(calendar.startDate).getUTCFullYear() !== season || calendar.entries?.length !== 18 || !Number.isFinite(Date.parse(calendar.endDate))) throw Error("ESPN season calendar is unavailable.");
    const eastern = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", hour: "numeric", hourCycle: "h23" });
    const weeks = calendar.entries.map(entry => {
      const week = Number(entry.value);
      const games = (payload.events || []).filter(e => e.season?.year === season && e.season?.type === 2 && e.week?.number === week);
      const monday = games.filter(e => {
        if (!Number.isFinite(Date.parse(e.date)) || e.competitions?.[0]?.timeValid === false) return false;
        const parts = eastern.formatToParts(new Date(e.date));
        return parts.find(p => p.type === "weekday")?.value === "Mon" && Number(parts.find(p => p.type === "hour")?.value) >= 17;
      }).map(e => Date.parse(e.date)).sort((a, b) => a - b);
      const end = Date.parse(entry.endDate);
      const rolloverAt = monday[0] ?? end;
      if (!Number.isFinite(rolloverAt) || !Number.isInteger(week) || week < 1 || week > 18) throw Error("Invalid ESPN week boundary.");
      return { week, rolloverAt, boundary: monday.length ? "first Monday-night kickoff" : "ESPN week end (no Monday-night kickoff scheduled)" };
    }).sort((a, b) => a.week - b.week);
    if (weeks.some((w, i) => w.week !== i + 1 || (i && w.rolloverAt <= weeks[i - 1].rolloverAt))) throw Error("ESPN week boundaries are inconsistent.");
    return { season, weeks, endsAt: Date.parse(calendar.endDate) };
  }
  function select(calendar, now = Date.now()) {
    const current = calendar.weeks.find(w => now < w.rolloverAt) || calendar.weeks.at(-1);
    return { season: calendar.season, week: current.week, rolloverAt: current.rolloverAt, boundary: current.boundary, ended: now >= calendar.endsAt };
  }
  root.WeeklyVegasCalendar = { seasonAt, build, select };
})(globalThis);
