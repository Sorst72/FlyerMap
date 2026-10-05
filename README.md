# FlyerMap

En första svensk webbprototyp från projektets draw.io-processkarta. Node.js serverar ett responsivt gränssnitt, Leaflet-karta och ett gemensamt JSON-API. Endast Leaflet är en extern runtime-dependency; inget byggsteg behövs.

## Hämta och testa på Windows

1. Välj **Code → Download ZIP** på GitHub och packa upp hela arkivet med **Extrahera alla**.
2. Installera **Node.js 24 LTS** från https://nodejs.org om Node.js saknas.
3. Öppna den uppackade mappen och dubbelklicka på `starta-windows.cmd`. Första starten installerar Leaflet från npm och kräver internet.
4. Låt terminalfönstret vara öppet och öppna `http://127.0.0.1:3000` i Chrome.
5. Välj en demoprofil, paxa ett område och registrera ett utdelningspass.

Testdata sparas på din dator i `.data/state.json`. Stäng terminalen eller tryck Ctrl+C för att stoppa appen. Appen är endast en lokal demo och ska inte exponeras offentligt med demoprofilerna.

## Starta

Kräver Node.js 22 eller senare och npm.

```sh
cd /workspace/FlyerMap
npm ci --ignore-scripts
npm test
npm start
```

Servern lyssnar på port 3000 på `127.0.0.1`. `PORT` och `HOST` kan ändras för en kontrollerad utvecklingsmiljö. Publicera inte demon på internet: demoprofilen är en valbar API-header, inte en autentisering.

## Prova flödet

1. Välj Alex (admin) eller Sam (utdelare). En exempelkampanj och tre exempelområden i Stockholm finns från start.
2. Välj ett område på kartan eller i listan. Paxa fram till ett slutdatum inom 31 dagar.
3. Registrera antal flyers, utdelningstid och en beskrivning av vad som delats ut.
4. Registrera ytterligare ett kvällspass: paxningen består mellan passen.
5. Markera hela området klart när all utdelning verkligen är färdig. Det avslutar paxningen.
6. Byt demoprofil och uppdatera för att se samma serverdata.
7. Admin kan skapa och avsluta kampanjer samt ändra områdenas prioritet och instruktioner. Kampanjhistoriken bevaras i serverlagringen.

Prioritet, paxning och utdelningsstatus är separata egenskaper. Delvis utdelat kan samtidigt vara paxat, vilket visas i text. Datumfiltret gäller passlistan och passstatistiken; områdesstatus visar hela kampanjens historik. Täckt procentandel beräknas inte från flyerantal.

## Lagring och nätverk

Data sparas vid ändringar i `.data/state.json` med temporär fil och atomiskt namnbyte. Kör endast en serverprocess mot samma fil. Starta om servern för att återanvända lagringen. JSON-lagringen är avsedd för en lokal demo, inte produktionsdrift.

Leaflet hämtas från npm under installation och serveras lokalt. Bakgrundskartan använder `a.tile.openstreetmap.org`, `b.tile.openstreetmap.org` och `c.tile.openstreetmap.org`. Om kartbilder blockeras visas fortfarande områdesgeometri och listan. Respektera OpenStreetMaps tile-policy; masshämtning eller offlinecache av dessa kartbilder ingår inte.

## Verifiering

`npm test` använder en separat temporär lagring och kontrollerar API-roller, samtidiga paxningar, felaktigt flyerantal, upprepad uppladdning, flera kvällspass, avslutad paxning, bevarad kampanjhistorik och återläsning efter omstart.

Gränssnittet har även provats i Chromium: paxa → registrera → byta profil → markera klart, på dator- och mobilstorlek. Webbläsartestverktyget är ett tillfälligt verktyg i utvecklingsmiljön och ingår inte i projektets dependencies.

## Nästa etapp före skarp användning

- Verifierade personliga inbjudningar, riktig inloggning och behörigheter per lokalavdelning.
- Databas med transaktioner, händelselogg, verifierad backup och HTTPS-drift.
- Riktiga geografiska områden och separat registrering av utdelningsgeometri och GPS-spår.
- Lokal offlinekö, synkning och konflikthantering för sena pass.
- Praktiska GPS-tester på valda mobilplattformar med låst skärm.

Demon ersätter inte processkartans fullständiga V1. Den innehåller inga riktiga användarkonton, ingen GPS-inspelning, ingen offlinegaranti och ingen valanalys.
