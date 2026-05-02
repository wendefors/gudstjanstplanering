# Projektkontext: Gudstjänstplanering

Senast uppdaterad: 2026-05-02

Den här filen är projektets levande minne. Uppdatera den när funktioner, beslut, buggar eller arbetsflöden ändras, så att ny eller komprimerad chatkontext snabbt kan återställas.

## Syfte

Gudstjänstplanering är en webbapp för Gislaveds frikyrkoförsamling. Den hjälper mötesledare att planera söndagens gudstjänstordning, hålla reda på ansvariga, hämta roller från kalendrar, skapa läslänk och exportera en läsbar gudstjänstordning.

Viktig målbild:
- Mötesledaren ska snabbt kunna skapa eller öppna en gudstjänstordning för valt datum.
- Ansvariga ska kunna läsas in från Google Kalender, men numera bara manuellt via knapp.
- Inblandade ska kunna få en läslänk där planeringen kan ses men inte redigeras.
- Export till PDF/JPG ska vara ren och utskriftsvänlig.
- E-postutkast ska innehålla kort text och läslänk, inte hela programmet.
- E-postadresser till ansvariga ska kunna hämtas från en skyddad adressbok när namn matchar.

## Teknisk Översikt

Frontend är en enkel statisk app:
- `index.html`: UI, templates, Supabase endpoint-konfiguration.
- `app.js`: all klientlogik, state, rendering, sparning, läsläge, kalenderhämtning, export.
- `styles.css`: layout, responsivitet, livevy, dialoger.
- `print.html`: PDF/utskriftsvy som får data via `sessionStorage`.
- `data/bibleBooks.js`: bibelböcker.
- `data/hymnCatalog.js`: katalog för Psalmer och sånger.
- `gff_logga.jpg`: logotyp.

Backend/lokal server:
- `server.js`: lokal statisk server och lokal `/api/service-group` för kalenderhämtning.
- Körs normalt med `node server.js`.
- För mobiltest på samma nätverk: `HOST=0.0.0.0 node server.js`, öppna `http://<lokal-ip>:4173`.

Supabase:
- Edge Function `service-group`: hämtar och tolkar Google Calendar ICS-data.
- Edge Function `plans`: sparar/läser planer i Supabase-tabellen `plans`.
- Edge Function `address-book`: matchar ansvarigas namn mot adressbok, tar emot adressförslag och hanterar admin-godkännande.
- Migrationer finns i `supabase/migrations`.
- Frontend använder:
  - `https://ejymotvpbhrpzpblfwon.functions.supabase.co/service-group`
  - `https://ejymotvpbhrpzpblfwon.functions.supabase.co/plans`
  - `https://ejymotvpbhrpzpblfwon.functions.supabase.co/address-book`

Publicering:
- Frontend publiceras via GitHub Pages på `https://wendefors.github.io/gudstjanstplanering/`.
- Viktigt: GitHub Pages kan ligga efter lokala filer tills ändringar commitas/pushas och sidan byggts om.

## Datamodell

Planen som sparas i Supabase ligger i `plans.payload`.

Grundfält:
- `date`
- `meetingLeader`
- `theme`

Ansvariga:
- `responsible[]`
- Varje ansvarig har `role`, `name`, `email`, `locked`.
- E-post kan fortfarande fyllas manuellt och sparas på planen.
- Om namn matchas i adressboken döljs adressen i fältet och statusen visar `E-post hämtad`.
- Matchade adressboksadresser sparas inte in i planens payload.

Mötespunkter:
- `agenda[]`
- Gemensamma fält: `type`, `title`, `owner`, `note`.
- Bibeltext: `bibleBook`, `bibleChapter`, `bibleVerses`.
- Psalm/sång: `hymnInput`, `hymnSearchTerm`.
- Predikan/övrigt: använder främst `title`.

Viktigt: `app.js` sparar agenda med `state.agenda.map((item) => ({ ...item }))`, så nya mötespunktsfält ska normalt följa med till Supabase. `plans`-funktionen normaliserar också `note`.

## Nuvarande Funktioner

### Grundinfo

Fält:
- Datum
- Mötesledare
- Tema

Knapp:
- `Hämta från kalender`

