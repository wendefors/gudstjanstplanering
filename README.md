# Gudstjanstplanering

Webbapp for planering av gudstjanstordning med PDF-export, e-postutkast och kalenderkoppling.

## Funktioner
- Skapa och redigera motespunkter
- Bibelreferenser med bok/kapitel/verser
- Psalmer och sanger med sokbar katalog
- Hantera ansvariga med namn och e-post
- Hamta `Servicegrupp X: ZZZ` fran publik Google Kalender for valt datum
- Forhandsgranska och exportera till PDF
- Skapa e-postutkast via `mailto:`

## Krav
- Node.js 18+

## Konfiguration
1. Kopiera `.env.example` till `.env`.
2. Satt `GCAL_CALENDAR_ID` (publikt kalender-id).
3. Valfritt: satt `GCAL_ICS_URL` om du vill ange exakt ICS-feed manuellt.

Exempel:
```bash
cp .env.example .env
```

## Start
```bash
npm start
```

Appen startar pa:
- `http://localhost:4173`

## Struktur
- `index.html`: UI
- `styles.css`: layout och design
- `app.js`: klientlogik
- `print.html`: utskriftsvy
- `server.js`: statisk server + `/api/service-group` (ICS-hamtning)
- `data/bibleBooks.js`: bibelbocker
- `data/hymnCatalog.js`: psalm/sangkatalog

## Produktion med Supabase (for GitHub Pages)
Frontend kan ligga pa GitHub Pages, medan kalender-API:t kor som Supabase Edge Function.

### 1. Installera Supabase CLI
```bash
brew install supabase/tap/supabase
```

### 2. Logga in och lanka projekt
```bash
cd /Users/wendefors/Documents/GitHub/gudstjanstplanering
supabase login
supabase link --project-ref <PROJECT_REF>
```

### 3. Satt hemligheter i Supabase
```bash
supabase secrets set GCAL_ICS_URL=\"https://calendar.google.com/calendar/ical/.../private-.../basic.ics\"
supabase secrets set GCAL_SECONDARY_ICS_URL=\"https://calendar.google.com/calendar/ical/.../private-.../basic.ics\"
supabase secrets set ALLOWED_ORIGIN=\"https://<github-user>.github.io,http://localhost:4173\"
```

Om appen publiceras under ett repo-path (t.ex. `https://<user>.github.io/gudstjanstplanering/`)
kan du fortfarande anvanda samma origin:
`https://<user>.github.io`.

### 4. Skapa databasstruktur
```bash
supabase db push
```

### 5. Deploya functioner
```bash
supabase functions deploy service-group --no-verify-jwt
supabase functions deploy plans --no-verify-jwt
```

### 6. Konfigurera frontend mot Supabase-functioner
I `index.html`, satt:
```html
<script>
  window.SERVICE_GROUP_API_URL = "https://<project-ref>.functions.supabase.co/service-group";
  window.PLANS_API_URL = "https://<project-ref>.functions.supabase.co/plans";
</script>
```

### 7. Testa endpoint
```bash
curl \"https://<project-ref>.functions.supabase.co/service-group?date=2026-04-05\"
curl \"https://<project-ref>.functions.supabase.co/plans?id=<plan-id>\"
```

### 8. Publicera frontend pa GitHub Pages
Pusha repot, aktivera Pages i GitHub och verifiera att kalendersynk fungerar i publika URL:en.

## Delad läslänk
- Redigeringsläget sparas i Supabase-tabellen `plans`.
- Varje plan får en unik `share_token`.
- Knappen `Kopiera läslänk` skapar URL med `?read=<token>`.
- Läslänken är skrivskyddad i UI:t.
- Länken går ut 2 dagar efter planens datum.

## Notering om PDF sidhuvud/sidfot
Webblasaren styr sidhuvud/sidfot (datum, URL, sidnummer) i printdialogen.
For att dölja dem maste alternativet `Sidhuvuden och sidfötter` avmarkeras.
