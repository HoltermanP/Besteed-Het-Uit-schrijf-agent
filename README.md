# AI Schrijfagent - Besteed Het Uit

Werkende Next.js-app (App Router) voor het analyseren van aanbestedingsstukken en het iteratief schrijven van inschrijvingen volgens het brons-zilver-goud-principe.

## Wat zit erin

- Dossierinvoer met opdrachtgever, deadline en TenderNed-kenmerk.
- TenderNed-importstub die een dossier als bron toevoegt.
- Neon-configuratieveld met syncstatus voor de toekomstige databasekoppeling.
- Upload en handmatige invoer voor aanbestedingsstukken, bedrijfsinformatie, rules en schrijftraining.
- Eisenregister per project: de analyse haalt alle toetsbare eisen aan inschrijving en inschrijver uit de stukken (aparte, goedkope extractie op het `light`-tier; zonder AI deterministisch afgeleid), de reviewer toetst de tekstuele eisen per stuk en de gebruiker vinkt af wat het bidteam zelf moet aanleveren.
- Brons-zilver-goud schrijfworkflow met gegenereerde HTML-inschrijving.
- Indieningsscherm per project (`/projecten/<id>/indiening`): één overzicht van alle schrijfstukken, bijlagen (UEA, referenties, verklaringen) en eisen aan het bidteam, elk met status, eigenaar en definitief bestand, plus een live countdown naar de sluitingsdatum en -tijd.
- Menselijke review via tekstselectie en opmerkingen.
- AI-reviewagent met prioriteiten en concrete verbeterrichting.
- AI-verwerking van open opmerkingen.
- Export naar PDF en Word (`.docx`).
- Ingebouwde handleiding op `/handleiding`.
- Centrale opslag in Neon/PostgreSQL (`AppState`), zodat werk apparaat-onafhankelijk bewaard blijft.

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
