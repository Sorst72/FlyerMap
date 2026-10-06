# FlyerMap

En första svensk webbprototyp från projektets draw.io-processkarta. Node.js serverar ett responsivt gränssnitt, Leaflet-karta och ett gemensamt JSON-API. Leaflet, Leaflet.draw och Turf hanterar karta, ritning och geometrikontroller; inget byggsteg behövs.

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

## Prova områden och egna paxningar

1. Välj **Alex · admin** och skapa en kampanj. Nya kampanjer börjar utan förutbestämda områden.
2. Sök en stadsdel, till exempel **Hjulsbro, Linköping**. Om OpenStreetMap har en polygon kan du granska och spara gränsen som kampanjområde. Om träffen bara är en punkt, centreras kartan och du kan rita själv. Sökgränser är geografiska förslag, inte en garanti för officiella stadsdelsgränser.
3. Alternativt: klicka **Rita kampanjområde · admin**, lägg hörn genom att klicka på kartan och klicka på första hörnet för att avsluta. Namnge polygonen och spara.
4. Välj **Sam · utdelare**, välj ett av kampanjområdena och ange slutdatum. Klicka **Paxa hela kampanjområdet** eller **Rita och paxa en del**.
5. Vid delpaxning ritar du en egen polygon inom kampanjområdet. Namnge den och klicka **Paxa ritad del**. Systemet nekar polygoner utanför kampanjområdet och överlapp med aktiva paxningar eller delar som redan är klara. Delar får dela en kant.
6. Flera personer kan paxa olika delar av samma kampanjområde. Paxningarna visas separat på kartan och i listan **Paxade delar**.
7. Registrera pass på din paxade del. Markera **Min paxade del är klar** när den är färdig: endast den paxningen avslutas; andras delar påverkas inte.

Admin bestämmer var kampanjen ska bedrivas. Utdelaren bestämmer sin egen utdelningsdel. Admin hanterar också prioritet, instruktioner och kampanjens avslut.

Gamla lokala testdata bevaras automatiskt. Skapa en ny kampanj för att börja utan de äldre Stockholmsområdena. Flytta inte bort `.data` om du vill behålla dina pass.

Prioritet, paxning och utdelningsstatus är separata. Gröna områdeskonturer visar kampanjområden; streckade orange/lila ytor visar paxade delar; mörkgröna ytor visar klara utdelningsdelar. En klar del gör inte automatiskt hela kampanjområdet klart. Datumfiltret gäller passlistan och passstatistiken. Täckt procentandel beräknas inte från flyerantal.

## Lagring och nätverk

Data sparas vid ändringar i `.data/state.json` med temporär fil och atomiskt namnbyte. Kör endast en serverprocess mot samma fil. Starta om servern för att återanvända lagringen. JSON-lagringen är avsedd för en lokal demo, inte produktionsdrift.

Kartbiblioteken hämtas från npm under installation och serveras lokalt. Bakgrundskartan använder `a.tile.openstreetmap.org`, `b.tile.openstreetmap.org` och `c.tile.openstreetmap.org`. Om kartbilder blockeras visas fortfarande områdesgeometri och listan. Respektera OpenStreetMaps tile-policy; masshämtning eller offlinecache av dessa kartbilder ingår inte.

Platssökning sker efter ett uttryckligt klick via `nominatim.openstreetmap.org`. Servern identifierar appen, begränsar anrop till högst ett per sekund och cachar sökningar i minnet. Ingen automatisk sökning medan man skriver. Söktjänsten måste vara tillåten i molnmiljöns nätverksinställningar; lokal användning kräver internet. Vid sökfel fungerar manuell ritning fortfarande. Attribution: © OpenStreetMap contributors.

## Verifiering

`npm test` använder en separat temporär lagring och kontrollerar API-roller, samtidiga paxningar, felaktigt flyerantal, upprepad uppladdning, flera kvällspass, avslutad paxning, bevarad kampanjhistorik och återläsning efter omstart.