Datumfältet har haft problem på iPad. Senaste fixen:
- Tablet/touch-layout sätter datum på egen rad i Grundinfo vid relevanta bredder.
- CSS-version i `index.html` ska bumpas när CSS ändras.

### Ansvariga

Standardroller:
- Predikant
- Ljudtekniker kyrksal
- Ljudtekniker inspelning
- Videoinspelning
- Projektoransvarig
- Organist
- Förebedjare
- Servicegruppansvarig

Rollerna är låsta i namn, men namn/e-post är frivilliga.

### Kalenderhämtning

Tidigare hämtades kalenderdata automatiskt, men det togs bort eftersom manuella ändringar riskerade att skrivas över.

Nu gäller:
- Hämtning sker endast när användaren trycker `Hämta från kalender`.
- Hämtningen får skriva över ansvariga och mötesledare när den körs.
- Manuella ändringar skyddas genom att ingen automatisk hämtning sker i bakgrunden.

Kalendrar:
- Primär kalender används för servicegrupp, ljud, skärm, video, inspelningsmixer.
- Sekundär kalender används för uppgifter i posten `Gudstjänst` kl. 10 på söndagar, t.ex. predikant, organist, förebedjare och mötesledare.

Mappningar:
- `Servicegrupp X: ZZZ` -> `Servicegruppansvarig`
- `Ljudansvarig: XXX` -> `Ljudtekniker kyrksal`
- `Skärm: XXX` -> `Projektoransvarig`
- `Video: XXX` -> `Videoinspelning`
- `Inspelningsmixer: XXX` -> `Ljudtekniker inspelning`
- `Predikan: XXX` -> `Predikant`
- `Psalmer: XXX` -> `Organist`
- `Förebedjare: XXX` -> `Förebedjare`
- `Ledning: XXX` -> `Mötesledare`

Viktig bugfix:
- För återkommande kalenderposter kan en gammal seriepost och en ändrad enskild post existera samtidigt.
- Fixen prioriterar:
  1. `RECURRENCE-ID` för valt datum
  2. icke-återkommande enskild post
  3. återkommande seriepost
- Detta löste spökvärdet för `Ljudtekniker kyrksal` där `Peter Englund` växlade med `Tordh N (to-fre), Anders Å (sön)`.

### Kom-ihåg-lista

Blocket heter `Kom-ihåg-lista för mötesledare` och ligger mellan Ansvariga och Mötespunkter.

Punkter:
- Kontakta alla medverkande i god tid - helst i mitten av veckan
- Låt dagens tema märkas i sång- och textval
- Låt många olika medverka - gärna ungdomar
- Är det söndagskul den här söndagen?
- Ta gärna med någon sång från vårt lovsångshäfte
- Finns det möjlighet att få stå upp någon gång? Under en sång, en textläsning eller dyl?

Blocket döljs i läsläge.

### Mötespunkter

Typer:
- Övrigt
- Bibeltext
- Psalmer och sånger
- Predikan

Synlighet:
- Bibelfält visas bara vid `Bibeltext`.
- Psalm/sång-sökning visas bara vid `Psalmer och sånger`.
- Predikan tänder fritextfält med placeholder `Rubrik på predikan`.

Standard vid ny gudstjänstordning:
- `Välkommen till gudstjänst`
- `Pålysningar`

`Ny gudstjänstordning` ska nollställa vald vecka/datum, inte hoppa till nästa söndag.

Synk av ansvar i mötespunkter:
- Predikan kan sätta ansvar från `Predikant` med initialer.
- Psalmer och sånger kan sätta ansvar från `Organist` med initialer.
- Bibeltext kan sätta ansvar från `Mötesledare` med initialer.
- Standardraderna `Välkommen till gudstjänst` och `Pålysningar` kan få initialer från mötesledare när kalenderhämtning sätter mötesledare.

### Anteckningar På Mötespunkter

Ny funktion från 2026-05-02:
- Varje mötespunkt har ett `note`-fält.
- I planeringsläget finns en liten `Info`-knapp i raden.
- `Info*` betyder att det finns anteckning.
- Klick öppnar dialog med textarea och `Spara`/`Stäng`.
- I livevy/läsläge visas en liten rund `i`-markör i titelcellen om anteckning finns.
- Klick på `i` öppnar anteckningen läsbart.
- Anteckningar ska inte synas i PDF/JPG-export.

