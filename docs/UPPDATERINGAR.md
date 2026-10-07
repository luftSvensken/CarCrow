# Uppdateringar och drift

CarCrow 0.6 använder en Cloudflare Worker på gratisnivån. Den publicerade appen innehåller ingen OpenRouter-nyckel. `electron/ai-config.json` pekar på Workern, som väljer Nemotron 3 Super (free) och Nemotron 3 Ultra (free) som reserv. Endast godkända gratismodeller och strömmande anrop tillåts; prisgränsen för indata, utdata och anrop är noll. Nyckeln lagras som `OPENROUTER_API_KEY` i Cloudflare. Webbsökningen använder Tavilys officiella API via samma Worker. `TAVILY_API_KEY` är en separat Cloudflare-hemlighet. Gratisnivån ger 1 000 krediter per månad, och Workern tvingar basic-sökning utan betalda extrafunktioner. En sökning kostar en kredit och läsning av upp till tre relevanta källor högst en extra kredit. Identiska frågor cachas i 15 minuter. En gräns på sex sökningar per IP och minut minskar missbruk.

En gräns på 18 anrop per IP och minut minskar missbruk; OpenRouters delade gratiskvot kan fortfarande ta slut.

## Publicera en version

1. Ändra `version` i `package.json` och kör `npm install --package-lock-only`.
2. Skicka ändringen till GitHub och låt kontrollflödena testa den.
3. Kör flödet **Release CarCrow** i GitHub Actions för önskad version.
4. Flödet bygger och testar Mac Apple Silicon och Windows innan samma version publiceras i GitHub Releases. Mac signeras uttryckligen, och den färdiga zippen packas upp igen för strikt signaturkontroll, karantänmarkering och ett prov som upptäcker ändrade appresurser. Felaktiga signaturer stoppar publiceringen.

Appen kontrollerar den publika senaste stabila releasen. Vid start och var sjätte timme hämtas en ny verifierad version i bakgrunden. Den installeras när användaren avslutar CarCrow. Den nya appen kontrollerar att React-gränssnittet startar i ett dolt fönster och avslutas sedan; nästa vanliga start öppnar den nya versionen. Användaren kan även välja Installera nu i Inställningar → Uppdateringar. Avbrutna hämtningar installeras aldrig. Ett färdigt paket återanvänds efter omstart först sedan både aktuell GitHub-metadata och filens kontrollsumma verifierats igen. Hämtningen måste stämma med GitHubs SHA-256 och exakta filstorlek. Chattar, bevakningar och sparade bilar ligger i användarens separata datamapp. Mac installerar genom att byta appmapp och återställa den tidigare appen om den nya inte startar. Windows installerar med NSIS i samma installationsmapp.

Projektet måste vara publikt för att appens uppdateringar ska fungera utan GitHub-inloggning. Installera 0.5.1 eller senare manuellt från 0.3. Från 0.4 kan du använda dess uppdateringsknapp; från 0.5 hämtas och installeras framtida uppdateringar automatiskt. Mac-versionen har en komplett ad-hoc-signatur men är inte Apple-notariserad; första installationen kan kräva Systeminställningar → Integritet och säkerhet → Öppna ändå. Windows kan kräva SmartScreen-bekräftelse. Se [Mac-installation och signering](MAC_INSTALLATION.md).

## Worker

```sh
cd worker
npm ci
npm test
npm run check
npx wrangler secret put OPENROUTER_API_KEY
npx wrangler secret put TAVILY_API_KEY
npm run deploy
```

Skriv aldrig hemligheter i Git, GitHub Actions-loggar eller apppaket. Workern behöver inget betalt abonnemang. Gratisnivåernas kvoter begränsar tillgängligheten och appen ska visa det tydligt.

## Ortsdata och valfri position

Ortsnamn och centrumkoordinater kommer från [GeoNames](https://www.geonames.org/) under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Den medföljande listan är bearbetad till svenska orter. Återskapa den med `node scripts/prepare-places.cjs SE.txt admin1CodesASCII.txt`. Avstånd är ungefärliga fågelvägsavstånd; när annonsen bara anger ort används ortens centrum. Efter uttryckligt samtycke kan Workern returnera anslutningens ungefärliga svenska ort. Ingen kontinuerlig positionsspårning sker. VPN kan ge fel ort. AI:n får ortsnamnet, aldrig koordinaterna. Stäng av delningen i Inställningar för att radera den automatiska platsen. Manuell ort fungerar utan samtycke.
