# Verifiering av CarCrow 0.3

Kontrollerad 6 oktober 2026. Rapporter och bilder finns i leveransens `CarCrow-Testbevis`.

- 55 data- och agenttester godkända: exakta filter, deduplicering, uppdateringar, borttagningar, 24-timmarsarkiv, nya söksessioner och sidbläddring.
- Färdiga Apple Silicon- och Intel-appar godkända i 11 gränssnittssteg vardera. Intel-appen kördes i Rosetta. Båda körde den verkliga lokala EmbeddingGemma 2-modellen.
- Ett verkligt test i det privata Apple Silicon-paketet hämtade aktuella annonser från Blocket, Bytbil, Bilweb, Wayke, Kvdbil och Riddermark. Alla sex källor svarade utan källfel i sluttestet.
- OpenRouter `openrouter/free` strömmade 252 innehållsdelar. Det slutliga svaret var 22 ord och priset hämtades från det verkliga bilurvalet. Svar som upprepar bilkort, visar träffantal eller innehåller främmande prisuppgifter kortas till en datagrundad slutsats.
- Mörkt/ljust tema, arkivåterställning, manuella filter, historik i smalt fönster och lokal rekommendering har provats. Inga sidfel rapporterades.
- Mac- och Windows-paketen innehåller samma huvudprocesskod och den privata fasta nyckeln. Nyckel- och modelländringar avvisas; nyckeln returneras aldrig till gränssnittet. Källkodspaketet och GitHub innehåller ingen nyckel eller användardatabas.
- Produktionsberoenden: inga kända sårbarheter enligt npm audit vid slutkontrollen.

Windows 0.3 godkändes på en verklig Windows x64-maskin i [GitHub Actions-körning 37525366628](https://github.com/luftSvensken/CarCrow/actions/runs/37525366628), mot commit `185e7a93d6e40d06d12cd34266a57d41d4782719`. Alla 55 datatester och 11 gränssnittskontroller vardera för portabel och faktiskt installerad app passerade. NSIS-installationen returnerade 0. Testet använde den verkliga lokala modellen och isolerade testbilar; det använde ingen privat OpenRouter-nyckel. De privata leveranspaketen har samma appkod och den fasta nyckeln från Mac-paketet.

Appen är installerad i användarens programmapp och öppnad. Den lokala databasen bevarades; innehållet jämfördes före och efter installationen.

## Praktiska gränser

Källors tillgänglighet och sidformat kan ändras, och BlocketAPI har ett begränsat sökfönster. Misslyckad åtkomst visas utan kringgående. Varje sökning börjar hos aktuella källor; appen hämtar inte hela Sveriges marknad i bakgrunden. En tom delmängd är aldrig bevis på att gamla annonser tagits bort.

Rekommendationer använder den lokala textencodern i Google EmbeddingGemma 2, kvantiserad till int8, med 256 dimensioner och 256 token. Den följer med appen. Mac-exporten nådde 0,988–0,992 i kosinusöverensstämmelse med originalet för tre svenska texter. Windows-exporten använder reducerat int8-viktintervall och nådde 0,9895; dess faktiska lokala rangordning och båda Windows-apparnas rekommendationsvy passerade. Prisjämförelser använder verkliga annonspriser och kräver minst fem andra jämförbara bilar; priserna är inte slutpriser eller bevis på bilens skick.