Viktigt:
- `plans`-funktionen är deployad efter att `note` lades till.
- `note` finns med i payload från `plans?date=...` och `plans?token=...`.

### Livevy Och Läsläge

Livevyn visar:
- Gudstjänstordning + datum
- Mötesledare
- Tema om ifyllt
- Ansvariga utan punktlista
- Ordning som tabell

Tabellkolumner:
- löpnummer
- kategori
- titel
- ansvarig

Kategori visas som:
- `Psalmer och sånger`
- `Bibelläsning`
- `Predikan`
- tomt för `Övrigt`

Mobil livevy:
- kategori och ansvar döljs för att få plats.
- fokus på löpnummer + titel.

Läsläge:
- URL: `?read=<share_token>`
- Ska vara skrivskyddat.
- Ska bara visa två block: `Gudstjänstordning` och `Export`.
- E-postadresser ska inte exponeras.
- Läsläget pollar planen var 60:e sekund.

Läslänkar:
- `Kopiera läslänk` sparar planen och kopierar en read-URL.
- Länken går ut två dagar efter gudstjänstdatumet.
- Det innebär att gamla testdatum, t.ex. 2026-04-05 efter 2026-04-07, ger `Länken har gått ut`.

Aktuell felsökning kring läslänk/sparning:
- Supabase backend fungerar vid direkta `curl`-anrop.
- Om läslänk/sparning inte fungerar lokalt kan orsaken vara CORS/`ALLOWED_ORIGIN`, särskilt vid `http://localhost:4173` eller lokal nätverks-IP.
- GitHub Pages kan ligga efter lokala filer om ändringar inte är commitade/pushade.
- Senaste observation: publika GitHub Pages serverade äldre `app.js?v=20260402a` medan lokalt fanns nyare kod.

### Export

PDF:
- Byggs via `print.html`.
- Webbläsarens printdialog styr sidhuvud/sidfot; appen kan inte garantera borttagning i alla browsers.
- Användaren behöver ofta avmarkera sidhuvud/sidfot i dialogen.

JPG:
- Canvasbredd: 1400px.
- Höjd dynamisk, minst 900px.
- JPEG-kvalitet: `0.9`.
- Logga ingår i sidhuvud.
- Anteckningar ska inte ingå i JPG-export.

Exportlayout:
- Ska så långt möjligt likna livevy.
- Tabell med zebra-ränder.
- Rollnamn i ansvariga är bold.
- Tabelltext svart.
- Titel i tabell bold.

### E-post

E-postutkast skapas via `mailto:`.

Adresskällor:
- Manuellt ifyllda e-postadresser i ansvariglistan.
- Adressboken i Supabase, löst vid klick på `Skapa e-postutkast`.

Adressbokens frontendbeteende:
- Publik lookup returnerar bara status, inte e-postadress.
- Vid träff visas `E-post hämtad` och e-postfältet blir skrivskyddat/tomt.
- Vid saknad träff kan mötesledaren fylla i adress manuellt.
- Om namn + manuell e-post finns visas knappen `Föreslå till adresslistan`.
- Förslaget hamnar i `contact_suggestions` och kräver admin-godkännande innan det blir aktiv adressbokspost.

Adminläge:
- Öppnas med `?admin=<token>` i redigeringsläget.
- Admin-token ligger som Supabase secret `ADDRESS_BOOK_ADMIN_TOKEN`.
- Admin kan se väntande adressförslag, godkänna eller avvisa.
- Godkännande skapar rad i `address_book`.

Nuvarande text:

```text
Hej!

Här kommer gudstjänstordningen för [datum].
Klicka på länken för att komma till läsläget.

[Länk]
```

Inga PDF/JPG-bilagor skapas automatiskt.

### Adressbok

