# CarCrow

En svensk bilsökapp för Windows och Mac. Starten är en chat: beskriv bilen du söker och följ när CarCrow söker, öppnar originalannonser och jämför priser. Bilder och bilkort kommer från den lokala annonsdatabasen.

AI använder enbart **`openrouter/free`** med riktig strömning och verktygsanrop. Appen växlar aldrig till en betald modell. Gratisroutern väljer en tillgänglig modell som stöder verktygen; hastighet och tillgänglighet varierar. Den privata paketeringen använder den nyckel du har godkänt. Nyckeln är inbyggd i det privata paketet. Nyckel och modell kan inte ändras i appen eller via dess gränssnittsanrop. Ingen nyckel skickas till gränssnittet eller ligger i detta källkodspaket.

## Använd appen

- Mac: packa upp rätt Mac-zip och flytta `CarCrow.app` till Program. Apple Silicon använder arm64; äldre Intel-Mac använder x64.
- Windows 10/11, 64 bit: kör `CarCrow-Windows-Setup.exe`, eller packa upp hela `CarCrow-Windows.zip` och starta `CarCrow.exe` med alla filer bredvid.
- Skriv exempelvis ”BMW eller Audi under 150 000 kr, automat och max 15 000 mil”. Stoppa-knappen avbryter AI-anrop och pågående källhämtning.
- Fortsätt i samma chat. Välj bilar för jämförelse, spara favoriter eller bevaka sökningen. Öppna ett bilkort för originalannonser och verklig prishistorik.
- Alla bilar har vanlig bilsökning med manuella filter. Varje ny sökning börjar hos källornas aktuella annonser. När du bläddrar vidare hämtas fler vanliga sidor hos anslutna källor. Endast synliga kort renderas.

Appen är byggd utan utvecklarcertifikat och är inte notariserad. Mac kan kräva Högerklick → Öppna. Windows kan visa SmartScreen för en osignerad app.

## Data och AI

Kvdbils fastprisannonser och Riddermarks bilannonser ingår också. Blocket ansluts via den inofficiella tjänsten [BlocketAPI](https://blocket-api.se). Bytbil, Bilweb och Wayke läses via vanliga publika sök- och annonssidor. Det finns inga cookies, inloggningssessioner, proxyrotationer eller kringgående av anti-bot-system. HTTP 403/429 och formatfel visas och befintliga data behålls. HTTPS-omdirigeringar följs endast till samma ursprung och högst tre gånger.

Sökningen hämtar aktuella sidor när du söker och skrollar. CarCrow visar inget totalt träffantal och behöver inte köras i bakgrunden. SQLite används som tillfällig annonscache och för dina sparade bilar och chattar. Obesläktade gamla annonser visas inte i en ny sökning. Källornas sökfönster och tillgänglighet kan begränsa resultatet.

Bevakningar kontrolleras varje gång du öppnar appen och kan även kontrolleras manuellt i sin egen flik. Där visas senaste kontroll och nya matchningar. Borttagna favoriter ligger i Inställningar → Arkiverade i exakt 24 timmar och kan återställas där.

Rekommenderade använder Googles **EmbeddingGemma 2**, kvantiserad textencoder med 256 dimensioner, på din dator. Modellen följer med appen och kräver ingen separat installation. Sparade bilar och dina senaste sökningar formar urvalet; den lokala rekommendationsmodellen skickar inga uppgifter till någon molntjänst. Välj ljust, mörkt eller systemets tema i Inställningar.

”Fynd” beräknas med median för minst fem andra unika bilar med samma modell, variant, bränsle, växellåda och kaross, årsmodell ±2 år och miltal ±30 % (minst ±2 000 mil). Annonspriser är inga slutpriser. Låga eller felaktiga uppgifter kan finnas i källannonser. AI får verkliga verktygsresultat och instruktioner att inte gissa; varje svar från en språkmodell kan fortfarande behöva kontrolleras mot bilkort och originalannonser.

AI-anrop skickar ditt meddelande, relevant chatthistorik, sökfilter och utvalda annonsuppgifter till OpenRouter och den modell som gratisroutern väljer. Dina nycklar finns enbart i huvudprocessen. Rendererprocessen har ingen Node-åtkomst och använder begränsad IPC. Databasen lagras lokalt, vanligtvis `~/Library/Application Support/CarCrow/carcrow.sqlite` eller `%APPDATA%\CarCrow\carcrow.sqlite`. Säkerhetskopiera den när appen är stängd.

## Utveckling

Node 24 rekommenderas.

```sh
npm ci
npm test
npm run build
# För rekommendationer: förbered modellen enligt docs/LOKAL_MODELL.md
npm start
```

`npm run pack:mac` bygger arm64/x64 på Mac. `npm run pack:win` bygger Windows-zip och `npm run dist:win` bygger NSIS. För privat paketering kan en lokal, Git-ignorerad `electron/provisioned-key.cjs` exportera din nyckel. Den ingår då i dina privata binärer och måste behandlas som hemlig. Distribuera inte dessa vidare. Offentlig källkod och CI ska inte innehålla filen.

`node scripts/smoke.cjs` testar det verkliga Electron-gränssnittet med tydligt märkta exempelbilar, inklusive att ändringar av AI-nyckel och modell avvisas. AI-/marknadstesterna använder separata deterministiska testfixturer. Live-tester körs separat med verkliga källor och OpenRouter Free. För Windows finns [kontrollskript och CI](docs/WINDOWS_TEST.md). Se [verifieringsrapporten](docs/VERIFIERING.md) för vad som faktiskt har körts.

Se [lokal modell och reproducerbar export](docs/LOKAL_MODELL.md).
