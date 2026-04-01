const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

loadDotEnv(path.join(__dirname, ".env"));

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 4173);
const CALENDAR_ID = process.env.GCAL_CALENDAR_ID || "gislavedsff@gmail.com";
const ICS_URL =
  process.env.GCAL_ICS_URL ||
  `https://calendar.google.com/calendar/ical/${encodeURIComponent(CALENDAR_ID)}/public/basic.ics`;
const SECONDARY_ICS_URL = process.env.GCAL_SECONDARY_ICS_URL || process.env.GCAL_WORSHIP_ICS_URL || "";

function loadDotEnv(filePath) {
  try {
    if (!fs.existsSync(filePath)) return;
    const content = fs.readFileSync(filePath, "utf8");
    const lines = content.split(/\r?\n/);

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const idx = trimmed.indexOf("=");
      if (idx < 1) continue;
      const key = trimmed.slice(0, idx).trim();
      const rawValue = trimmed.slice(idx + 1).trim();
      const value = rawValue.replace(/^['"]|['"]$/g, "");
      if (!(key in process.env)) {
        process.env[key] = value;
      }
    }
  } catch (_error) {
    // Ignore .env parsing errors and continue with process env.
  }
}

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

const PUBLIC_FILES = new Set([
  "/",
  "/index.html",
  "/print.html",
  "/styles.css",
  "/app.js",
  "/gff_logga.jpg",
  "/data/bibleBooks.js",
  "/data/hymnCatalog.js",
  "/data/bible2000.js",
  "/data/songs.js"
]);

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(payload));
}

function sendFile(reqPath, res) {
  const effectivePath = reqPath === "/" ? "/index.html" : reqPath;
  if (!PUBLIC_FILES.has(effectivePath)) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }

  const filePath = path.join(ROOT, effectivePath.replace(/^\//, ""));
  const ext = path.extname(filePath).toLowerCase();
  const mime = MIME_TYPES[ext] || "application/octet-stream";

  fs.readFile(filePath, (error, buffer) => {
    if (error) {
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("File error");
      return;
    }

    res.writeHead(200, {
      "Content-Type": mime,
      "Cache-Control": "no-cache"
    });
    res.end(buffer);
  });
}

function isValidIsoDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function extractServiceGroupName(summary) {
  const text = String(summary || "").trim();
  if (!/^Servicegrupp\b/i.test(text)) return "";

  const withoutPrefix = text.replace(/^Servicegrupp\b/i, "").trim();
  const maybeAfterColon = withoutPrefix.includes(":") ? withoutPrefix.split(":").slice(1).join(":") : withoutPrefix;
  const cleaned = maybeAfterColon.replace(/^\s*\d+\s*/, "").replace(/^[-:]\s*/, "").trim();
  return cleaned;
}

function parseRoleAssignmentsFromSummary(summary) {
  const text = String(summary || "").trim();
  const assignments = {};
  if (!text) return assignments;

  const labelMap = {
    Ljudansvarig: "Ljudtekniker kyrksal",
    Skärm: "Projektoransvarig",
    Video: "Videoinspelning",
    Inspelningsmixer: "Ljudtekniker inspelning",
    Predikan: "Predikant",
    Psalmer: "Organist",
    "Psalmer och sånger": "Organist",
    Förebedjare: "Förebedjare"
  };

  const re = /(Ljudansvarig|Skärm|Video|Inspelningsmixer|Predikan|Psalmer(?:\s+och\s+sånger)?|Förebedjare)\s*[:\-]\s*/gi;
  const matches = [...text.matchAll(re)];

  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const label = match[1];
    const roleName = labelMap[label];
    if (!roleName) continue;

    const start = (match.index || 0) + match[0].length;
    const end = index + 1 < matches.length ? matches[index + 1].index || text.length : text.length;
    const value = text
      .slice(start, end)
      .replace(/,\s*$/g, "")
      .trim();

    if (value) {
      assignments[roleName] = value;
    }
  }

  const serviceGroup = extractServiceGroupName(text);
  if (serviceGroup) {
    assignments.Servicegruppansvarig = serviceGroup;
  }

  return assignments;
}

