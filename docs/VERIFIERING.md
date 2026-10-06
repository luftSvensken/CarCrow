# Verifiering av CarCrow 0.2.0

6 oktober 2026. Rapporten skiljer tester av källkod, riktiga nätanrop och körning av leveranspaket.

| Kontroll | Resultat |
|---|---|
| TypeScript och Vite-produktionsbygge | Godkända. |
| Databas, import, deduplicering, bevakningar, median, parser, agent, SSE, avbrott och pagination | 45 automatiska tester godkända. Äldre tester för den ersatta AI-planeraren har tagits bort. |
| Hela lokala databasen | Test visar att fynd efter den tidigare gränsen på 2 000 kandidater är sökbara. Ingen sådan totalgräns finns kvar. |
| Mac-gränssnitt i Electron | Nio kontrollsteg godkända: chatstart, virtualiserade bilkort, favoriter, filter, originalerbjudanden/dubbletter, median, bevakningar, jämförelse, smal layout och synliga AI-fel. |
| Låst AI-konfiguration | Verifierad i de färdiga Apple Silicon- och Intel-paketen. Nyckelfält saknas och ändringsförsök avvisas via riktig IPC. Alla tre privata paket innehåller den godkända, fasta nyckeln; bootstrap lämnar inte ut den. |
| Produktionsberoenden | npm audit: inga kända sårbarheter. |
| OpenRouter Free, verkligt nätanrop | Auktoriserad nyckel verifierad. `openrouter/free` strömmade 65 innehållsdelar och ett riktigt sökverktygsanrop i första testet. |
| Full agentloop, verkliga källor | Den privata Mac-appen slutförde sökning och följdfråga med den fasta nyckeln. 30 lokala matchningar i den filtrerade sökningen; följdfrågan läste originalannonser för tre valda bilar och visade att jämförelseunderlaget var otillräckligt. 1 524 strömmade textdelar sammanlagt, inga sidfel. Antal är en ögonblicksbild, inte marknadstäckning. |
| Vanlig sidbläddring | Bytbil: sida 2 gav ytterligare annonser. Bilweb: två 23-postsidor utan gemensamma länkar. Wayke: 24 + 13 länkar i den filtrerade sökningen. |
| Mac-paketering arm64 och x64 | Byggda. Båda paketen har passerat gränssnittstestet; x64 kördes i Rosetta. Låst AI-konfiguration är verifierad i båda. Slutliga rapporter finns i testbevisen. |
| Windows x64 | Godkänt på GitHubs Windows-maskin: 45 datatester, produktionens gränssnitt, paketering, nio gränssnittssteg i portabel app och samma steg efter riktig NSIS-installation. Installeraren avslutade med kod 0. Den lokala privata Windows-versionens nyckel och identiska huvudprocesskod har kontrollerats separat. |

## Leverans och kontroller

[Windows-körningen](https://github.com/luftSvensken/CarCrow/actions/runs/37503145272) är godkänd, med commit `2267b4b81db55f492ecea14a5fec569a86fb9318`. Både portabel app och installerad app rapporterar `win32`, `x64`, `passed` och låst AI-konfiguration. Bilder och JSON-rapporter från Windows och båda Mac-arkitekturerna ingår i leveransens testbevis.

CI använder en kopia av källkoden utan API-nyckel och isolerade exempelbilar. Den hårdkodade privata nyckeln finns bara i de lokala installationspaketen. Privata binärer laddas inte upp till GitHub. Den riktiga AI-sökningen har körts på Mac; live-anrop med din nyckel har inte körts på Windows. Appkoden för anslutningen är densamma på plattformarna.

Mac-appen är installerad i användarens lokala programmapp. Befintliga favoriter och tidigare chattar bevarades i den normala lokala databasen. Avbrottsknappen har provats i det privata paketet. AI-inställningen är skrivskyddad även för bakomliggande anrop.

## Praktiska begränsningar

Fria OpenRouter-modeller kan ge olika svar och kan ha tillfälliga begränsningar. Att en agentloop slutförs innebär inte att varje möjlig textfråga eller varje modell är perfekt. Bilkort, filter och prisjämförelser kommer från verifierad databaslogik. Modellen har instruktioner att inte hitta på annonsfakta, men all text måste kunna kontrolleras mot de faktiska annonserna.

HTML-källor kan ändra format eller åtkomst. Ingen fullständig Sverigespegel eller garanterad åtkomst till alla annonser utlovas. Osignerade privata paket saknar Apple-notarisation och verifierad Windows-utgivarsignatur.
