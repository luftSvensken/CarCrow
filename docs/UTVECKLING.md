# CarCrow 0.5 – aktuell utveckling

- Textsökningen matchar separata ord över märke, modell, variant, rubrik och beskrivning. Alias, vanliga stavfel, modellfamiljer, prefix och alternativa sökningar stöds.
- AI:n inväntar en användbar omgång, behåller tidigare sidor och får ett spritt annonsurval. Pålitlig första bil innebär inga påhittade hårda märke-, årsmodell- eller bränslekrav.
- Sökfältet i Alla bilar använder en enda fokusram.
- Ny chatt har rubriken ”Vilken bil spanar du efter?” och en klickbar kråka som hoppar. Fem snabba klick gör den röd och arg innan den flyger iväg och återvänder. Reducerad rörelse respekteras.
- Rekommendationer väger samman senaste chattmeddelanden, manuella sökningar, sparade bilar och öppnade eller jämförda annonser med lokal EmbeddingGemma 2.
- Bevakningar visar personligt rangordnade annonser som först måste uppfylla bevakningens filter.
- Annonser visas direkt när en källa svarar. Resterande källor arbetar i bakgrunden; cachade vyer och virtualisering gör navigationen snabbare.
- AI använder fasta gratismodeller genom Cloudflare: Nemotron 3 Super, med Ultra som reserv. Inga API-nycklar ingår i appen.
- Webbsökning använder Tavilys officiella API och läser källor. Svar har klickbara källhänvisningar och skiljer modellrisk från bilens eget skick. Fel för andra motorer och karosser får inte tillskrivas bilen.
- Uppdateringar hämtas automatiskt och installeras när appen avslutas. Publika GitHub-uppdateringar kräver ingen inloggning. Paket verifieras med SHA-256 och filstorlek. Appbytet bevarar separat lagrade användardata och återställer den tidigare appen om uppstarten misslyckas.
- Release CarCrow bygger och provar Windows x64, Mac Apple Silicon och Mac Intel före publicering.

Aktuella testresultat beskrivs i [VERIFIERING.md](VERIFIERING.md). Publicering beskrivs i [UPPDATERINGAR.md](UPPDATERINGAR.md).
