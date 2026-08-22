# AI Schrijfagent - Besteed Het Uit

Werkende Next.js-app (App Router) voor het analyseren van aanbestedingsstukken en het iteratief schrijven van inschrijvingen volgens het brons-zilver-goud-principe.

## Wat zit erin

- Dossierinvoer met opdrachtgever, deadline en TenderNed-kenmerk.
- TenderNed-importstub die een dossier als bron toevoegt.
- Neon-configuratieveld met syncstatus voor de toekomstige databasekoppeling.
- Upload en handmatige invoer voor aanbestedingsstukken, bedrijfsinformatie, rules en schrijftraining.
- Eisenregister per project: de analyse haalt alle toetsbare eisen aan inschrijving en inschrijver uit de stukken (aparte, goedkope extractie op het `light`-tier; zonder AI deterministisch afgeleid), de reviewer toetst de tekstuele eisen per stuk en de gebruiker vinkt af wat het bidteam zelf moet aanleveren.
- Bewijsbibliotheek (`/bewijs`): referenties, cases en cijfers als losse, herbruikbare bouwstenen met de bron erbij. Een bouwsteen zonder vastgelegd bewijs (of over de houdbaarheidsdatum) is niet citeerbaar en gaat niet naar de schrijfagent. Bij het schrijven kiest de agent de bouwstenen die bij het stuk horen en markeert elk geciteerd feit met een onzichtbare verwijzing (`data-bewijs`), die bij de export verdwijnt. De review legt daarna elke feitelijke claim terug op een bouwsteen of bron en markeert wat zonder bewijs in de tekst staat — deterministisch, dus ook zonder AI-reviewagent.
- Brons-zilver-goud schrijfworkflow met gegenereerde HTML-inschrijving.
- Schrijven als achtergrondopdracht (`WriteJob`, `/api/write-draft/job`): de generatie draait op de server en overleeft een gesloten tabblad of weggevallen verbinding. Voortgang en checkpoint staan in de database, zodat een opdracht die de tijdslimiet van een serverfunctie raakt verdergaat waar hij gebleven was en de werkplek hem bij terugkomst weer oppakt.
- Indieningsscherm per project (`/projecten/<id>/indiening`): één overzicht van alle schrijfstukken, bijlagen (UEA, referenties, verklaringen) en eisen aan het bidteam, elk met status, eigenaar en definitief bestand, plus een live countdown naar de sluitingsdatum en -tijd.
- Versiegeschiedenis per stuk: elke generatie, verwerking en eigen bewerkingsronde is terug te vinden, twee versies zijn naast elkaar te vergelijken en een oudere versie is te herstellen.
- Opdrachtgeversbeeld bij een tender (`Eerdere gunningen` in de werkruimte): welke partijen eerdere opdrachten van deze opdrachtgever wonnen, met hoeveel inschrijvers dat gebeurde, en welke eigen leerpunten er bij deze opdrachtgever liggen. De gegevens komen uit de gunningsaankondigingen (AGO) op TenderNed. Omdat de TenderNed-API niet op opdrachtgever kan filteren, wordt er gescand op publicatiesoort, CPV-code en publicatiedatum en daarna op naam gematcht; de uitgelezen gunnings-PDF's worden permanent gecachet in `AwardNotice`, gedeeld over alle projecten.
- Menselijke review via tekstselectie en opmerkingen.
- AI-reviewagent met prioriteiten en concrete verbeterrichting.
- AI-verwerking van open opmerkingen.
- Export naar PDF en Word (`.docx`).
- Ingebouwde handleiding op `/handleiding`.
- Centrale opslag in Neon/PostgreSQL (`AppState`), zodat werk apparaat-onafhankelijk bewaard blijft.
- Volledige back-up voor de beheerder (`/api/backup` + knop op `/admin`): één zip met de machineleesbare export van alles (alle bedrijven, projecten, concepten, bronnen, versies, prullenbak en bibliotheken) én dezelfde inhoud leesbaar — per project een overzicht van bronnen en bestanden en elk concept als los te openen HTML. API-sleutels worden er bewust uit gelaten.
- AI-verbruik en maandplafond (`/verbruik`, beheerderspagina): elke AI-aanroep wordt vastgelegd met tokens, model en kosten (`AiUsage`) en toegerekend aan bedrijf, project en stuk — de herkomst reist als kopregels mee met het verzoek, zodat geen enkel API-contract daarvoor hoefde te veranderen. Het overzicht toont wat elk project en elk stuk heeft gekost, waar in het proces het geld zit (per taak en model) en of prompt caching werkt: een taak die om caching vraagt maar niets terugleest, betaalt juist extra. Anthropic factureert in dollars; de opgeslagen kosten staan daarom in micro-dollars en worden bij het tonen omgerekend met de ingestelde koers. Per bedrijf staat er een maandplafond (`AiBudget`) dat waarschuwt — in de werkplek zelf, niet alleen op de beheerderspagina — maar bewust niet blokkeert, zodat werk dat loopt altijd kan afmaken.
- Prullenbak voor verwijderde projecten: verwijderen zet het hele dossier plus de versiegeschiedenis dertig dagen apart; de beheerder haalt het in één klik terug of gooit het eerder definitief weg.

## Starten

```bash
npm install
npm run dev
```

Open daarna `http://localhost:3000/`.

## Controleren

```bash
npm run build
```

De huidige versie is technisch gecontroleerd met:

- productiebuild via Next.js/TypeScript
- lokale servercheck op `200 OK`
- Playwright desktop- en mobiele screenshots
- headless rooktest voor genereren, AI-review, TenderNed-import en Neon-status

## Volgende productiestap

De UI en workflow zijn werkend. Voor productie moeten de simulaties achter `TenderNed`, `Neon` en de schrijf/reviewagent worden vervangen door echte backend-endpoints, authenticatie en server-side documentverwerking.
