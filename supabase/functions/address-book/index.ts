import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import postgres from "https://deno.land/x/postgresjs@v3.4.5/mod.js";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") || "*";
const ADMIN_TOKEN = Deno.env.get("ADDRESS_BOOK_ADMIN_TOKEN") || "";
const DB_URL = Deno.env.get("SUPABASE_DB_URL") || Deno.env.get("ADDRESS_BOOK_DB_URL") || "";

const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const schemaSql = `
create table if not exists public.address_book (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  normalized_name text not null unique,
  email text not null,
  aliases text[] not null default '{}',
  verified boolean not null default true,
  created_at timestamp not null default timezone('Europe/Stockholm', now()),
  updated_at timestamp not null default timezone('Europe/Stockholm', now())
);

create table if not exists public.contact_suggestions (
  id uuid primary key default gen_random_uuid(),
  calendar_name text not null,
  normalized_name text not null,
  email text not null,
  role text not null default '',
  service_date date,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamp not null default timezone('Europe/Stockholm', now()),
  handled_at timestamp
);

create index if not exists address_book_normalized_name_idx on public.address_book (normalized_name);
create index if not exists contact_suggestions_status_idx on public.contact_suggestions (status);
create index if not exists contact_suggestions_normalized_name_idx on public.contact_suggestions (normalized_name);

create or replace function public.set_updated_at_stockholm()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := timezone('Europe/Stockholm', now());
  return new;
end;
$$;

drop trigger if exists address_book_set_updated_at_stockholm on public.address_book;
create trigger address_book_set_updated_at_stockholm
before update on public.address_book
for each row
execute function public.set_updated_at_stockholm();

alter table public.address_book enable row level security;
alter table public.contact_suggestions enable row level security;

drop policy if exists address_book_no_direct_select on public.address_book;
create policy address_book_no_direct_select on public.address_book
for select using (false);

drop policy if exists address_book_no_direct_insert on public.address_book;
create policy address_book_no_direct_insert on public.address_book
for insert with check (false);

drop policy if exists address_book_no_direct_update on public.address_book;
create policy address_book_no_direct_update on public.address_book
for update using (false) with check (false);

drop policy if exists address_book_no_direct_delete on public.address_book;
create policy address_book_no_direct_delete on public.address_book
for delete using (false);

drop policy if exists contact_suggestions_no_direct_select on public.contact_suggestions;
create policy contact_suggestions_no_direct_select on public.contact_suggestions
for select using (false);

drop policy if exists contact_suggestions_no_direct_insert on public.contact_suggestions;
create policy contact_suggestions_no_direct_insert on public.contact_suggestions
for insert with check (false);

drop policy if exists contact_suggestions_no_direct_update on public.contact_suggestions;
create policy contact_suggestions_no_direct_update on public.contact_suggestions
for update using (false) with check (false);

drop policy if exists contact_suggestions_no_direct_delete on public.contact_suggestions;
create policy contact_suggestions_no_direct_delete on public.contact_suggestions
for delete using (false);
`;

type PersonInput = {
  index?: number;
  role?: string;
  name?: string;
};

type AddressBookRow = {
  id: string;
  display_name: string;
  normalized_name: string;
  email: string;
  aliases: string[];
  verified: boolean;
};

function resolveAllowedOrigin(origin = "") {
  if (ALLOWED_ORIGIN.trim() === "*") return "*";
  const allowed = ALLOWED_ORIGIN
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (!allowed.length) return "*";
  if (origin && allowed.includes(origin)) return origin;
  return allowed[0];
}