Ny funktion från 2026-05-02:
- Migration `20260502_create_address_book.sql` skapar `address_book` och `contact_suggestions`.
- `address_book` innehåller `display_name`, `normalized_name`, `email`, `aliases`, `verified`, `created_at`, `updated_at`.
- `contact_suggestions` innehåller föreslagna namn/adresser och status `pending`, `approved` eller `rejected`.
- Tidsstämplar använder `timezone('Europe/Stockholm', now())`.
- RLS är aktiverat och policies nekar direkt åtkomst.
- Edge Function `address-book` är deployad.
- Eftersom lokal `supabase db push` timeoutade mot poolern finns adminskyddad action `setup-schema` i `address-book`, som kan skapa schemat från Supabase-miljön via secret `ADDRESS_BOOK_DB_URL`.
- `setup-schema` har körts och svarade `{"ok":true}`.

API-actions:
- `lookup`: publik, returnerar bara status per namn.
- `resolve-emails`: publik, returnerar matchade adresser för mailto-flödet.
- `suggest`: publik, lägger förslag i `contact_suggestions`.
- `list-suggestions`: admin.
- `approve-suggestion`: admin.
- `reject-suggestion`: admin.
- `setup-schema`: admin, bör bara användas vid setup/felsökning.

## Supabase Och Säkerhet

Tabell:
- `public.plans`
- `public.address_book`
- `public.contact_suggestions`

RLS:
- Direkt klientåtkomst till tabellerna blockeras.
- Edge Function använder service role.

Läslänkar:
- Har unik `share_token`.
- Ger skrivskyddad vy.
- E-post döljs.
- Går ut två dagar efter gudstjänstdatum.

Kalenderdata:
- Kalenderkällor är publika/privata ICS-länkar som ligger som Supabase secrets.
- Användaren har resonerat att de data som hämtas redan är avsedda att kunna läsas av berörda.

CORS:
- `ALLOWED_ORIGIN` behöver tillåta GitHub Pages och de lokala origins som används.
- För lokal nätverkstestning kan origin vara t.ex. `http://192.168.1.124:4173`.

Exempel:

```bash
supabase secrets set ALLOWED_ORIGIN="https://wendefors.github.io,http://localhost:4173,http://192.168.1.124:4173"
supabase functions deploy plans --no-verify-jwt
supabase functions deploy service-group --no-verify-jwt
```

## Tidsstämplar

Tidigare visades Supabase-tider två timmar fel eftersom UTC visades mot svensk tid.

Nuvarande fix:
- Migration `20260402_stockholm_timestamps.sql`
- `created_at` och `updated_at` lagras som svensk lokal tid.
- Trigger sätter `updated_at` med `timezone('Europe/Stockholm', now())`.
- Hanterar sommar/vintertid via PostgreSQL time zone-regler.

Notera:
- Detta är ett medvetet val för adminvisning i Supabase, även om UTC ofta är standard i backend-system.

## Viktiga Kommandon

Start lokalt:

```bash
cd /Users/wendefors/Documents/GitHub/gudstjanstplanering
node server.js
```

Start lokalt för mobil på samma nätverk:

```bash
cd /Users/wendefors/Documents/GitHub/gudstjanstplanering
HOST=0.0.0.0 node server.js
```

Hitta lokal IP:

```bash
ipconfig getifaddr en0
```

Syntaxcheck:

```bash
node --check app.js
node --check server.js
```

Deploy Supabase functions:

```bash
supabase functions deploy service-group --no-verify-jwt
supabase functions deploy plans --no-verify-jwt
supabase functions deploy address-book --no-verify-jwt
```

Push DB-migrationer:

```bash
supabase db push
```

Testa kalenderfunktion:

```bash
curl "https://ejymotvpbhrpzpblfwon.functions.supabase.co/service-group?date=2026-04-05"
```

Testa plan per datum:

```bash
curl "https://ejymotvpbhrpzpblfwon.functions.supabase.co/plans?date=2026-05-03"
```

Testa lästoken:

```bash
curl "https://ejymotvpbhrpzpblfwon.functions.supabase.co/plans?token=<token>"
```

Testa adressbok:

```bash
curl -X POST "https://ejymotvpbhrpzpblfwon.functions.supabase.co/address-book" \
  -H "Content-Type: application/json" \
  --data '{"action":"lookup","people":[{"index":0,"role":"Predikant","name":"Test Person"}]}'
```

Adminlista adressförslag:

```bash
curl -X POST "https://ejymotvpbhrpzpblfwon.functions.supabase.co/address-book" \
  -H "Content-Type: application/json" \
  -H "x-admin-token: <ADDRESS_BOOK_ADMIN_TOKEN>" \
  --data '{"action":"list-suggestions"}'
```

