# Verifiering av CarCrow 0.5

Kontrollerad 7 oktober 2026. Lokala rapporter finns i leveransens CarCrow-Testbevis. Releaseflödet testar de faktiska paketen på varje plattform och publicerar först när alla kontroller passerar.

- 87 data- och agenttester passerar lokalt på Mac. Windows PowerShell-parsern körs separat på Windows. Textmatchning över fält, alias, BMW-modellfamiljer, alternativa sökningar, hårda budgetkrav, sena källsvar, symboliska priser, bevakningarnas källmatchningar och automatisk installation ingår.
- Åtta Worker-tester passerar. De verifierar fasta gratisreserver, prisgräns noll, begränsade verktyg, strömning, kvoter och skydd av hemligheter. Worker-typer och torr publicering passerar.
- Verklig sökning på Blocket, Bytbil, Wayke, Bilweb, Kvdbil och Riddermark ger resultat för V70 business, BMW 3-serie under 200 000, Honda Jazz under 60 000 och VW Golf under 100 000. Första korten visas efter ungefär 0,4–0,8 sekunder i dessa körningar; full källomgång tar ungefär 3–6 sekunder. Tider varierar med nätverk och källor.
- Den fasta Nemotron 3 Super-modellen testas med riktiga annonser genom den delade Workern. Första bil under 60 000 får ett brett urval med 96 bilkort utan påhittade märken eller årsmodellsgränser. Fortsättningen V70 business behåller budgeten och visar 48 bilkort. Ultra gav blandade resultat och är reserv. Gemma 4 31B svarade HTTP 429; dess kvalitet kunde därför inte bedömas.
- Mac- och Windows-paketen testas med den riktiga lokala EmbeddingGemma 2-modellen, kråkan, fokusramen, sparningar, bevakningar, teman och begränsad AI-konfiguration. Faktiska automatiska appbyten kontrollerar dold uppstart och bevarad chatt, sparad bil, bevakning och tema.

## Praktiska gränser

Mac-signering i 0.5.1 rättar det fel som 0.5:s gränssnittstester missade: den ursprungliga körbara filens signatur förseglade inte CarCrows resurser. Den färdiga zippen kontrolleras nu med strikt, rekursiv kodsignaturkontroll, karantänmarkering och en verklig ändring av en appresurs som måste underkännas. Ad-hoc-signeringen ersätter inte Apple-notarization; första öppningen kräver fortfarande användarens godkännande i macOS.

Källors tillgänglighet och format kan ändras. Nekad åtkomst visas utan kringgående eller automatiska upprepade försök i samma sökning. Appen hämtar aktuella annonssidor vid sökning och bevakningskontroller; den hämtar inte hela Sveriges marknad i bakgrunden. En tom delmängd bevisar inte att gamla annonser tagits bort.

Rekommendationer använder lokal EmbeddingGemma 2 med 256 dimensioner. Windows-exporten använder reducerat viktintervall för x64-inferens. Prisbilden kräver minst fem andra jämförbara annonser och bevisar inte bilens skick.

Cloudflare, Tavily och OpenRouter används inom gratisnivåerna. Kvoter kan begränsa tillgängligheten. AI-svar behöver kontrolleras mot lästa källor och originalannonsen. Första installationen är osignerad och kan kräva OS-bekräftelse.