function corsHeaders(origin = "") {
  return {
    "access-control-allow-origin": resolveAllowedOrigin(origin),
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type,authorization,apikey,x-client-info,x-admin-token",
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

function normalizeName(value: string) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[()]/g, " ")
    .replace(/[^a-z0-9åäöÅÄÖ]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function isLikelyComplexName(name: string) {
  const value = String(name || "");
  return /[,/&]|\boch\b/i.test(value);
}

function hasAdminAccess(req: Request, body: any) {
  const token = req.headers.get("x-admin-token") || String(body?.adminToken || "");
  return Boolean(ADMIN_TOKEN && token && token === ADMIN_TOKEN);
}

async function listAddressBook() {
  const { data, error } = await db
    .from("address_book")
    .select("id,display_name,normalized_name,email,aliases,verified")
    .eq("verified", true);
  if (error) throw error;
  return (data || []) as AddressBookRow[];
}

function findMatch(rows: AddressBookRow[], rawName: string) {
  const normalized = normalizeName(rawName);
  if (!normalized) return null;
  return rows.find((row) => {
    if (row.normalized_name === normalized) return true;
    const aliases = Array.isArray(row.aliases) ? row.aliases : [];
    return aliases.map((alias) => normalizeName(alias)).includes(normalized);
  }) || null;
}

async function lookupPeople(people: PersonInput[], includeEmails = false) {
  const rows = await listAddressBook();
  return people.map((person, fallbackIndex) => {
    const rawName = String(person?.name || "").trim();
    const index = Number.isFinite(person?.index) ? Number(person.index) : fallbackIndex;
    const role = String(person?.role || "");

    if (!rawName) {
      return { index, role, name: rawName, status: "empty", emailFound: false };
    }

    if (isLikelyComplexName(rawName)) {
      return { index, role, name: rawName, status: "complex", emailFound: false };
    }

    const match = findMatch(rows, rawName);
    if (!match) {
      return { index, role, name: rawName, status: "missing", emailFound: false };
    }

    return {
      index,
      role,
      name: rawName,
      status: "found",
      emailFound: true,
      displayName: match.display_name,
      email: includeEmails ? match.email : undefined
    };
  });
}

async function createSuggestion(body: any) {
  const name = String(body?.name || "").trim();
  const email = String(body?.email || "").trim();
  const role = String(body?.role || "").trim();
  const serviceDate = String(body?.serviceDate || "").trim() || null;

  if (!name) return { ok: false, error: "Namn saknas." };
  if (!isValidEmail(email)) return { ok: false, error: "Ogiltig e-postadress." };

  const normalizedName = normalizeName(name);
  const rows = await listAddressBook();
  const existingByName = findMatch(rows, name);
  if (existingByName) {
    return { ok: false, error: "Namnet finns redan i adresslistan." };
  }

  const existingByEmail = rows.find((row) => row.email.toLowerCase() === email.toLowerCase());
  if (existingByEmail) {
    return { ok: false, error: "E-postadressen finns redan på ett annat namn." };
  }

  const { data: existingSuggestion, error: findError } = await db
    .from("contact_suggestions")
    .select("id,status")
    .eq("normalized_name", normalizedName)
    .eq("email", email)
    .eq("status", "pending")
    .maybeSingle();
  if (findError) throw findError;
  if (existingSuggestion) {
    return { ok: true, suggestionId: existingSuggestion.id, status: "pending", alreadyPending: true };
  }

  const { data, error } = await db
    .from("contact_suggestions")
    .insert({
      calendar_name: name,
      normalized_name: normalizedName,
      email,
      role,
      service_date: serviceDate
    })
    .select("id,status")
    .single();
  if (error) throw error;
  return { ok: true, suggestionId: data.id, status: data.status };
}

async function listSuggestions() {
  const { data, error } = await db
    .from("contact_suggestions")
    .select("id,calendar_name,email,role,service_date,status,created_at")
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data || [];
}

async function approveSuggestion(id: string) {
  const { data: suggestion, error: suggestionError } = await db
    .from("contact_suggestions")
    .select("id,calendar_name,normalized_name,email,status")
    .eq("id", id)
    .maybeSingle();
  if (suggestionError) throw suggestionError;
  if (!suggestion || suggestion.status !== "pending") {
    return { ok: false, error: "Förslaget hittades inte eller är redan hanterat." };
  }

  const rows = await listAddressBook();
  const existing = findMatch(rows, suggestion.calendar_name);
  if (existing) {
    return { ok: false, error: "Namnet finns redan i adresslistan." };
  }

  const { data: contact, error: insertError } = await db
    .from("address_book")
    .insert({
      display_name: suggestion.calendar_name,
      normalized_name: suggestion.normalized_name,
      email: suggestion.email,
      aliases: [suggestion.calendar_name],
      verified: true
    })
    .select("id,display_name,email")
    .single();
  if (insertError) throw insertError;

  const { error: updateError } = await db
    .from("contact_suggestions")
    .update({ status: "approved", handled_at: new Date().toISOString() })
    .eq("id", id);
  if (updateError) throw updateError;

  return { ok: true, contact };
}

async function rejectSuggestion(id: string) {
  const { error } = await db
    .from("contact_suggestions")
    .update({ status: "rejected", handled_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "pending");
  if (error) throw error;
  return { ok: true };
}

async function setupSchema() {
  if (!DB_URL) return { ok: false, error: "Databas-URL saknas." };
  const sql = postgres(DB_URL, { max: 1 });
  try {
    await sql.unsafe(schemaSql);
    return { ok: true };
  } finally {
    await sql.end({ timeout: 5 });
  }
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin") || "";
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(origin) });
  }

  if (!SUPABASE_URL || !SERVICE_KEY) {
    return jsonResponse({ ok: false, error: "Supabase secrets saknas för address-book-funktionen." }, 500, origin);
  }

  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const action = String(body?.action || "");

    if (action === "setup-schema") {
      if (!hasAdminAccess(req, body)) return jsonResponse({ ok: false, error: "Adminbehörighet saknas." }, 401, origin);
      return jsonResponse(await setupSchema(), 200, origin);
    }

    if (action === "lookup") {
      const people = Array.isArray(body?.people) ? body.people : [];
      return jsonResponse({ ok: true, results: await lookupPeople(people, false) }, 200, origin);
    }

    if (action === "resolve-emails") {
      const people = Array.isArray(body?.people) ? body.people : [];
      return jsonResponse({ ok: true, results: await lookupPeople(people, true) }, 200, origin);
    }

    if (action === "suggest") {
      const result = await createSuggestion(body);
      return jsonResponse(result, result.ok ? 200 : 400, origin);
    }

    if (action === "list-suggestions") {
      if (!hasAdminAccess(req, body)) return jsonResponse({ ok: false, error: "Adminbehörighet saknas." }, 401, origin);
      return jsonResponse({ ok: true, suggestions: await listSuggestions() }, 200, origin);
    }

    if (action === "approve-suggestion") {
      if (!hasAdminAccess(req, body)) return jsonResponse({ ok: false, error: "Adminbehörighet saknas." }, 401, origin);
      const id = String(body?.id || "");
      const result = await approveSuggestion(id);
      return jsonResponse(result, result.ok ? 200 : 400, origin);
    }

    if (action === "reject-suggestion") {
      if (!hasAdminAccess(req, body)) return jsonResponse({ ok: false, error: "Adminbehörighet saknas." }, 401, origin);
      const id = String(body?.id || "");
      return jsonResponse(await rejectSuggestion(id), 200, origin);
    }

    return jsonResponse({ ok: false, error: "Okänd åtgärd." }, 400, origin);
  } catch (error) {
    return jsonResponse({ ok: false, error: `Address book-funktion fel: ${String((error as any)?.message || error)}` }, 500, origin);
  }
});
