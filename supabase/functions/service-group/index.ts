const CALENDAR_ID = Deno.env.get("GCAL_CALENDAR_ID") || "gislavedsff@gmail.com";
const PRIMARY_ICS_URL =
  Deno.env.get("GCAL_ICS_URL") ||
  `https://calendar.google.com/calendar/ical/${encodeURIComponent(CALENDAR_ID)}/public/basic.ics`;
const SECONDARY_ICS_URL = Deno.env.get("GCAL_SECONDARY_ICS_URL") || Deno.env.get("GCAL_WORSHIP_ICS_URL") || "";
const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") || "*";

type ParsedEvent = {
  summary?: string;
  description?: string;
  descriptionHtml?: string;
  comment?: string;
  dtstart?: string;
  dtend?: string;
  rrule?: string;
  isAllDayStart?: boolean;
  isAllDayEnd?: boolean;
};

function resolveAllowedOrigin(origin = "") {
  if (ALLOWED_ORIGIN.trim() === "*") return "*";
  const allowed = ALLOWED_ORIGIN
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  if (!allowed.length) return "*";
  if (origin && allowed.includes(origin)) return origin;
  return allowed[0];
}

function corsHeaders(origin = "") {
  const allowOrigin = resolveAllowedOrigin(origin);
  return {
    "access-control-allow-origin": allowOrigin,
    "access-control-allow-methods": "GET,OPTIONS",
    "access-control-allow-headers": "content-type,authorization,apikey,x-client-info",
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  };
}

function jsonResponse(payload: unknown, status = 200, origin = "") {
  return new Response(JSON.stringify(payload), {
    status,
    headers: corsHeaders(origin)
  });
}

function isValidIsoDate(value: string | null) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function decodeIcsText(text: string) {
  return String(text || "")
    .replace(/\\n/g, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\:/g, ":")
    .replace(/\\\\/g, "\\")
    .trim();
}

