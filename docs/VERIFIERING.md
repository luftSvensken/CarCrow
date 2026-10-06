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
| Full agentloop, verkliga källor | `openrouter/free` anropade marknadssökning och läste flera originalannonser. Testet slutfördes efter cirka 29 sekunder, med 956 textdelar och 33 lokala matchningar före den senare rättningen av märkta månadspriser. Antal är en ögonblicksbild, inte marknadstäckning. |
| Vanlig sidbläddring | Bytbil: sida 2 gav ytterligare annonser. Bilweb: två 23-postsidor utan gemensamma länkar. Wayke: 24 + 13 länkar i den filtrerade sökningen. |
| Mac-paketering arm64 och x64 | Byggda. Båda paketen har passerat gränssnittstestet; x64 kördes i Rosetta. Låst AI-konfiguration är verifierad i båda. Slutliga rapporter finns i testbevisen. |
| Windows x64 | Zip och NSIS byggda; x64 PE-arkitektur och medpackad privat konfiguration kontrollerade. Verklig Windows-körning och installation återstår; se nedan. |

## Vad som fortfarande behöver verifieras

Windows-installation, gränssnitt, låst AI-konfiguration och live-AI behöver köras på Windows. Inget Windows-system är tillgängligt i denna Mac-byggmiljö. GitHub-anslutningen undersöks för att kunna köra Windows-kontroller. Det förberedda `scripts/verify-windows.ps1` och GitHub Actions-flödet kan göra installations- och gränssnittstester på en tillfällig Windows-runner. Det flödet har inte körts.

Fria OpenRouter-modeller kan ge olika svar och kan ha tillfälliga begränsningar. Att en agentloop slutförs innebär inte att varje möjlig textfråga eller varje modell är perfekt. Bilkort, filter och prisjämförelser kommer från verifierad databaslogik. Modellen har instruktioner att inte hitta på annonsfakta, men all text måste kunna kontrolleras mot de faktiska annonserna.

HTML-källor kan ändra format eller åtkomst. Ingen fullständig Sverigespegel eller garanterad åtkomst till alla annonser utlovas. Osignerade privata paket saknar Apple-notarisation och verifierad Windows-utgivarsignatur.
