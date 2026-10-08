# Verifiering av CarCrow 0.7.1

Lokalt kontrollerad 8 oktober 2026. 145 data- och agenttester passerar på Mac; ett ytterligare plattformstest körs på Windows. Regressionsfallen omfattar månadsannonser som tidigare låg kvar i cachen, jämnt fördelade sökspår, återval av märken och prisändringar under AI-granskningen.

Tre AI-prioriteringar behåller alla 100 hämtade matchningar i testet. Fortsatt hämtning tar listan från 50 till 100 och 102 annonser utan ytterligare AI-anrop. Gränssnittstestet `scripts/smoke-search-all.cjs` verifierar verklig IPC-hämtning, sparad chatt med 100 kort, sortering utanför det första urvalet samt bred och smal layout. Kontrollerna ingår i båda plattformarnas publiceringsflöden.

Det senaste testet med riktiga Blocket-annonser och gratis-AI gav 149 matchningar för en första bil med maxbudget 60 000 kr. Tre prioriterades först; övriga visas också och fler sidor kan hämtas. Påståenden om skick, service och driftskostnad kontrolleras mot annonsunderlaget. Antal och svarstid varierar med annonser, nätverk och modellens tillgänglighet.

Mac-uppdateraren flyttar det verifierade appaketet inom samma disk och har reservkopiering när installationen ligger på en annan disk. Tester verifierar bevarade filer och att en misslyckad reservkopiering städas bort utan att ändra den fungerande appen.

# Tidigare verifiering av CarCrow 0.7

`npm test` omfattar samtalsändringar, bilurval, betalningsformer, fortsatta sökspår och migrationsskydd. `scripts/smoke07.cjs` verifierar sortering av AI-urval, bilfrågor, liknande bilar, borttagna filter samt bred och smal layout med en separat profil. Windows och Mac-paketen kör dessa kontroller före publicering.

Aktuella annonser och gratis-AI provas separat; nätverksresultat och svar kan variera. Inga riktiga användarchattar eller nycklar följer med testprofiler eller GitHub.

# Tidigare verifiering av CarCrow 0.6

Lokalt kontrollerad 7 oktober 2026. Releaseflödet publicerar endast efter godkända Windows- och Apple Silicon-kontroller av de faktiska paketen.

- 117 data- och agenttester passerar på Mac. Ett plattformstest kör PowerShell-parsern på Windows. Nya tester omfattar egna märken, ort/radie, hårda intervall, lokal omsortering, SQL.js-reserv, chattsökning, verkligt ID-urval och Bilweb-migrering. Laddhybridfiltret känner igen uttryckliga PHEV-uppgifter även när källans bränslefält säger Hybrid; gamla cacheposter rättas med bibehållna sparningar.
- Elva Worker-tester samt typkontroll och torr publicering passerar. Koordinater går inte till AI-modellen. Platsdelningen är avstängd från början och kräver uttryckligt samtycke.
- 17 befintliga och åtta nya kontroller av Electron-gränssnittet passerar, inklusive sökbara filter, egen märkestext, ort utan positionsdelning, felaktiga intervall och sökning i chattmeddelanden. Den verkliga lokala EmbeddingGemma 2-modellen ingår i paketerade tester.
- Verkliga V70 Business- och ortsökningar har gett 51 matchande annonser. BYD som tidigare saknades i märkeslistan fungerar. Första kort visas före full källomgång; lokal omsortering tog cirka 2–4 ms i dessa körningar. Tider varierar med dator, nätverk och källor.
- Webbimporten har verifierat originalannonser hos bland annat Holmgrens Bil och Wayke. Bilkort skapas endast från läsbara originaluppgifter; saknade uppgifter förblir okända och klarar inte hårda intervallfilter.
- AI:n har testats med riktiga annonser för billig första bil under 60 000 kr och V70 Business som uppföljning. Den väljer ett begränsat urval från verkliga kandidater. Påståenden om skick och service kräver annonsunderlag. Originalbeskrivningar används för att skilja leasingöverlåtelser från kontantannonser.

## Praktiska gränser

Mac-paketet har en komplett ad-hoc-signatur men saknar Developer ID och Apple-notarization. Zippen kontrolleras med strikt kodsignaturkontroll, karantänmarkering och ett manipuleringstest. Första installationen kan kräva Systeminställningar → Integritet och säkerhet → Öppna ändå. Windows kan visa SmartScreen.

Källors tillgänglighet och format kan ändras. Appen kringgår inga åtkomstbegränsningar och hämtar inte hela Sveriges marknad i bakgrunden. Källomgången är ett inväntat urval, inte bevis på full marknadstäckning. Felaktiga prisuppgifter kan fortfarande finnas i originalannonser.

Avstånd är ungefärliga fågelvägsavstånd från ortscentrum när en exakt annonsplats saknas. Valfri automatisk ort använder nätanslutningens ungefärliga plats, som kan vara fel med VPN. Manuell ort kan alltid väljas. Ortsdata är bearbetade från [GeoNames](https://www.geonames.org/), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

Prisbilden kräver minst fem andra jämförbara annonser och bevisar inte bilens skick. Cloudflare, Tavily och OpenRouter används inom gratisnivåerna. Delade kvoter och gratismodellernas hastighet begränsar tillgängligheten. AI-svar ska kunna kontrolleras mot bilkort och lästa originalkällor.
