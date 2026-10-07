# CarCrow

En svensk bilsökapp för Windows och Mac. Starten är en chatt: beskriv bilen du söker och följ när CarCrow söker, öppnar originalannonser och jämför priser. AI:n handplockar bilkort från verkliga, kontrollerade annonser.

AI använder **Nemotron 3 Super (free)** med **Nemotron 3 Ultra (free)** som reserv via OpenRouter. Modellerna är fasta; appen använder inte gratisrouterns slumpmässiga val. Verktygsanrop och riktig strömning stöds. Workern tillåter endast godkända gratismodeller och sätter prisgränsen till noll. Hastighet och tillgänglighet varierar. AI-nyckeln ligger som en hemlighet i Cloudflare Worker. Appen innehåller ingen AI-nyckel, och användaren behöver varken ange nyckel eller logga in. Gratisnivåernas kvoter delas av användarna. Vid uppnådd kvot visas ett fel; appen växlar aldrig till betalning.

## Använd appen

- Mac: packa upp rätt Mac-zip och flytta `CarCrow.app` till Program. Mac-versionen kräver Apple Silicon (M1 eller senare).
- Windows 10/11, 64 bit: kör `CarCrow-Windows-Setup.exe`, eller packa upp hela `CarCrow-Windows.zip` och starta `CarCrow.exe` med alla filer bredvid.
- Skriv exempelvis ”BMW eller Audi under 150 000 kr, automat och max 15 000 mil”. Stoppa-knappen avbryter AI-anrop och pågående källhämtning.
- Fortsätt i samma chatt. Välj bilar för jämförelse, spara favoriter eller bevaka sökningen. Öppna ett bilkort för originalannonser och verklig prishistorik.
- Alla bilar har vanlig bilsökning med manuella filter. Varje ny sökning börjar hos källornas aktuella annonser. De första annonserna visas direkt och resterande källor fortsätter i bakgrunden. När du bläddrar vidare hämtas fler vanliga sidor hos anslutna källor. Endast synliga kort renderas. Sökningen delar upp orden och matchar över annonsens verkliga fält: ”V70 business” kräver inte att orden står bredvid varandra. Märkesalias, vanliga stavfel, utrustningsprefix och ”eller” stöds. Välj Relevans för bästa textmatchning.

Mac-paketet har en ad-hoc-signatur som förseglar hela appens innehåll. Det är inte Apple-notariserat och saknar Developer ID-certifikat. Vid första öppningen kan macOS därför kräva Systeminställningar → Integritet och säkerhet → Öppna ändå. En varning om att utvecklaren inte kan verifieras är skild från en trasig kodsignatur. Windows kan visa SmartScreen för en osignerad app.

## Nytt i 0.6

- Filter med sökbara märken och modeller, egna märken, pris- och milintervall, kaross, säljartyp, bilder, datum och datakällor. Sortering sker lokalt i den hämtade annonsgruppen.
- Välj ort, sökradie och närmaste bilar. Valfri ungefärlig platsdelning är avstängd från början. AI:n får endast ortsnamnet och sökradien.
- AI:n väntar på källomgången, granskar original och handplockar ett mindre urval med korta motiveringar. Den kan söka på webben efter andra verkliga bilannonser och visa verifierade träffar som vanliga bilkort. Saknade uppgifter visas som okända.
- Sök lokalt i chattarnas rubriker och meddelanden.
- Bilweb har tagits bort. Sparade gamla bilar och chattar behålls.

## Data och AI