Kontrollera publicerad GitHub Pages-version:

```bash
curl "https://wendefors.github.io/gudstjanstplanering/" | rg "app.js|styles.css"
```

## Sprintlogg / Utvecklingshistorik

### Sprint 1: Första appen

Byggde statisk webbapp med:
- Grundinfo
- Ansvariga
- Mötespunkter
- Livevy
- PDF-export
- mailto-utkast

Fokus låg på att få ett fungerande planeringsflöde snabbt.

### Sprint 2: Svenska data och grundfunktioner

Lade till:
- åäö-fixar
- grafisk profil
- tema
- predikant/ansvariga
- fasta roller
- tomt standardschema
- `Psalmer och sånger`
- `Bibeltext` med bok/kapitel/verser
- `Predikan`
- responsiva mötespunktsrader

### Sprint 3: Psalmer, Bibel Och UI-detaljer

Lade till:
- sökbar psalmlista
- bibelbok/kapitel-dropdown
- villkorlig visning av fält beroende på mötespunktstyp
- zebra-rader i planeringsläget
- flytta upp/ner
- lokal sparning och senare Supabase-sparning
- närmaste kommande söndag som defaultdatum

### Sprint 4: Kalenderhämtning

Först provades Google Calendar API/ICS lokalt, sedan flyttades hämtningen till Supabase Edge Function.

Lade till:
- servicegrupp
- ljudtekniker kyrksal
- ljudtekniker inspelning
- videoinspelning
- projektoransvarig
- predikant
- organist
- förebedjare
- mötesledare

Viktig lärdom:
- Google Calendar återkommande poster kan ge både seriepost och ändrad enskild post.
- Därför finns prioriteringslogik för `RECURRENCE-ID`/engångsposter.

### Sprint 5: Supabase Planer Och Läsläge

Flyttade planlagring till Supabase:
- Tabell `plans`
- Edge Function `plans`
- unika läslänkar via `share_token`
- läsläge utan redigering
- e-postadresser döljs i läsläge
- läslänkar går ut två dagar efter datum

### Sprint 6: Export Och Visuell Presentation

Förbättrade:
- livevy som tabell
- exportlayout
- zebra-ränder
- loggplacering
- export som JPG
- mobil livevy utan kategori/ansvar för bättre plats

### Sprint 7: Stabilitet Och Lokala Flöden

Ändrade:
- kalenderhämtning från automatisk till manuell knapp
- `Ny gudstjänstordning` behåller valt datum
- tidsstämplar i Supabase anpassas till Europe/Stockholm
- iPad-fixar för datumfält
- pagehide-sparning med `sendBeacon`/`keepalive`

### Sprint 8: Anteckningar

Lade till:
- `note` per mötespunkt
- `Info`-knapp i planeringsläge
- `i`-markör i live/läsläge
- dialog för att läsa/skriva anteckning
- anteckningar sparas i Supabase
- anteckningar exkluderas från PDF/JPG-export

### Sprint 9: Adressbok Och Förslagskö

Lade till:
- Supabase-tabeller för adressbok och adressförslag.
- Edge Function `address-book`.
- Status i ansvariglistan: `E-post hämtad`, `Saknar e-post`, `Kontrollera e-post manuellt`, `Förslag skickat`.
- Matchad adress visas inte i fältet och sparas inte i planens payload.
- Mailutkastet hämtar matchade adresser vid klick.
- Knapp `Föreslå till adresslistan` visas när namn saknar match men e-post fyllts manuellt.
- Adminläge via `?admin=<token>` där förslag kan godkännas eller avvisas.

Viktigt beslut:
- E-postadresser döljs i normal planeringsvy och läsläge.
- Det går inte att skapa ett `mailto:` utan att klienten till slut får adresserna. Därför returnerar `resolve-emails` adresser först vid mailklick.
- Adressboken ska inte kunna ändras direkt av vanliga användare; de kan bara lämna förslag.

## Nuvarande Kända Risker / Öppna Saker

