// Turns a date phrase from the user ("yesterday", "last Tuesday", "3 November") into an exact
// time range. This runs in code, not in the model, because models are unreliable at calendar
// arithmetic. The current time and the user's time zone are passed in, so tests can fix both.

export type DateRange = {
  // Start of the range (inclusive) and end (exclusive), as real instants.
  from: Date;
  to: Date;
  // Human-readable description of what was resolved, e.g. "Tuesday 3 November 2026".
  label: string;
};

export type ResolveResult = { ok: true; range: DateRange } | { ok: false; reason: string };

export type ResolveOptions = { now: Date; timeZone: string };

// A calendar date with no time zone attached.
type Civil = { y: number; m: number; d: number };

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const MONTH_NAMES = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];
const MONTH_ABBREVIATIONS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

const SUPPORTED =
  'Try "today", "yesterday", "last Tuesday", "3 November", "3 days ago", "last week", "this month" or "2026-11-03".';

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

// ---- calendar helpers (no time zones) ----

function addDays(c: Civil, n: number): Civil {
  const dt = new Date(Date.UTC(c.y, c.m - 1, c.d + n));
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

function dayOfWeek(c: Civil): number {
  return new Date(Date.UTC(c.y, c.m - 1, c.d)).getUTCDay();
}

function isRealDate(c: Civil): boolean {
  const dt = new Date(Date.UTC(c.y, c.m - 1, c.d));
  return dt.getUTCFullYear() === c.y && dt.getUTCMonth() === c.m - 1 && dt.getUTCDate() === c.d;
}

function isAfter(a: Civil, b: Civil): boolean {
  return a.y !== b.y ? a.y > b.y : a.m !== b.m ? a.m > b.m : a.d > b.d;
}

// Weeks start on Monday.
function weekStart(c: Civil): Civil {
  return addDays(c, -((dayOfWeek(c) + 6) % 7));
}

function monthStart(y: number, m: number): Civil {
  // Normalises month overflow, e.g. month 13 becomes January of the next year.
  const dt = new Date(Date.UTC(y, m - 1, 1));
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: 1 };
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatDay(c: Civil): string {
  return `${capitalise(WEEKDAYS[dayOfWeek(c)])} ${c.d} ${capitalise(MONTH_NAMES[c.m - 1])} ${c.y}`;
}

function formatShort(c: Civil): string {
  return `${c.d} ${capitalise(MONTH_NAMES[c.m - 1]).slice(0, 3)} ${c.y}`;
}

// ---- time zone helpers ----

function partsInZone(instant: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { y: get("year"), m: get("month"), d: get("day"), h: get("hour"), min: get("minute"), s: get("second") };
}

function civilInZone(instant: Date, timeZone: string): Civil {
  const { y, m, d } = partsInZone(instant, timeZone);
  return { y, m, d };
}

// How far the zone's wall clock is ahead of UTC at this instant.
function offsetMs(instant: Date, timeZone: string): number {
  const p = partsInZone(instant, timeZone);
  const wallAsUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s);
  return wallAsUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

// The instant at which this calendar day starts in the zone. Looks the offset up twice so days
// next to a daylight-saving change still land on local midnight.
function startOfDay(c: Civil, timeZone: string): Date {
  const wallAsUtc = Date.UTC(c.y, c.m - 1, c.d);
  const first = wallAsUtc - offsetMs(new Date(wallAsUtc), timeZone);
  const second = wallAsUtc - offsetMs(new Date(first), timeZone);
  return new Date(second);
}

// ---- ranges ----

// `last` is the final day included in the range.
function between(first: Civil, last: Civil, timeZone: string, label: string): ResolveResult {
  return {
    ok: true,
    range: { from: startOfDay(first, timeZone), to: startOfDay(addDays(last, 1), timeZone), label },
  };
}

function oneDay(c: Civil, timeZone: string): ResolveResult {
  return between(c, c, timeZone, formatDay(c));
}

function weekOf(c: Civil, timeZone: string): ResolveResult {
  const first = weekStart(c);
  const last = addDays(first, 6);
  return between(first, last, timeZone, `Week of ${formatShort(first)} to ${formatShort(last)}`);
}

function monthOf(y: number, m: number, timeZone: string): ResolveResult {
  const first = monthStart(y, m);
  const last = addDays(monthStart(y, m + 1), -1);
  return between(first, last, timeZone, `${capitalise(MONTH_NAMES[first.m - 1])} ${first.y}`);
}

function yearOf(y: number, timeZone: string): ResolveResult {
  return between({ y, m: 1, d: 1 }, { y, m: 12, d: 31 }, timeZone, String(y));
}

// ---- parsing ----

const SMALL_NUMBERS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
};

function toNumber(word: string): number {
  return SMALL_NUMBERS[word] ?? Number(word);
}

function monthNumber(word: string): number | undefined {
  const full = MONTH_NAMES.indexOf(word);
  if (full >= 0) return full + 1;
  return MONTH_ABBREVIATIONS[word];
}