Kvdbils fastprisannonser och Riddermarks bilannonser ingår också. Blocket ansluts via den inofficiella tjänsten [BlocketAPI](https://blocket-api.se). Bytbil och Wayke läses via vanliga publika sök- och annonssidor. Det finns inga cookies, inloggningssessioner, proxyrotationer eller kringgående av anti-bot-system. HTTP 403/429 och formatfel visas och befintliga data behålls. HTTPS-omdirigeringar följs endast till samma ursprung och högst tre gånger.

Sökningen hämtar aktuella sidor när du söker och skrollar. CarCrow visar inget totalt träffantal och behöver inte köras i bakgrunden. SQLite används som tillfällig annonscache och för dina sparade bilar och chattar. Obesläktade gamla annonser visas inte i en ny sökning. Källornas sökfönster och tillgänglighet kan begränsa resultatet. Köpesannonser och symboliska priser på högst 100 kr ingår inte som prissatta försäljningsannonser. AI:n inväntar varje källomgång och fyller ett användbart urval innan slutsatsen visas. För kvalitativa önskemål som första bil hämtas både de billigaste och nypublicerade alternativen med samma uttryckliga budget; rekommenderade märken får inte bli påhittade hårda krav.

Bevakningar kontrolleras varje gång du öppnar appen och kan även kontrolleras manuellt i sin egen flik. Där visas senaste kontroll, nya matchningar och annonser som rangordnas med den lokala embeddingmodellen. Bevakningens filter måste uppfyllas före rangordning. Borttagna favoriter ligger i Inställningar → Arkiverade i exakt 24 timmar och kan återställas där.

Rekommenderade använder Googles **EmbeddingGemma 2**, kvantiserad textencoder med 256 dimensioner, på din dator. Modellen följer med appen och kräver ingen separat installation. Dina senaste chattmeddelanden, manuella sökningar, sparade bilar och öppnade eller jämförda bilar formar urvalet; den lokala rekommendationsmodellen skickar inga uppgifter till någon molntjänst. Välj ljust, mörkt eller systemets tema i Inställningar.

”Fynd” beräknas med median för minst fem andra unika bilar med samma modell, variant, bränsle, växellåda och kaross, årsmodell ±2 år och miltal ±30 % (minst ±2 000 mil). Annonspriser är inga slutpriser. Låga eller felaktiga uppgifter kan finnas i källannonser. AI får verkliga verktygsresultat och instruktioner att inte gissa; varje svar från en språkmodell kan fortfarande behöva kontrolleras mot bilkort och originalannonser.

AI-anrop skickar ditt meddelande, relevant chatthistorik, sökfilter och utvalda annonsuppgifter via Cloudflare till OpenRouter och den fasta modellen eller dess gratisreserv. AI-nyckeln lämnar aldrig Workern. Rendererprocessen har ingen Node-åtkomst och använder begränsad IPC. Databasen lagras lokalt, vanligtvis `~/Library/Application Support/CarCrow/carcrow.sqlite` eller `%APPDATA%\CarCrow\carcrow.sqlite`. Säkerhetskopiera den när appen är stängd.

Uppdateringar hämtas automatiskt i bakgrunden och installeras när appen avslutas. Nästa vanliga start använder den nya versionen. Du kan även välja Installera nu i Inställningar. Se [uppdateringar](docs/UPPDATERINGAR.md).

## Utveckling

Node 24 rekommenderas.

```sh
npm ci
npm test
npm run build
# För rekommendationer: förbered modellen enligt docs/LOKAL_MODELL.md
npm start
```

`npm run pack:mac` bygger arm64 på Mac. `npm run pack:win` bygger Windows-zip och `npm run dist:win` bygger NSIS. Alla paket och CI-byggen utesluter äldre privata nyckelfiler. Workern utvecklas och publiceras från `worker/`; dess hemligheter hanteras med Wrangler. Se [uppdateringar och publicering](docs/UPPDATERINGAR.md).

`node scripts/smoke.cjs` testar det verkliga Electron-gränssnittet med tydligt märkta exempelbilar, inklusive att ändringar av AI-nyckel och modell avvisas. AI-/marknadstesterna använder separata deterministiska testfixturer. Live-tester körs separat med verkliga källor och den fasta gratismodellen. För Windows finns [kontrollskript och CI](docs/WINDOWS_TEST.md). Se [verifieringsrapporten](docs/VERIFIERING.md) för vad som faktiskt har körts.

Se [lokal modell och reproducerbar export](docs/LOKAL_MODELL.md).