function parseRoleAssignmentsFromDescription(description) {
  const text = String(description || "")
    .replace(/\u00a0/g, " ")
    .trim();
  const assignments = {};
  if (!text) return assignments;

  const labelMap = {
    Predikan: "Predikant",
    Psalmer: "Organist",
    "Psalmer och sånger": "Organist",
    Förebedjare: "Förebedjare",
    Ledning: "Mötesledare"
  };

  const normalizedText = text.replace(/\r/g, "");
  const lineRegex = /^\s*(Predikan|Psalmer(?:\s+och\s+sånger)?|Förebedjare|Ledning)\s*[:\-]\s*(.+?)\s*$/i;
  const lines = normalizedText
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    const match = line.match(lineRegex);
    if (!match) continue;
    const label = match[1];
    const roleName = labelMap[label] || labelMap[label.replace(/\s+/g, " ").trim()];
    const value = (match[2] || "").replace(/,\s*$/g, "").trim();
    if (roleName && value) {
      assignments[roleName] = value;
    }
  }

  return assignments;
}

function parseIcsDate(icsDate) {
  if (typeof icsDate !== "string") return "";
  const match = icsDate.match(/^(\d{4})(\d{2})(\d{2})/);
  if (!match) return "";
  return `${match[1]}-${match[2]}-${match[3]}`;
}

function parseIsoDateUtc(dateIso) {
  if (!isValidIsoDate(dateIso)) return null;
  const [year, month, day] = dateIso.split("-").map((v) => Number.parseInt(v, 10));
  return new Date(Date.UTC(year, month - 1, day));
}