function normalise(phrase: string): string {
  let s = phrase.toLowerCase().replace(/[,?!]/g, " ").replace(/\s+/g, " ").trim().replace(/\.$/, "");
  // Drop leading filler such as "on", "in", "the".
  for (let prev = ""; prev !== s; ) {
    prev = s;
    s = s.replace(/^(on|in|during|from|at|the|that|back on)\s+/, "");
  }
  return s.trim();
}

// The most recent real occurrence of day/month that is not after today.
function latestPast(m: number, d: number, today: Civil): Civil | undefined {
  for (let y = today.y; y >= today.y - 8; y--) {
    const c = { y, m, d };
    if (isRealDate(c) && !isAfter(c, today)) return c;
  }
  return undefined;
}

export function resolveWhen(phrase: string, { now, timeZone }: ResolveOptions): ResolveResult {
  const today = civilInZone(now, timeZone);
  const s = normalise(phrase);
  let m: RegExpMatchArray | null;

  const fail = (reason: string): ResolveResult => ({ ok: false, reason });

  if (s === "today") return oneDay(today, timeZone);
  if (s === "yesterday") return oneDay(addDays(today, -1), timeZone);
  if (s === "day before yesterday") return oneDay(addDays(today, -2), timeZone);

  if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/))) {
    const c = { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
    return isRealDate(c) ? oneDay(c, timeZone) : fail(`"${phrase}" is not a real calendar date.`);
  }

  if ((m = s.match(/^(\d+|an?|one|two|three|four|five|six|seven|eight|nine|ten) (day|week|month)s? ago$/))) {
    const n = toNumber(m[1]);
    if (m[2] === "day") return oneDay(addDays(today, -n), timeZone);
    if (m[2] === "week") return weekOf(addDays(today, -7 * n), timeZone);
    const first = monthStart(today.y, today.m - n);
    return monthOf(first.y, first.m, timeZone);
  }

  // "last 7 days" runs from 7 days ago up to and including today.
  if ((m = s.match(/^(?:last|past) (\d+) days$/))) {
    const n = Number(m[1]);
    return between(addDays(today, -n), today, timeZone, `${formatShort(addDays(today, -n))} to ${formatShort(today)}`);
  }

  if ((m = s.match(/^(this|last|past) (week|month|year)$/))) {
    const back = m[1] === "this" ? 0 : 1;
    if (m[2] === "week") return weekOf(addDays(today, -7 * back), timeZone);
    if (m[2] === "month") {
      const first = monthStart(today.y, today.m - back);
      return monthOf(first.y, first.m, timeZone);
    }
    return yearOf(today.y - back, timeZone);
  }

  // "Tuesday", "last Tuesday": the most recent such day before today.
  // "this Tuesday": that day within the current Monday-to-Sunday week.
  if ((m = s.match(/^(?:(this|last|past) )?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)$/))) {
    const target = WEEKDAYS.indexOf(m[2]);
    if (m[1] === "this") return oneDay(addDays(weekStart(today), (target + 6) % 7), timeZone);
    const back = (dayOfWeek(today) - target + 7) % 7 || 7;
    return oneDay(addDays(today, -back), timeZone);
  }

  // "3 November", "3rd of November 2025", "Nov 3", "November 3rd, 2025".
  const dayFirst = s.match(/^(\d{1,2})(?:st|nd|rd|th)?(?: of)? ([a-z]+)(?: (\d{4}))?$/);
  const monthFirst = s.match(/^([a-z]+) (\d{1,2})(?:st|nd|rd|th)?(?: (\d{4}))?$/);
  const dm = dayFirst
    ? { day: Number(dayFirst[1]), month: monthNumber(dayFirst[2]), year: dayFirst[3] }
    : monthFirst
      ? { day: Number(monthFirst[2]), month: monthNumber(monthFirst[1]), year: monthFirst[3] }
      : null;
  if (dm?.month) {
    if (dm.year) {
      const c = { y: Number(dm.year), m: dm.month, d: dm.day };
      return isRealDate(c) ? oneDay(c, timeZone) : fail(`"${phrase}" is not a real calendar date.`);
    }
    // No year given: assume the most recent such date up to today.
    const c = latestPast(dm.month, dm.day, today);
    return c ? oneDay(c, timeZone) : fail(`"${phrase}" is not a real calendar date.`);
  }

  // "October", "October 2025": the whole month. Without a year, the most recent one up to now.
  if ((m = s.match(/^([a-z]+)(?: (\d{4}))?$/))) {
    const month = monthNumber(m[1]);
    if (month) {
      const year = m[2] ? Number(m[2]) : month <= today.m ? today.y : today.y - 1;
      return monthOf(year, month, timeZone);
    }
  }

  if ((m = s.match(/^(\d{4})$/))) return yearOf(Number(m[1]), timeZone);

  return fail(`Could not understand the date "${phrase}". ${SUPPORTED}`);
}
