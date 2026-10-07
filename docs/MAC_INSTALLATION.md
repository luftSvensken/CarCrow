# Mac-installation och signering

CarCrow kräver Apple Silicon. Version 0.5 hade en ofullständig signatur: appens körbara fil bar Electrons ursprungliga signatur, men CarCrows Info.plist och resurser var inte förseglade. `codesign --verify --deep --strict` underkände paketet. En vanlig start i ett lokalt utvecklingsprov upptäckte inte felet.

Från 0.5.1 använder bygget en uttrycklig ad-hoc-signatur för hela appen och dess hjälpprogram. Hardened Runtime behålls, med Electron- och ONNX-anpassade rättigheter. Releaseflödet provar den färdiga zippen, inte bara byggmappen. Det kontrollerar även att karantänmarkering inte förstör signaturen och att en ändrad appresurs verkligen underkänns.

## Första öppningen

Paketet är inte Apple-notariserat och saknar ett Developer ID-certifikat. En fullständig ad-hoc-signatur kontrollerar appens integritet men gör inte utvecklaren betrodd av Apple. macOS kan därför fortfarande blockera första öppningen med en varning om att utvecklaren inte kan verifieras.

Efter ett öppningsförsök kan du, om du litar på CarCrow från projektets officiella release, godkänna just appen i Systeminställningar → Integritet och säkerhet → Öppna ändå. Apples aktuella instruktioner finns i [Öppna appar säkert på din Mac](https://support.apple.com/sv-se/102445).

En varning om skadad kodsignatur ska inte behandlas som ett godkänt installationsprov. Behåll macOS säkerhetskontroller och rapportera felet tillsammans med versionsnumret. Chattar och sparningar ligger separat från appmappen och behöver inte raderas vid ominstallation.

## Distribution utan detta manuella steg

Det kräver Developer ID-signering och notarization med ett Apple Developer Program-konto. Se [Electrons signeringsguide](https://www.electronjs.org/docs/latest/tutorial/code-signing). Certifikatet och notarization-uppgifterna ska läggas som GitHub-hemligheter, aldrig i källkoden.

När dessa finns: ersätt `build.mac.identity` med Developer ID-identiteten, aktivera notarization i bygget och kör `node scripts/verify-mac-package.cjs release/CarCrow-Mac-Apple-Silicon.zip --require-notarization`. Då måste även Gatekeeper och den häftade notarization-biljetten godkänna appen.