function addDaysUtc(dateObj, days) {
  const next = new Date(dateObj.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function diffDaysUtc(startDate, endDate) {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((endDate.getTime() - startDate.getTime()) / msPerDay);
}

function parseRRule(rruleText) {
  const out = {};
  String(rruleText || "")
    .split(";")
    .forEach((part) => {
      const [rawKey, rawValue] = part.split("=");
      if (!rawKey || rawValue === undefined) return;
      out[rawKey.toUpperCase()] = rawValue;
    });
  return out;
}

function parseUntilToIso(untilValue) {
  if (!untilValue) return "";
  const compact = untilValue.replace(/T.*$/, "");
  return parseIcsDate(compact);
}

function dayCodeForUtcDate(dateObj) {
  return ["SU", "MO", "TU", "WE", "TH", "FR", "SA"][dateObj.getUTCDay()];
}

function isoFromUtcDate(dateObj) {
  const year = dateObj.getUTCFullYear();
  const month = String(dateObj.getUTCMonth() + 1).padStart(2, "0");
  const day = String(dateObj.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function eventRecurrenceCoversDate(event, dateIso) {
  const startIso = parseIcsDate(event.dtstart);
  const endIso = parseIcsDate(event.dtend);
  if (!startIso) return false;
  if (!event.rrule) return false;

  const startDate = parseIsoDateUtc(startIso);
  const fallbackEndIso = endIso || isoFromUtcDate(addDaysUtc(startDate || new Date(), 1));
  const endDate = parseIsoDateUtc(fallbackEndIso);
  const targetDate = parseIsoDateUtc(dateIso);
  if (!startDate || !endDate || !targetDate) return false;

  const durationDays = Math.max(1, diffDaysUtc(startDate, endDate));
  const rule = parseRRule(event.rrule);
  if ((rule.FREQ || "").toUpperCase() !== "WEEKLY") return false;

  const intervalWeeks = Math.max(1, Number.parseInt(rule.INTERVAL || "1", 10) || 1);
  const countLimit = Number.parseInt(rule.COUNT || "0", 10) || 0;
  const untilIso = parseUntilToIso(rule.UNTIL || "");
  const untilDate = untilIso ? parseIsoDateUtc(untilIso) : null;

  const byDays = (rule.BYDAY || dayCodeForUtcDate(startDate))
    .split(",")
    .map((v) => v.trim().toUpperCase())
    .filter(Boolean);
  const dayOffsets = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
  const baseWeekday = startDate.getUTCDay();

  let occurrencesSeen = 0;
  let weekCursor = new Date(startDate.getTime());
  const hardStop = addDaysUtc(targetDate, durationDays + 14);

  while (weekCursor <= hardStop) {
    for (const dayCodeRaw of byDays) {
      const dayCode = String(dayCodeRaw || "").slice(-2);
      const targetWday = dayOffsets[dayCode];
      if (targetWday === undefined) continue;

      const offsetDays = targetWday - baseWeekday;
      const occStart = addDaysUtc(weekCursor, offsetDays);
      if (occStart < startDate) continue;
      if (untilDate && occStart > untilDate) return false;

      occurrencesSeen += 1;
      if (countLimit > 0 && occurrencesSeen > countLimit) return false;

      const occEnd = addDaysUtc(occStart, durationDays);
      const occStartIso = isoFromUtcDate(occStart);
      const occEndIso = isoFromUtcDate(occEnd);
      if (occStartIso <= dateIso && dateIso < occEndIso) return true;
    }

    weekCursor = addDaysUtc(weekCursor, intervalWeeks * 7);
    if (untilDate && weekCursor > addDaysUtc(untilDate, durationDays)) break;
    if (countLimit > 0 && occurrencesSeen >= countLimit) break;
  }

  return false;
}

function decodeIcsText(text) {
  return String(text || "")
    .replace(/\\n/g, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\:/g, ":")
    .replace(/\\\\/g, "\\")
    .trim();
}

function stripHtmlTags(text) {
  return String(text || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .trim();
}

function getEventDetailsText(event) {
  const parts = [event.description, event.descriptionHtml, event.comment]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  return parts.join("\n");
}

function isLikelySundayServiceEvent(event, dateIso) {
  const summary = String(event.summary || "").toLowerCase();
  if (summary.includes("gudstjänst") || summary.includes("gudstjanst")) return true;

  const target = parseIsoDateUtc(dateIso);
  if (!target || target.getUTCDay() !== 0) return false;

  const startRaw = String(event.dtstart || "");
  if (!startRaw.includes("T")) return false;
  if (/T10\d{4}$/i.test(startRaw)) return true; // DTSTART;TZID=Europe/Stockholm:...T100000
  if (/T0[89]\d{4}Z$/i.test(startRaw)) return true; // 10:00 local in UTC depending on DST
  return false;
}

function parseIcsEvents(ics) {
  const unfolded = String(ics || "")
    .replace(/\r\n/g, "\n")
    .replace(/\n[ \t]/g, "");

  const lines = unfolded.split("\n");
  const events = [];
  let current = null;

  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      current = {};
      continue;
    }

    if (line === "END:VEVENT") {
      if (current) events.push(current);
      current = null;
      continue;
    }

    if (!current) continue;

    const sep = line.indexOf(":");
    if (sep < 1) continue;

    const rawKey = line.slice(0, sep);
    const value = line.slice(sep + 1);

    if (rawKey.startsWith("SUMMARY")) {
      current.summary = decodeIcsText(value);
      continue;
    }

    if (rawKey.startsWith("DESCRIPTION")) {
      current.description = decodeIcsText(value);
      continue;
    }

    if (rawKey.startsWith("X-ALT-DESC")) {
      current.descriptionHtml = stripHtmlTags(decodeIcsText(value));
      continue;
    }

    if (rawKey.startsWith("COMMENT")) {
      current.comment = decodeIcsText(value);
      continue;
    }

    if (rawKey.startsWith("DTSTART")) {
      current.dtstart = value.trim();
      current.isAllDayStart = /VALUE=DATE/i.test(rawKey);
      continue;
    }

    if (rawKey.startsWith("DTEND")) {
      current.dtend = value.trim();
      current.isAllDayEnd = /VALUE=DATE/i.test(rawKey);
      continue;
    }

    if (rawKey.startsWith("RRULE")) {
      current.rrule = value.trim();
    }
  }

  return events;
}

async function fetchEventsFromIcs(sourceUrl) {
  const response = await fetch(sourceUrl, {
    headers: { Accept: "text/calendar,text/plain,*/*" }
  });

  if (!response.ok) {
    const txt = await response.text();
    const error = new Error(`Kalenderfeed svarade med fel (${response.status}).`);
    error.details = txt.slice(0, 240);
    throw error;
  }

  const ics = await response.text();
  return parseIcsEvents(ics);
}

function eventCoversDate(event, dateIso) {
  const startIso = parseIcsDate(event.dtstart);
  const endIso = parseIcsDate(event.dtend);
  if (!startIso) return false;

  const allDay = Boolean(event.isAllDayStart || event.isAllDayEnd);
  if (!allDay) {
    if (event.rrule) {
      return eventRecurrenceCoversDate(event, dateIso);
    }
    return startIso === dateIso;
  }

  if (!endIso) return false;

  if (event.rrule) {
    return eventRecurrenceCoversDate(event, dateIso);
  }

  // ICS uses exclusive DTEND for all-day events.
  return startIso <= dateIso && dateIso < endIso;
}

async function handleServiceGroupApi(urlObj, res) {
  const date = urlObj.searchParams.get("date") || "";
  if (!isValidIsoDate(date)) {
    sendJson(res, 400, { ok: false, error: "Ogiltigt datumformat. Använd YYYY-MM-DD." });
    return;
  }

  try {
    const assignments = {};
    let meetingLeader = "";
    const sourceSummaries = [];
    const sources = [{ name: "primär", url: ICS_URL }];
    if (SECONDARY_ICS_URL && SECONDARY_ICS_URL !== ICS_URL) {
      sources.push({ name: "sekundär", url: SECONDARY_ICS_URL });
    }

    for (const source of sources) {
      const events = await fetchEventsFromIcs(source.url);
      const dayEvents = events.filter((event) => eventCoversDate(event, date));

      for (const event of dayEvents) {
        const summary = String(event.summary || "").trim();
        if (!summary) continue;
        const parsed = parseRoleAssignmentsFromSummary(summary);
        const entries = Object.entries(parsed);
        if (!entries.length) continue;

        sourceSummaries.push(`${source.name}: ${summary}`);
        for (const [roleName, person] of entries) {
          if (!assignments[roleName]) {
            assignments[roleName] = person;
          }
        }
      }

      const descriptionCandidates = dayEvents
        .map((event) => {
          const detailsText = getEventDetailsText(event);
          const parsedDescription = parseRoleAssignmentsFromDescription(detailsText);
          const descEntries = Object.entries(parsedDescription);
          if (!descEntries.length) return null;
          return {
            event,
            parsedDescription,
            priority: isLikelySundayServiceEvent(event, date) ? 2 : 1
          };
        })
        .filter(Boolean)
        .sort((a, b) => b.priority - a.priority);

      for (const candidate of descriptionCandidates) {
        const summaryText = String(candidate.event.summary || "").trim();
        sourceSummaries.push(`${source.name} anteckning: ${summaryText || "(utan rubrik)"}`);
        for (const [roleName, person] of Object.entries(candidate.parsedDescription)) {
          if (roleName === "Mötesledare") {
            if (!meetingLeader) {
              meetingLeader = person;
            }
            continue;
          }
          if (!assignments[roleName]) {
            assignments[roleName] = person;
          }
        }
      }
    }

    const hasAssignments = Object.keys(assignments).length > 0;
    const hasMeetingLeader = Boolean(String(meetingLeader || "").trim());

    if (!hasAssignments && !hasMeetingLeader) {
      sendJson(res, 200, { ok: true, found: false, serviceGroupResponsible: "", assignments: {}, meetingLeader });
      return;
    }

    const serviceGroupResponsible = assignments.Servicegruppansvarig || "";
    sendJson(res, 200, {
      ok: true,
      found: true,
      serviceGroupResponsible,
      assignments,
      sourceSummaries,
      meetingLeader
    });
  } catch (error) {
    sendJson(res, 500, {
      ok: false,
      error: `Kunde inte läsa kalenderfeeden: ${String(error.message || error)}`,
      details: String(error.details || "")
    });
  }
}

async function handleServiceGroupDebugApi(urlObj, res) {
  const date = urlObj.searchParams.get("date") || "";
  if (!isValidIsoDate(date)) {
    sendJson(res, 400, { ok: false, error: "Ogiltigt datumformat. Använd YYYY-MM-DD." });
    return;
  }

  try {
    const sources = [{ name: "primär", url: ICS_URL }];
    if (SECONDARY_ICS_URL && SECONDARY_ICS_URL !== ICS_URL) {
      sources.push({ name: "sekundär", url: SECONDARY_ICS_URL });
    }
    const out = [];

    for (const source of sources) {
      const events = await fetchEventsFromIcs(source.url);
      const dayEvents = events.filter((event) => eventCoversDate(event, date));
      for (const event of dayEvents) {
        const details = getEventDetailsText(event);
        const parsed = parseRoleAssignmentsFromDescription(details);
        out.push({
          source: source.name,
          summary: String(event.summary || ""),
          dtstart: String(event.dtstart || ""),
          dtend: String(event.dtend || ""),
          rrule: String(event.rrule || ""),
          detailsPreview: details.slice(0, 500),
          parsedFromDetails: parsed
        });
      }
    }

    sendJson(res, 200, {
      ok: true,
      date,
      eventCount: out.length,
      events: out
    });
  } catch (error) {
    sendJson(res, 500, {
      ok: false,
      error: `Kunde inte läsa kalenderfeeden: ${String(error.message || error)}`,
      details: String(error.details || "")
    });
  }
}

const server = http.createServer(async (req, res) => {
  const urlObj = new URL(req.url, `http://${req.headers.host}`);

  if (urlObj.pathname === "/api/service-group") {
    await handleServiceGroupApi(urlObj, res);
    return;
  }

  if (urlObj.pathname === "/api/service-group/debug") {
    await handleServiceGroupDebugApi(urlObj, res);
    return;
  }

  sendFile(urlObj.pathname, res);
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Server startad på http://localhost:${PORT}`);
});