- GitHub Pages måste publiceras efter lokala ändringar, annars testas gammal frontend.
- Lokalt test mot Supabase kan kräva korrekt `ALLOWED_ORIGIN`.
- Läslänkar för gamla datum fungerar inte eftersom de är utgångna enligt design.
- PDF sidhuvud/sidfot styrs av browsern.
- `mailto:` kan inte bifoga PDF/JPG automatiskt.
- Automatisk bevarande av manuella ändringar mot kalenderdata försöktes men togs bort. Nu är strategin manuell kalenderhämtning.
- Om användaren testar lokalt på mobil via IP måste CORS inkludera just den IP-origin.
- Adressbokens `resolve-emails` är publik eftersom frontend behöver den för `mailto:`. Den bör inte ses som stark sekretess, utan som minimerad exponering: normal lookup visar inte adresser, men mailflödet kan hämta dem för angivna namn.
- Admin-token för adressförslag ska behandlas som lösenord och aldrig commitas.

## Arbetsregel Framåt

När ny funktionalitet, bugfix eller viktigt beslut görs:
- Uppdatera denna fil i samma pull/commit.
- Skriv kort vad som ändrats, varför, och om något behöver deployas.
- Om Supabase-funktioner ändras: notera om de är deployade.
- Om frontend ändras: bumpa versionssträng i `index.html` för `app.js`/`styles.css`.

Den här filen ska fungera som startpunkt för en ny chattsession eller efter kontextkomprimering.

## Senaste Fixar

2026-05-02:
- Fixade bugg där `Föreslå till adresslistan` aldrig visades eftersom templaten hade CSS-klassen `hidden` och renderingen bara ändrade HTML-attributet `hidden`.
- Lösning: renderingen togglar både `hidden`-attributet och `.hidden`-klassen.
- `app.js` cache-bumpad till `20260502d`.

2026-05-02:
- Justerade ansvarigradens desktoplayout till fem stabila kolumner: roll, namn, e-post, e-poststatus/förslagsknapp och ta bort.
- Syftet är att `Föreslå till adresslistan` inte ska påverka bredden/alignment på roll-, namn- och e-postfält i övriga rader.
- Namnkolumnen minskades något till förmån för e-postkolumnen, enligt beslut.
- `styles.css` cache-bumpad till `20260502d`.

2026-05-02:
- Flyttade ansvarigas e-poststatus (`Saknar e-post`, `E-post hämtad`, `Manuell e-post`) till e-postfältets placeholder/spöktext i stället för separat statuskolumn.
- Statusytan används nu främst för `Föreslå till adresslistan` och `Förslag skickat`.
- Minskat ta-bort-kolumnen och själva `Ta bort`-knappen i ansvarigraderna.
- Namnkolumnen minskades ytterligare till förmån för e-postfältet.
- `app.js` och `styles.css` cache-bumpade till `20260502e`.

2026-05-02:
- Ändrade `Kopiera läslänk` så lyckad kopiering inte visar alert.
- Knappen byter i stället text till `Läslänk kopierad!` i några sekunder.
- Kopieringen använder `navigator.clipboard.writeText` i secure context och fallback med temporär textarea/`execCommand("copy")` för bättre stöd på mobil och localhost.
- `app.js` cache-bumpad till `20260502f`.

2026-05-02:
- Fixade risk där läslänk/mail från adminläge kunde ärva `admin=<token>` från aktuell URL.
- Ny helper `buildReadUrl()` tar alltid bort `admin` och `plan` innan `read=<share_token>` sätts.
- Används både av `Kopiera läslänk` och `Skapa e-postutkast`.
- `app.js` cache-bumpad till `20260502g`.

2026-05-02:
- Lade till rensning av manuellt sparade e-postadresser två dagar efter gudstjänstdatumet.
- Backend: `plans` normaliserar payload så `responsible[].email` töms när datumets retentiontid passerat, både vid POST och vid GET via id/datum.
- Backend uppdaterar också befintlig Supabase-rad när en gammal plan läses via id/datum och fortfarande innehåller manuella e-postadresser.
- Frontend: `buildPersistBody()` tömmer e-postfält i payload för gamla datum innan sparning som extra skydd.
- Läsläge döljer sedan tidigare alltid e-post.
- `plans` Edge Function är deployad efter ändringen.
- `app.js` cache-bumpad till `20260502h`.
