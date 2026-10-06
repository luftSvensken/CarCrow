# Datakällor i CarCrow

Kontrollerade 6 oktober 2026. Åtkomst kan ändras. Privat användning innebär inte något avtal med respektive annonssajt. De publika anslutningarna är tekniskt testade, men uppgift om rätt att återpublicera hela annons- och bilddatabaser ska inte antas.

| Källa | Anslutning | Vad appen gör |
|---|---|---|
| Blocket | [Inofficiell BlocketAPI](https://blocket-api.se) | Publikt bilsök-API och annonsdetalj-API. Märke, pris, årsmodell, miltal och växellåda skickas som dokumenterade parametrar. Övriga kriterier filtreras i databasen. |
| Bytbil | [Publik bilsökning](https://www.bytbil.com/bil) | Vanliga formulärparametrar, riktiga nästa-sida-länkar och HTML för originalannonser. |
| Bilweb | [Publik sökning](https://bilweb.se/sok) | Vanliga sökfilter och samma `/sok?page=N` som sidans ”Visa fler”-knapp. Detaljer från JSON-LD. |
| Wayke | [Publik sökning](https://www.wayke.se/sok) | Vanliga sökfilter, sidlänkar och JSON-LD/HTML för originalannonser. |
| Kvdbil | [Kvdbil](https://www.kvd.se) | Ingen aktiv integration; auktioners bud behöver separat datamodell. |
| Eget JSON-flöde | Lokalt importformat och HTTPS-flöde i huvudprocessen | Anslutningsstöd finns i koden. Det förenklade gränssnittet exponerar för närvarande de fyra färdiga anslutningarna. |

## Sidbläddring och uppdatering

Sökningar lagrar nästa sida och läst antal per källa. Bytbil, Bilweb och Wayke följer källans vanliga pagination utan en appskapad totalgräns. En sida läses med högst tre samtidiga detaljanrop per källa. Källa, framsteg och fel visas under agentens arbete. Samtidiga identiska sökningar delar hämtningen; avbrott bevarar redan importerade annonser och färdiga sidmarkörer.

BlocketAPI rapporterade i ett brett live-test 76 724 träffar men bara 50 åtkomliga sidor med 50 poster per sida. CarCrow respekterar detta sökfönster, markerar det i källans täckningsdata och försöker inte kringgå det. En fokuserad vanlig sökning kan ha ett mindre träffantal. Appens lokala träffantal är alltid antalet faktiskt importerade och normaliserade bilar, inte källans globala marknadsantal.

Alla poster på en åtkomlig sida kan läsas. För flera märken fortsätter HTML-källornas sökning genom respektive märkes sidor. Källorna använder delvis olika modellnamn; dessa normaliseras där det finns tydliga uppgifter. Alla importerade resultat filtreras åter med de exakta lokala kriterierna.

Månadspriser, leasing och köpesannonser exkluderas när de är uttryckligen markerade i källans fält. Appen hittar inte på ett kontantpris när det saknas. Prisfel kan fortfarande finnas i själva annonserna.

Delvisa söksidor får aldrig ta bort gamla annonser. Verifierad 404/410 eller uttrycklig strukturerad såld-status kan avaktivera en annons. En misslyckad läsning eller ändrat sidformat är inte samma sak som borttagning. Första sidan uppdateras regelbundet och den beständiga insamlingen fortsätter. För mycket stora sökområden sker full omgång över tid; appen garanterar ingen bestämd fullständig skanningstid.

## Teknisk och avtalsmässig grund

BlocketAPI beskriver sig uttryckligen som oberoende av Blocket AB. Appen har inget officiellt Blocket-partneravtal. [Wayke har tjänster för handlare och partners](https://www.wayke.se/); ett partnerflöde är inte aktiverat här. Bytbil och Bilweb har inga partnernycklar tillförda i detta projekt. För bred distribution behövs separat kontroll av villkor och bild-/annonsrättigheter med respektive tjänst. Privatanvändarens val att använda publika sidor har prioriterats i denna privata version.
