# Uppdateringar och drift

CarCrow 0.4 använder en Cloudflare Worker på gratisnivån. Den publicerade appen innehåller ingen OpenRouter-nyckel. `electron/ai-config.json` pekar på Workern, som endast accepterar `openrouter/free` och strömmande anrop. Nyckeln lagras som `OPENROUTER_API_KEY` i Cloudflare. Webbsökningen använder Tavilys officiella API via samma Worker. `TAVILY_API_KEY` är en separat Cloudflare-hemlighet. Gratisnivån ger 1 000 krediter per månad, och Workern tvingar basic-sökning utan betalda extrafunktioner. En sökning kostar en kredit och läsning av upp till tre relevanta källor högst en extra kredit. Identiska frågor cachas i 15 minuter. En gräns på sex sökningar per IP och minut minskar missbruk.

En gräns på 18 anrop per IP och minut minskar missbruk; OpenRouters delade gratiskvot kan fortfarande ta slut.

## Publicera en version

1. Ändra `version` i `package.json` och kör `npm install --package-lock-only`.
2. Skicka ändringen till GitHub och låt kontrollflödena testa den.
3. Kör flödet **Release CarCrow** i GitHub Actions för önskad version.
4. Flödet bygger och testar Mac Apple Silicon, Mac Intel och Windows innan samma version publiceras i GitHub Releases.

Appen kontrollerar den publika senaste stabila releasen. Under Inställningar → Uppdateringar väljer användaren Sök efter uppdatering och Installera. Hämtningen måste stämma med GitHubs SHA-256 och exakta filstorlek. Chattar, bevakningar och sparade bilar ligger i användarens separata datamapp. Mac installerar genom att byta appmapp och återställa den tidigare appen om den nya inte startar. Windows installerar med NSIS i samma installationsmapp.

Projektet måste vara publikt för att appens uppdateringar ska fungera utan GitHub-inloggning. Äldre 0.3-installationer innehåller ingen uppdateringsfunktion; installera först 0.4 manuellt. Osignerade första installationer kan kräva macOS Öppna eller Windows SmartScreen-bekräftelse.

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
