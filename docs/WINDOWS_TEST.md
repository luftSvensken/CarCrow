# Windows-test

CarCrow 0.3 byggs och provas på Windows x64 via projektets GitHub Actions. Se [verifieringsrapporten](VERIFIERING.md) för det aktuella slutresultatet. Kontrollerna använder isolerade exempelbilar med AI-anslutningen avstängd och den verkliga lokala rekommendationsmodellen. Användarens annonser, databas och OpenRouter-konto används inte.

## På en Windows-dator

Packa upp källkoden i en lokal mapp och installera Node.js 24. Förbered först den verkliga modellen enligt [modellinstruktionen](LOKAL_MODELL.md). Kör sedan från PowerShell:

```powershell
./scripts/verify-windows.ps1
```

Skriptet installerar projektets npm-beroenden, kör datatesterna, bygger gränssnittet och paketerar zip och NSIS-installation. Det öppnar den portabla appen och provar sökning, filter, favoriter, detaljer, deduplicering, median, bevakningar, fynd, jämförelse, smalt fönster och låst AI-konfiguration. Programmet stängs och dess tillfälliga testdatabas tas bort. Bilder och JSON-rapport finns i `test-results/portable`.

Detta standardläge installerar inte CarCrow på datorn. NSIS-installationen kan provas separat med den byggda filen `release/CarCrow-Windows-Setup.exe`.

## Automatisk installation på GitHub Actions

Arbetsflödet finns i `.github/workflows/windows-acceptance.yml`. Det körs vid ändringar på main, vid pull requests och manuellt från **Actions → Windows acceptance → Run workflow**. Modellen exporteras från Googles original och måste klara en noggrannhetskontroll och ett verkligt rangordningstest innan paketeringen börjar.

GitHubs tillfälliga Windows-maskin verifierar först att källkoden inte innehåller privata nyckelfiler, kör alla standardkontroller och installerar sedan samma NSIS-paket för den aktuella testanvändaren. Gränssnittskontrollen och låst AI-konfiguration körs igen mot den installerade appen. Testinstallationen finns i maskinens tillfälliga mapp; maskinen försvinner efter jobbet. Därför är installationsläget begränsat till Actions-miljön. Paketeringen använder alltid `--publish never`. Isolerade testbilder, rapporter och den offentligt licensierade modellfilen sparas som körningens resultat. Privata programfiler och API-nycklar hålls lokalt.

Vid godkänt resultat innehåller körningen:

- `windows-test-evidence`: bilder, två gränssnittsrapporter och installationsresultat.
- `embeddinggemma2-text-model`: den verifierade modellen, tokeniseraren och Apache 2.0-licensen.

Inga OpenRouter-hemligheter ska läggas i repot eller arbetsflödet. Testdatabasen och `node_modules` laddas inte upp som resultat. Körningen kräver inga appnycklar. De privata lokala leveranspaketen har samma appkod och en separat, fast OpenRouter-anslutning.