Gränssnittet har även provats i Chromium: paxa → registrera → byta profil → markera klart, på dator- och mobilstorlek. Webbläsartestverktyget är ett tillfälligt verktyg i utvecklingsmiljön och ingår inte i projektets dependencies.

## Nästa etapp före skarp användning

- Verifierade personliga inbjudningar, riktig inloggning och behörigheter per lokalavdelning.
- Databas med transaktioner, händelselogg, verifierad backup och HTTPS-drift.
- Separat registrering av faktisk utdelningsgeometri och GPS-spår; pass är tills vidare knutna till den paxade polygonen.
- Lokal offlinekö, synkning och konflikthantering för sena pass.
- Praktiska GPS-tester på valda mobilplattformar med låst skärm.

Demon ersätter inte processkartans fullständiga V1. Den innehåller inga riktiga användarkonton, ingen GPS-inspelning, ingen offlinegaranti och ingen valanalys.

## GPS-test på Android och iPhone

Det separata GPS-testet ligger i `docs/`. Det är helt statiskt och innehåller inga kampanj-API:er eller demokonton. Positioner sparas bara i telefonens localStorage; inga positionsdata laddas upp. Manuell JSON-export innehåller exakta koordinater och ska hanteras som personuppgifter.

### Aktivera HTTPS med GitHub Pages

Repoägaren behöver göra detta i GitHub:

1. Öppna **Settings → Pages** i Sorst72/FlyerMap.
2. Under **Build and deployment → Source**, välj **Deploy from a branch**.
3. Välj grenen **main** och mappen **/docs**, klicka **Save**.
4. Vänta tills GitHub visar att sidan är publicerad. Öppna adressen GitHub anger; normalt `https://sorst72.github.io/FlyerMap/`.
5. Öppna samma HTTPS-adress i **Chrome på Android** och **Safari på iPhone**.

Det här publicerar endast GPS-testsidan, inte hela appens Node-server. Ingen egen domän eller kartnyckel behövs. Om Pages saknas eller kräver annan plan, välj en annan statisk HTTPS-host; ladda i så fall upp endast innehållet i `docs/`.

GPS-testet kan även öppnas lokalt på datorn via `http://127.0.0.1:3000/gps/`. En mobil kan inte nå datorns localhost, och vanlig HTTP till en lokal nätverksadress ger inte rätt säkerhetskontext för GPS.

### Promenadtest

1. Anteckna telefonmodell och webbläsare. Starta och tillåt platsåtkomst. Vänta på första positionen innan du börjar.
2. Gå 2 minuter utomhus med skärmen tänd.
3. Tryck **Jag låser skärmen nu**, lås telefonen och gå 5 minuter.
4. Lås upp, återvänd till samma flik, tryck **Jag är tillbaka** och gå ytterligare 2 minuter.
5. Stoppa. Ta en skärmbild av sammanfattningen. Upprepa gärna utan mobildata efter att sidan har laddats.

Resultatet skiljer mellan positionstjänstens tidpunkt och när webbsidan faktiskt tog emot uppdateringen. En markerad låsperiod är en uppskattning: webbsidan kan inte upptäcka själva skärmlåset. Över 20 sekunders lucka flaggas diagnostiskt, inte som ett fast produktkrav. Ett lyckat test bevisar inte tillförlitlig bakgrundsinspelning. En omladdad/stängd flik återläser sparade data men fortsätter inte inspelningen. Offlineomladdning stöds inte. Testgränsen är 5 000 positioner; inga data kapas tyst.

### Genomförd teknisk kontroll

Chromium med simulerad geolocation verifierade tillstånd före första positionen, nekad behörighet, manuella låsmarkeringar, 120 sekunders lucka, sparning utan nät, JSON-export, återläsning och avbrottsstatus efter omladdning samt mobilbredd. Verklig Android/iPhone, fysisk skärmlåsning och den publicerade HTTPS-adressen återstår att verifiera.
