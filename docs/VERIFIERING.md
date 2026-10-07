# Verifiering av CarCrow 0.4

Kontrollerad 7 oktober 2026. Slutliga rapporter och bilder finns i leveransens `CarCrow-Testbevis`.

- 67 data- och agenttester passerar, inklusive personliga urval, strikta bevakningsfilter, progressiva resultat, webbkällor, kodpåståenden och återställning efter misslyckat appbyte.
- Sex Worker-tester passerar. De verifierar gratisroutern, begränsade verktyg, strömning, kvoter och att hemligheter inte läcker i svar.
- Mac Apple Silicon- och Intel-paketen passerar 15 gränssnittskontroller med den verkliga lokala modellen. Fokusram, kråkhopp, bevakningarnas annonser, rekommendationer, teman och uppdateringsknappar ingår.
- Faktiska Mac-appbyten på Apple Silicon och Intel via Rosetta i isolerade installationer passerar. Den ersättande appens React-gränssnitt startar och sparad bil, chatt, bevakning och tema bevaras.
- Blocket/Bilweb i ett verkligt test gav första kortet efter cirka 0,5 sekunder och båda källorna efter cirka 1,4 sekunder. Mättiden beror på nätverk och källor.
- Det kompletta livetestet i det paketerade Mac-gränssnittet passerar: Blocket, Bytbil, Wayke, Bilweb, Kvdbil och Riddermark svarar utan fel. OpenRouter Free strömmar 369 innehållsdelar och ger ett kort svar från det verkliga, strikt filtrerade bilurvalet.
- Verklig strömning från Cloudflare/OpenRouter Free har verifierats. Tavily-sökningen läser faktiska rapporter och ger ursprungliga länkar. Appen returnerar osäkerhet när underlaget inte styrker den exakta varianten.
- Produktionsberoenden har inga kända sårbarheter enligt npm audit vid kontrollen.

Windows x64 passerar 68 tester (67 data- och agenttester samt PowerShell-parsern), sex Worker-tester och 15 UI-kontroller vardera för portabel och faktiskt installerad app. NSIS-installation, verklig uppdatering, omstart och bevarad bil, chatt, bevakning och tema passerar i [körning 37596183750](https://github.com/luftSvensken/CarCrow/actions/runs/37596183750). Den slutliga publiceringen testar samtliga paket igen innan de blir tillgängliga.

## Praktiska gränser

Källors tillgänglighet och format kan ändras. Nekad åtkomst visas utan kringgående. Appen hämtar aktuella annonssidor vid sökning och bevakningskontroller; den hämtar inte hela Sveriges marknad i bakgrunden. En tom delmängd bevisar inte att gamla annonser tagits bort.

Rekommendationer använder en lokal 256-dimensionell int8-textencoder från Google EmbeddingGemma 2. Windows-exporten använder reducerat viktintervall för korrekt x64-inferens. Prisbilden kräver minst fem andra jämförbara annonser och är ingen garanti för bilens skick.

Cloudflare, Tavily och OpenRouter används inom sina gratisnivåer. Kvoter kan begränsa tillgängligheten. AI-svar måste kunna kontrolleras mot de lästa källorna och originalannonsen. Första installationen är osignerad och kan kräva OS-bekräftelse.
