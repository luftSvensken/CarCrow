# CarCrow-format v1

Ett eget flöde returnerar UTF-8 JSON via HTTPS med `Content-Type: application/json`. Samma format kan importeras som fil. Ange källans namn, HTTPS-adress, tillåtna annonsdomäner och om bilder ska visas i Datakällor. En eventuell token används som Bearer-token och lagras krypterat.

Nedan är en **syntetisk formatillustration**, inte en verklig annons. Ersätt alla exempeluppgifter och domäner med ditt eget flöde.

```json
{
  "schemaVersion": 1,
  "complete": false,
  "listings": [{
    "id": "dealer-123",
    "title": "Volvo V60 D4 testexempel",
    "make": "Volvo",
    "model": "V60",
    "variant": "D4 Momentum",
    "comparisonVariant": "D4",
    "bodyType": "Kombi",
    "price": 175000,
    "year": 2018,
    "mileage": 12500,
    "fuel": "Diesel",
    "gearbox": "Automat",
    "url": "https://dealer.example/annonser/dealer-123",
    "images": ["https://dealer.example/bilder/dealer-123.jpg"],
    "city": "Exempelort",
    "seller": "Exempelhandlare",
    "registration": "ABC123",
    "vin": null,
    "description": "Syntetisk formatillustration.",
    "publishedAt": "2026-10-01T12:00:00Z"
  }]
}
```

Obligatoriskt: `id`, `title`, `make`, `model`, `price`, `year`, `mileage`, `fuel`, `gearbox`, `url`. Pris är heltal i SEK, miltal är heltal i svenska mil. Bilder och URL måste använda HTTPS. Annons-URL måste ligga på någon av de exakt angivna domänerna. ID måste vara stabilt och unikt inom källan.

Bränsle: `Bensin`, `Diesel`, `El`, `Laddhybrid`, `Hybrid`, `Etanol`, `Gas`. Växellåda: `Automat` eller `Manuell`. Okända värden får inte omvandlas genom gissning. Valfria fält kan saknas; `images` är en lista med högst 40 adresser. Publiceringsdatum är ISO 8601. VIN måste vara 17 giltiga tecken. Registreringsnummer eller VIN möjliggör säker deduplicering över källor.

`variant` visas för användaren. `comparisonVariant` är en konservativ, normaliserad variantbeteckning som används för priskohorter, exempelvis `320d` eller `D4`. Var konsekvent mellan annonser. Gissa inte samma variant för olika drivlinor. `bodyType` används också vid jämförelse.

`complete: false` används för sökresultat, sidor och delvisa leveranser. Det uppdaterar endast ingående annonser. `complete: true` får användas **enbart** när listan omfattar hela den anslutna källans aktiva lager. Saknade annonser markeras då som borttagna. Ett helt tomt komplett lager måste uttryckligen ha `allowEmpty: true` för att godtas.

Hela JSON-flödet valideras före import och importeras i en databastransaktion. Ogiltiga rader, dubbla ID:n, fel format, nätfel och oväntat innehåll lämnar den tidigare ögonblicksbilden intakt. Max 20 MB för nät- eller filimport och högst 100 000 annonsrader i ett flöde. Lokala nätverksadresser och omdirigeringar stöds inte.
