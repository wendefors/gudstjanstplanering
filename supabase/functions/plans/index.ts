import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") || "*";

const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

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
  return {
    "access-control-allow-origin": resolveAllowedOrigin(origin),
    "access-control-allow-methods": "GET,POST,OPTIONS",
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

function isValidDateIso(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
}

function makeShareToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function computeShareExpiry(dateIso: string) {
  if (!isValidDateIso(dateIso)) {
    const fallback = new Date();
    fallback.setUTCDate(fallback.getUTCDate() + 2);
    return fallback.toISOString();
  }
  const base = new Date(`${dateIso}T23:59:59.000Z`);
  base.setUTCDate(base.getUTCDate() + 2);
  return base.toISOString();
}

function normalizePlanPayload(raw: any, hideEmails = false) {
  const source = raw && typeof raw === "object" ? raw : {};
  const responsible = Array.isArray(source.responsible)
    ? source.responsible.map((item: any) => ({
        role: String(item?.role || ""),
        name: String(item?.name || ""),
        email: hideEmails ? "" : String(item?.email || ""),
        locked: Boolean(item?.locked)
      }))
    : [];

  const agenda = Array.isArray(source.agenda)
    ? source.agenda.map((item: any) => ({
        ...item,
        type: String(item?.type || "custom"),
        title: String(item?.title || ""),
        owner: String(item?.owner || "")
      }))
    : [];

  return {
    date: String(source.date || ""),
    meetingLeader: String(source.meetingLeader || ""),
    theme: String(source.theme || ""),
    responsible,
    agenda
  };
}

async function getPlanByToken(token: string) {
  const { data, error } = await db
    .from("plans")
    .select("id,payload,share_token,share_expires_at")
    .eq("share_token", token)
    .maybeSingle();

  if (error) throw error;
  if (!data) return { found: false, expired: false, row: null };

  const now = Date.now();
  const expires = new Date(data.share_expires_at).getTime();
  if (Number.isFinite(expires) && now > expires) {
    return { found: true, expired: true, row: data };
  }

  return { found: true, expired: false, row: data };
}

async function getPlanById(id: string) {
  const { data, error } = await db
    .from("plans")
    .select("id,payload,share_token,share_expires_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function getLatestPlanByDate(dateIso: string) {
  const { data, error } = await db
    .from("plans")
    .select("id,payload,share_token,share_expires_at,updated_at")
    .eq("service_date", dateIso)
    .order("updated_at", { ascending: false })
    .limit(1);
  if (error) throw error;
  return Array.isArray(data) && data.length ? data[0] : null;
}

async function upsertPlan(id: string | null, plan: any) {
  const normalized = normalizePlanPayload(plan, false);
  const serviceDate = isValidDateIso(normalized.date) ? normalized.date : new Date().toISOString().slice(0, 10);
  const shareExpiresAt = computeShareExpiry(serviceDate);

  if (id) {
    const current = await getPlanById(id);
    if (!current) {
      const shareToken = makeShareToken();
      const { data, error } = await db
        .from("plans")
        .insert({
          id,
          service_date: serviceDate,
          payload: normalized,
          share_token: shareToken,
          share_expires_at: shareExpiresAt
        })
        .select("id,share_token,share_expires_at,payload")
        .single();
      if (error) throw error;
      return data;
    }

    const { data, error } = await db
      .from("plans")
      .update({
        service_date: serviceDate,
        payload: normalized,
        share_expires_at: shareExpiresAt,
        updated_at: new Date().toISOString()
      })
      .eq("id", id)
      .select("id,share_token,share_expires_at,payload")
      .single();
    if (error) throw error;
    return data;
  }

  const existingByDate = await getLatestPlanByDate(serviceDate);
  if (existingByDate?.id) {
    const { data, error } = await db
      .from("plans")
      .update({
        payload: normalized,
        share_expires_at: shareExpiresAt,
        updated_at: new Date().toISOString()
      })
      .eq("id", existingByDate.id)
      .select("id,share_token,share_expires_at,payload")
      .single();
    if (error) throw error;
    return data;
  }

  const shareToken = makeShareToken();
  const { data, error } = await db
    .from("plans")
    .insert({
      service_date: serviceDate,
      payload: normalized,
      share_token: shareToken,
      share_expires_at: shareExpiresAt
    })
    .select("id,share_token,share_expires_at,payload")
    .single();
  if (error) throw error;
  return data;
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin") || "";
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(origin) });
  }

  if (!SUPABASE_URL || !SERVICE_KEY) {
    return jsonResponse({ ok: false, error: "Supabase secrets saknas för plans-funktionen." }, 500, origin);
  }

  const url = new URL(req.url);

  try {
    if (req.method === "GET") {
      const token = String(url.searchParams.get("token") || "").trim();
      const id = String(url.searchParams.get("id") || "").trim();

      if (token) {
        const res = await getPlanByToken(token);
        if (!res.found) {
          return jsonResponse({ ok: false, error: "Länken hittades inte." }, 404, origin);
        }
        if (res.expired) {
          return jsonResponse({ ok: false, error: "Länken har gått ut." }, 410, origin);
        }
        return jsonResponse(
          {
            ok: true,
            id: res.row.id,
            shareToken: res.row.share_token,
            shareExpiresAt: res.row.share_expires_at,
            plan: normalizePlanPayload(res.row.payload, true)
          },
          200,
          origin
        );
      }

      if (id) {
        const row = await getPlanById(id);
        if (!row) {
          return jsonResponse({ ok: false, error: "Planen hittades inte." }, 404, origin);
        }
        return jsonResponse(
          {
            ok: true,
            id: row.id,
            shareToken: row.share_token,
            shareExpiresAt: row.share_expires_at,
            plan: normalizePlanPayload(row.payload, false)
          },
          200,
          origin
        );
      }

      const date = String(url.searchParams.get("date") || "").trim();
      if (date) {
        if (!isValidDateIso(date)) {
          return jsonResponse({ ok: false, error: "Ogiltigt datumformat. Använd YYYY-MM-DD." }, 400, origin);
        }
        const row = await getLatestPlanByDate(date);
        if (!row) {
          return jsonResponse({ ok: true, found: false, date }, 200, origin);
        }
        return jsonResponse(
          {
            ok: true,
            found: true,
            id: row.id,
            shareToken: row.share_token,
            shareExpiresAt: row.share_expires_at,
            plan: normalizePlanPayload(row.payload, false)
          },
          200,
          origin
        );
      }

      return jsonResponse({ ok: false, error: "Ange token eller id." }, 400, origin);
    }

    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const id = body?.id ? String(body.id) : null;
      const plan = body?.plan || null;
      if (!plan || typeof plan !== "object") {
        return jsonResponse({ ok: false, error: "Saknar plan payload." }, 400, origin);
      }

      const row = await upsertPlan(id, plan);
      return jsonResponse(
        {
          ok: true,
          id: row.id,
          shareToken: row.share_token,
          shareExpiresAt: row.share_expires_at,
          plan: normalizePlanPayload(row.payload, false)
        },
        200,
        origin
      );
    }

    return jsonResponse({ ok: false, error: "Metod stöds inte." }, 405, origin);
  } catch (error) {
    return jsonResponse({ ok: false, error: `Plans-funktion fel: ${String((error as any)?.message || error)}` }, 500, origin);
  }
});