function stripHtmlTags(text: string) {
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

function parseIcsDate(icsDate?: string) {
  const match = String(icsDate || "").match(/^(\d{4})(\d{2})(\d{2})/);
  if (!match) return "";
  return `${match[1]}-${match[2]}-${match[3]}`;
}

function parseIsoDateUtc(dateIso: string) {
  if (!isValidIsoDate(dateIso)) return null;
  const [year, month, day] = dateIso.split("-").map((v) => Number.parseInt(v, 10));
  return new Date(Date.UTC(year, month - 1, day));
}

function addDaysUtc(dateObj: Date, days: number) {
  const next = new Date(dateObj.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function diffDaysUtc(startDate: Date, endDate: Date) {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((endDate.getTime() - startDate.getTime()) / msPerDay);
}

function parseRRule(rruleText: string) {
  const out: Record<string, string> = {};
  String(rruleText || "")
    .split(";")
    .forEach((part) => {
      const [rawKey, rawValue] = part.split("=");
      if (!rawKey || rawValue === undefined) return;
      out[rawKey.toUpperCase()] = rawValue;
    });
  return out;
}

function parseUntilToIso(untilValue: string) {
  if (!untilValue) return "";
  const compact = untilValue.replace(/T.*$/, "");
  return parseIcsDate(compact);
}

function dayCodeForUtcDate(dateObj: Date) {
  return ["SU", "MO", "TU", "WE", "TH", "FR", "SA"][dateObj.getUTCDay()];
}

function isoFromUtcDate(dateObj: Date) {
  const year = dateObj.getUTCFullYear();
  const month = String(dateObj.getUTCMonth() + 1).padStart(2, "0");
  const day = String(dateObj.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function eventRecurrenceCoversDate(event: ParsedEvent, dateIso: string) {
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
  const dayOffsets: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
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

function parseIcsEvents(ics: string) {
  const unfolded = String(ics || "")
    .replace(/\r\n/g, "\n")
    .replace(/\n[ \t]/g, "");

  const lines = unfolded.split("\n");
  const events: ParsedEvent[] = [];
  let current: ParsedEvent | null = null;

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

function eventCoversDate(event: ParsedEvent, dateIso: string) {
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

  return startIso <= dateIso && dateIso < endIso;
}

function extractServiceGroupName(summary: string) {
  const text = String(summary || "").trim();
  if (!/^Servicegrupp\b/i.test(text)) return "";

  const withoutPrefix = text.replace(/^Servicegrupp\b/i, "").trim();
  const maybeAfterColon = withoutPrefix.includes(":") ? withoutPrefix.split(":").slice(1).join(":") : withoutPrefix;
  const cleaned = maybeAfterColon.replace(/^\s*\d+\s*/, "").replace(/^[-:]\s*/, "").trim();
  return cleaned;
}

function parseRoleAssignmentsFromSummary(summary: string) {
  const text = String(summary || "").trim();
  const assignments: Record<string, string> = {};
  if (!text) return assignments;

  const labelMap: Record<string, string> = {
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

function parseRoleAssignmentsFromDescription(description: string) {
  const text = String(description || "")
    .replace(/\u00a0/g, " ")
    .trim();
  const assignments: Record<string, string> = {};
  if (!text) return assignments;

  const labelMap: Record<string, string> = {
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

function getEventDetailsText(event: ParsedEvent) {
  const parts = [event.description, event.descriptionHtml, event.comment]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  return parts.join("\n");
}

function isLikelySundayServiceEvent(event: ParsedEvent, dateIso: string) {
  const summary = String(event.summary || "").toLowerCase();
  if (summary.includes("gudstjänst") || summary.includes("gudstjanst")) return true;

  const target = parseIsoDateUtc(dateIso);
  if (!target || target.getUTCDay() !== 0) return false;

  const startRaw = String(event.dtstart || "");
  if (!startRaw.includes("T")) return false;
  if (/T10\d{4}$/i.test(startRaw)) return true;
  if (/T0[89]\d{4}Z$/i.test(startRaw)) return true;
  return false;
}

async function fetchEventsFromIcs(sourceUrl: string) {
  const response = await fetch(sourceUrl, {
    headers: { Accept: "text/calendar,text/plain,*/*" }
  });

  if (!response.ok) {
    const txt = await response.text();
    const error = new Error(`Kalenderfeed svarade med fel (${response.status}).`);
    (error as Error & { details?: string }).details = txt.slice(0, 240);
    throw error;
  }

  const ics = await response.text();
  return parseIcsEvents(ics);
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin") || "";
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders(origin)
    });
  }

  const url = new URL(req.url);
  const date = url.searchParams.get("date");
  const debug = url.searchParams.get("debug") === "1";

  if (!isValidIsoDate(date)) {
    return jsonResponse({ ok: false, error: "Ogiltigt datumformat. Använd YYYY-MM-DD." }, 400, origin);
  }

  try {
    const assignments: Record<string, string> = {};
    let meetingLeader = "";
    const sourceSummaries: string[] = [];
    const debugEvents: Array<Record<string, string | Record<string, string>>> = [];

    const sources = [{ name: "primär", url: PRIMARY_ICS_URL }];
    if (SECONDARY_ICS_URL && SECONDARY_ICS_URL !== PRIMARY_ICS_URL) {
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
            priority: isLikelySundayServiceEvent(event, date) ? 2 : 1,
            detailsText
          };
        })
        .filter(Boolean)
        .sort((a, b) => (b?.priority || 0) - (a?.priority || 0));

      for (const candidate of descriptionCandidates) {
        if (!candidate) continue;
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

      if (debug) {
        for (const event of dayEvents) {
          const details = getEventDetailsText(event);
          debugEvents.push({
            source: source.name,
            summary: String(event.summary || ""),
            dtstart: String(event.dtstart || ""),
            dtend: String(event.dtend || ""),
            rrule: String(event.rrule || ""),
            detailsPreview: details.slice(0, 500),
            parsedFromDetails: parseRoleAssignmentsFromDescription(details)
          });
        }
      }
    }

    if (debug) {
      return jsonResponse(
        {
          ok: true,
          date,
          eventCount: debugEvents.length,
          events: debugEvents,
          sourceSummaries,
          assignments,
          meetingLeader
        },
        200,
        origin
      );
    }

    const hasAssignments = Object.keys(assignments).length > 0;
    const hasMeetingLeader = Boolean(String(meetingLeader || "").trim());

    if (!hasAssignments && !hasMeetingLeader) {
      return jsonResponse(
        { ok: true, found: false, serviceGroupResponsible: "", assignments: {}, meetingLeader: meetingLeader || "" },
        200,
        origin
      );
    }

    return jsonResponse(
      {
        ok: true,
        found: true,
        serviceGroupResponsible: assignments.Servicegruppansvarig || "",
        assignments,
        sourceSummaries,
        meetingLeader: meetingLeader || ""
      },
      200,
      origin
    );
  } catch (error) {
    const err = error as Error & { details?: string };
    return jsonResponse(
      {
        ok: false,
        error: `Kunde inte läsa kalenderfeeden: ${String(err.message || err)}`,
        details: String(err.details || "")
      },
      500,
      origin
    );
  }
});
