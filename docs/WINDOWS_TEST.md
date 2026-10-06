# Windows-test

Appen är byggd för Windows x64. En riktig Windows-körning återstår. Dessa kontroller använder isolerade exempelbilar med AI-anslutningen avstängd; användarens annonser, databas och OpenRouter-konto används inte.

## På en Windows-dator

Packa upp källkoden i en lokal mapp, installera Node.js 24 och kör från PowerShell:

```powershell
./scripts/verify-windows.ps1
```

Skriptet installerar projektets npm-beroenden, kör datatesterna, bygger gränssnittet och paketerar zip och NSIS-installation. Det öppnar den portabla appen och provar sökning, filter, favoriter, detaljer, deduplicering, median, bevakningar, fynd, jämförelse, smalt fönster och låst AI-konfiguration. Programmet stängs och dess tillfälliga testdatabas tas bort. Bilder och JSON-rapport finns i `test-results/portable`.

Detta standardläge installerar inte CarCrow på datorn. NSIS-installationen kan provas separat med den byggda filen `release/CarCrow-Windows-Setup.exe`.

## Automatisk installation på GitHub Actions

Det färdiga arbetsflödet finns i `.github/workflows/windows-acceptance.yml`. Lägg källkoden, inklusive `.github`-mappen, i ett GitHub-repo. Ett privat repo passar för privat bruk. Arbetsflödet körs manuellt från **Actions → Windows acceptance → Run workflow** på repots standardgren.

GitHubs tillfälliga Windows-maskin kör alla standardkontroller och installerar sedan samma NSIS-paket för den aktuella testanvändaren. Gränssnittskontrollen och låst AI-konfiguration körs igen mot den installerade appen. Testinstallationen finns i maskinens tillfälliga mapp; maskinen försvinner efter jobbet. Därför är installationsläget begränsat till Actions-miljön.

Vid godkänt resultat innehåller körningen:

- `windows-test-evidence`: bilder, två gränssnittsrapporter och installationsresultat.
- `CarCrow-Windows`: den verifierade installationsfilen och portabla zip-filen.

Inga OpenRouter-hemligheter ska läggas i repot eller arbetsflödet. Testdatabasen och `node_modules` laddas inte upp som resultat. Körningen kräver inga appnycklar; GitHubs egna villkor och tillgängliga Actions-minuter gäller för kontot. Arbetsflödet är förberett men har ännu inte körts.
