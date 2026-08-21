'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  BadgeCheck,
  BookOpen,
  Building2,
  ClipboardList,
  Crown,
  Download,
  FileDown,
  FileText,
  FolderOpen,
  GitCompareArrows,
  GraduationCap,
  HelpCircle,
  LayoutGrid,
  Lightbulb,
  Medal,
  MessageSquarePlus,
  Rocket,
  Search,
  ShieldCheck,
  Sparkles,
  Upload,
  Wand2,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { ModeToggle } from '@/components/mode-toggle'

type SectionProps = {
  id: string
  icon: ReactNode
  title: string
  intro?: string
  children: ReactNode
}

function Section({ id, icon, title, intro, children }: SectionProps) {
  return (
    <Card id={id} className="scroll-mt-24">
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2 text-primary">
          {icon}
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
        </div>
        {intro ? <p className="text-sm text-muted-foreground">{intro}</p> : null}
        {children}
      </CardContent>
    </Card>
  )
}

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="grid size-7 flex-none place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
        {n}
      </span>
      <div className="min-w-0 space-y-1 pt-0.5">
        <p className="text-sm font-semibold leading-tight">{title}</p>
        <div className="text-sm text-muted-foreground">{children}</div>
      </div>
    </li>
  )
}

function Term({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[13px] font-semibold text-primary">
      {children}
    </span>
  )
}

function InfoGrid({ items }: { items: Array<{ title: ReactNode; text: ReactNode }> }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {items.map((item, index) => (
        <div key={index} className="rounded-lg border bg-muted/40 p-3">
          <p className="mb-1 text-sm font-semibold">{item.title}</p>
          <p className="text-sm text-muted-foreground">{item.text}</p>
        </div>
      ))}
    </div>
  )
}

function Faq({ question, children }: { question: string; children: ReactNode }) {
  return (
    <details className="group rounded-lg border bg-card px-4 py-3">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold [&::-webkit-details-marker]:hidden">
        {question}
        <span className="text-muted-foreground transition-transform group-open:rotate-90">›</span>
      </summary>
      <div className="pt-2 text-sm text-muted-foreground">{children}</div>
    </details>
  )
}

const tocItems = [
  { href: '#snel-starten', label: 'Snel aan de slag' },
  { href: '#werkplek', label: 'De projectomgeving' },
  { href: '#projecten', label: 'Projecten & dossier' },
  { href: '#aanbestedingen', label: 'Aanbestedingen zoeken' },
  { href: '#bronnen', label: 'Bronnen toevoegen' },
  { href: '#stadia', label: 'Schrijfstadia' },
  { href: '#genereren', label: 'Genereren & analyse' },
  { href: '#review', label: 'Menselijke review' },
  { href: '#exporteren', label: 'Exporteren' },
  { href: '#configuratie', label: 'Bedrijfsconfiguratie' },
  { href: '#schrijfkader', label: 'Schrijfkader' },
  { href: '#lessons', label: 'Lessons learned' },
  { href: '#vergelijken', label: 'Projecten vergelijken' },
  { href: '#beheer', label: 'Beheer & API-instellingen' },
  { href: '#faq', label: 'Veelgestelde vragen' },
  { href: '#tips', label: 'Tips voor een winnende inschrijving' },
]

export default function HandleidingPage() {
  return (
    <main className="min-h-screen bg-background p-4 text-foreground sm:p-6">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <BookOpen size={18} />
          </div>
          <div className="min-w-0 leading-tight">
            <div className="truncate font-semibold">Handleiding</div>
            <div className="truncate text-sm text-muted-foreground">Besteed Het Uit</div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button asChild variant="outline">
            <Link href="/">
              <ArrowLeft size={16} /> <span className="sr-only sm:not-sr-only">Terug naar projecten</span>
            </Link>
          </Button>
          <ModeToggle />
        </div>
      </header>

      <div className="mx-auto mb-5 max-w-[1040px]">
        <h1 className="text-xl font-bold">Zo werk je met de AI-Schrijfagent</h1>
        <p className="mt-1 max-w-[70ch] text-sm text-muted-foreground">
          Deze handleiding neemt je stap voor stap mee door de hele applicatie: van het binnenhalen van een
          aanbesteding tot een exporteerbare eindversie in drie schrijfstadia — <Term>Brons</Term>,{' '}
          <Term>Zilver</Term> en <Term>Goud</Term>. Alles wat je invoert wordt centraal in de database bewaard, zodat
          je werk niet verloren gaat en je op elk apparaat verder kunt.
        </p>
      </div>

      <div className="mx-auto flex max-w-[1040px] flex-col gap-5">
        <Card>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2 text-primary">
              <LayoutGrid size={17} />
              <h2 className="text-sm font-semibold text-foreground">Inhoud</h2>
            </div>
            <nav className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
              {tocItems.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  className="rounded-md border bg-muted/30 px-3 py-2 text-sm font-medium transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
                >
                  {item.label}
                </a>
              ))}
            </nav>
          </CardContent>
        </Card>

        <Section
          id="snel-starten"
          icon={<Rocket size={17} />}
          title="Snel aan de slag"
          intro="In zes stappen van aanbesteding naar eerste concept. De stappen hieronder worden verderop in de handleiding uitgebreid toegelicht."
        >
          <ol className="space-y-4">
            <Step n={1} title="Vul eenmalig je bedrijfsprofiel in">
              Ga via het menu naar <Term>Bedrijfsconfiguratie</Term> en beschrijf wie je bent, je kernwaarden,
              onderscheidend vermogen en referenties. De schrijfagent gebruikt dit bij elke inschrijving.
            </Step>
            <Step n={2} title="Leg je schrijfkader vast">
              Onder <Term>Schrijfkader</Term> bepaal je schrijfregels, schrijfwijze en kwaliteitseisen — handmatig of
              door documenten te uploaden waaruit de AI regels destilleert.
            </Step>
            <Step n={3} title="Maak een project">
              Start op het projectenoverzicht met <Term>Nieuw project</Term> (blanco, met je eigen documenten), of
              scan de <Term>TenderNed</Term>-catalogus en kies <Term>Maak project</Term> bij een publicatie — alle
              documenten worden gedownload en de aanbesteding wordt direct een project.
            </Step>
            <Step n={4} title="Controleer je bronnen">
              Vul het dossier aan met eigen documenten of geplakte tekst onder <Term>Bronnen</Term>. Via de{' '}
              <Term>Bronmatrix</Term> zie je of alle bronnen van voldoende kwaliteit zijn.
            </Step>
            <Step n={5} title="Genereer het bronzen concept">
              Zolang er nog geen concept is, toont het tekstveld alleen een korte samenvatting van de
              aanbesteding. Kies het stadium <Term>Brons</Term> en klik op <Term>Start schrijfagent</Term>{' '}
              (daarna heet die knop <Term>Genereer</Term>). De agent schrijft een eerste
              concept op basis van al je bronnen, je bedrijfsprofiel en relevante leerpunten.
            </Step>
            <Step n={6} title="Review, verbeter en exporteer">
              Plaats opmerkingen in de tekst en laat de agent ze verwerken (<Term>Zilver</Term>), maak de eindversie
              (<Term>Goud</Term>) en exporteer als <Term>PDF</Term> of <Term>Word</Term>.
            </Step>
          </ol>
        </Section>

        <Section
          id="werkplek"
          icon={<LayoutGrid size={17} />}
          title="De projectomgeving"
          intro="Het startscherm is het projectenoverzicht met al je projecten als kaarten. Open je een project, dan kom je in de projectomgeving: drie kolommen waarin het eigenlijke schrijfwerk gebeurt."
        >
          <InfoGrid
            items={[
              {
                title: 'Linkerkolom — navigatie & invoer',
                text: 'De link terug naar alle projecten, het menu naar alle onderdelen, het dossier (titel, opdrachtgever, deadline), de TenderNed-koppeling en het bronnenpaneel.',
              },
              {
                title: 'Middenkolom — het document',
                text: 'De concept-editor met daarboven de schrijfstadia, statistieken (kansscore, woorden, karakters, bronnen) en de knoppen voor genereren, analyseren en exporteren.',
              },
              {
                title: 'Rechterkolom — menselijke review',
                text: 'Hier verschijnen je opmerkingen bij de tekst. Per opmerking zie je de status (Open, Verwerkt of Akkoord) en de bijbehorende acties.',
              },
              {
                title: 'Statusregel',
                text: 'Onder het TenderNed-paneel zie je of de schrijfagent, de bedrijfsconfiguratie en de stijlbibliotheek actief zijn.',
              },
            ]}
          />
          <p className="text-sm text-muted-foreground">
            De concept-editor is direct bewerkbaar: klik in de tekst en typ. Handmatige wijzigingen blijven behouden;
            (her)genereren gebeurt alleen als je zelf op <Term>Genereer</Term> klikt.
          </p>
        </Section>

        <Section
          id="projecten"
          icon={<FolderOpen size={17} />}
          title="Projecten & dossier"
          intro="Elke aanbesteding is een eigen project met een eigen omgeving: dossier, bronnen, concepttekst en opmerkingen."
        >
          <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
            <li>
              Klik op het projectenoverzicht op <Term>Nieuw project</Term> en geef een naam (en eventueel
              opdrachtgever en deadline) op. Het project opent direct in zijn eigen omgeving; wisselen doe je via{' '}
              <Term>Alle projecten</Term> en de kaart van het andere project.
            </li>
            <li>
              Elke projectkaart toont de kerninfo: bron (TenderNed of eigen project), stadium, aantal bronnen en
              bestanden, deadline en wanneer je er voor het laatst aan werkte.
            </li>
            <li>
              Vul in het paneel <strong>Dossier</strong> de <strong>titel</strong>, de{' '}
              <strong>opdrachtgever</strong> en de <strong>deadline</strong> in. Deze gegevens gebruikt de agent in de
              tekst en bij de kansscore.
            </li>
            <li>
              Hernoemen en verwijderen doe je met de knoppen op de projectkaart. Let op: verwijderen wist ook het
              bijbehorende dossier en concept.
            </li>
            <li>
              Alles wordt automatisch in de database opgeslagen (je ziet de status &ldquo;Opgeslagen in
              database&rdquo;). Er is dus geen opslaan-knop nodig.
            </li>
          </ul>
        </Section>

        <Section
          id="aanbestedingen"
          icon={<Search size={17} />}
          title="Aanbestedingen zoeken (TenderNed)"
          intro="Via de TenderNed-koppeling haal je een publicatie met alle bijbehorende documenten in één keer binnen."
        >
          <ol className="space-y-4">
            <Step n={1} title="Open de voorselectie">
              Klik op het projectenoverzicht op <Term>TenderNed scannen</Term> (of in een project op{' '}
              <Term>Zoek &amp; download aanbestedingen</Term>). Heb je bij <strong>Configuratie → CPV-codes</strong>{' '}
              codes ingesteld, dan draait de voorselectie in twee stappen: <strong>stap 1</strong> haalt puur op die
              CPV-codes alle open tenders uit TenderNed (zonder AI), <strong>stap 2</strong> geeft elke tender uit
              die lijst een AI-score (0-100) met korte onderbouwing. Beide resultaten staan in de database: kom je
              terug of blader je door de lijst, dan is alles direct zichtbaar zonder opnieuw ophalen of scoren.
            </Step>
            <Step n={2} title="Sorteer, filter en ververs">
              Sorteer op <strong>AI-score</strong>, <strong>publicatiedatum</strong>, sluitingsdatum, naam of
              opdrachtgever en filter op sterke (≥ 70) of passende (≥ 40) matches. Met{' '}
              <Term>Ververs voorselectie</Term> haal je nieuwe publicaties op; al gescoorde tenders houden hun
              score. Wil je buiten je CPV-codes kijken, kies dan <Term>Vrij zoeken in catalogus</Term> en zoek op een
              CPV-code (bijv. 45210000), titel, opdrachtgever of omschrijving — daar wordt pas gescoord als je dat
              zelf kiest.
            </Step>
            <Step n={3} title="Maak er een project van">
              Kies bij een publicatie <Term>Maak project</Term>: alle documenten worden gedownload, de aanbesteding
              wordt direct een project en de projectomgeving opent. Met <Term>Alleen opslaan</Term> bewaar je de
              aanbesteding in je database om er later (via het overzicht) een project van te maken.
            </Step>
          </ol>
          <Separator />
          <p className="text-sm text-muted-foreground">
            <strong>Tender ophalen binnen een project:</strong> werk je al in een project, dan koppel je een
            aanbesteding via het TenderNed-paneel — kies een eerder gedownloade aanbesteding uit de lijst, of haal er
            één rechtstreeks op via het publicatie-ID of TN-kenmerk. De documenten worden dan aan het open project
            toegevoegd.
          </p>
        </Section>

        <Section
          id="bronnen"
          icon={<Upload size={17} />}
          title="Bronnen toevoegen"
          intro="De kwaliteit van het concept staat of valt met de bronnen. De agent gebruikt vier soorten bronnen, elk met een eigen tabblad."
        >
          <InfoGrid
            items={[
              {
                title: 'Aanbesteding',
                text: 'De leidraad, het programma van eisen en andere aanbestedingsdocumenten. Meestal automatisch gevuld via TenderNed.',
              },
              {
                title: 'Bedrijfsinfo',
                text: 'Documenten over je organisatie: brochures, referentieprojecten, certificeringen. Aangevuld met je Bedrijfsconfiguratie.',
              },
              {
                title: 'Schrijfregels',
                text: 'Regels en eisen aan de tekst zelf, gevoed vanuit het Schrijfkader.',
              },
              {
                title: 'Schrijfstijl',
                text: 'Voorbeeldteksten en stijldocumenten waaruit de agent jouw toon overneemt (de stijlbibliotheek).',
              },
            ]}
          />
          <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
            <li>
              <strong>Uploaden:</strong> sleep bestanden in de uploadzone of klik erop. Ondersteund: PDF, Word,
              PowerPoint, Excel, txt, md en csv — ook oude formaten zoals .doc en .xls. PDF's mogen tot 50 MB zijn (die worden in je browser uitgelezen); overige bestanden maximaal 4 MB. De tekst wordt automatisch uitgelezen.
            </li>
            <li>
              <strong>Handmatig plakken:</strong> geef een naam op bij &ldquo;Naam bron&rdquo; en plak de tekst in het
              tekstvak.
            </li>
            <li>
              <strong>Controleren:</strong> open de <Term>Bronmatrix</Term> voor een overzicht van alle effectieve
              bronnen met kwaliteitsoordeel (ok, waarschuwing of fout), woordenaantal en een fragment. Automatisch
              toegevoegde bronnen zijn gemarkeerd met &ldquo;· auto&rdquo;.
            </li>
          </ul>
        </Section>

        <Section
          id="stadia"
          icon={<Medal size={17} />}
          title="Schrijfstadia: Brons, Zilver, Goud"
          intro="Het schrijfproces verloopt in drie stadia. Je kiest een stadium door op de kaart te klikken; de tekst verandert pas als je daarna op Genereer klikt."
        >
          <div className="grid gap-3 lg:grid-cols-3">
            <div className="rounded-lg border bg-amber-50 p-4 dark:bg-amber-950/30">
              <div className="mb-1 flex items-center gap-2">
                <Medal size={16} className="text-amber-700 dark:text-amber-400" />
                <p className="text-sm font-bold text-amber-900 dark:text-amber-300">Brons — eerste concept</p>
              </div>
              <p className="text-sm text-amber-900/80 dark:text-amber-200/80">
                Een scherpe eerste versie: compliant met de uitvraag, goede structuur, alle gunningscriteria geraakt en
                alle bronnen benut.
              </p>
            </div>
            <div className="rounded-lg border bg-slate-100 p-4 dark:bg-slate-800/40">
              <div className="mb-1 flex items-center gap-2">
                <BadgeCheck size={16} className="text-slate-600 dark:text-slate-300" />
                <p className="text-sm font-bold text-slate-800 dark:text-slate-200">Zilver — review verwerkt</p>
              </div>
              <p className="text-sm text-slate-700/80 dark:text-slate-300/80">
                De agent verwerkt jouw opmerkingen en verbetert bewijsvoering, specificiteit, toon, consistentie en
                win-thema&rsquo;s.
              </p>
            </div>
            <div className="rounded-lg border bg-yellow-50 p-4 dark:bg-yellow-950/30">
              <div className="mb-1 flex items-center gap-2">
                <Crown size={16} className="text-yellow-700 dark:text-yellow-400" />
                <p className="text-sm font-bold text-yellow-900 dark:text-yellow-300">Goud — eindversie</p>
              </div>
              <p className="text-sm text-yellow-900/80 dark:text-yellow-200/80">
                Overtuigend, compact en verifieerbaar. Klaar voor export met verzorgde opmaak.
              </p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            De gebruikelijke route: genereer <Term>Brons</Term> → plaats opmerkingen → laat ze verwerken in{' '}
            <Term>Zilver</Term> → rond af met <Term>Goud</Term>. Je kunt elk stadium opnieuw genereren zolang je nog
            niet tevreden bent.
          </p>
        </Section>

        <Section
          id="genereren"
          icon={<Wand2 size={17} />}
          title="Genereren & analyse"
          intro="Naast het genereren zelf heeft de projectomgeving drie analyse-instrumenten die je helpen om gericht te sturen."
        >
          <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
            <li>
              <strong>Genereer:</strong> de hoofdknop rechtsboven. De agent schrijft (of herschrijft) het concept voor
              het gekozen stadium op basis van alle actieve bronnen. Tijdens het genereren zie je
              &ldquo;Genereren…&rdquo; met voortgang.
            </li>
            <li>
              <strong>Leidraadanalyse</strong> (<Term>Analyseer dossier</Term>): analyseert de aanbesteding en toont
              de samenvatting, de <em>vraag achter de vraag</em> (expliciete vraag, achterliggende behoefte,
              prioriteiten van de opdrachtgever), formele eisen zoals woord- en karakterlimieten, verplichte
              documenten, specifieke inschrijvingseisen en eventuele gaten in je dossier.
            </li>
            <li>
              <strong>AI-review agent</strong> (<Term>Review uitvoeren</Term>): beoordeelt het concept en geeft
              bevindingen met prioriteit <Badge className="bg-red-600 text-white">kritiek</Badge>{' '}
              <Badge className="bg-amber-500 text-white">hoog</Badge> <Badge variant="secondary">normaal</Badge>, elk
              met een toelichting.
            </li>
            <li>
              <strong>Kansscore:</strong> de score-tegel toont je winkans op basis van match tussen profiel en
              uitvraag, referenties, harde eisen en concurrentie. Klik erop voor de opbouw per factor (score, weging,
              signalen). Niveaus: Lage kans, Matige kans, Kansrijk en Sterke kans.
            </li>
            <li>
              <strong>Toegepaste leerpunten:</strong> start je een project dat lijkt op eerdere projecten, dan past de
              agent automatisch relevante lessen uit je leerpuntendatabase toe. Je ziet in een banner welke dat zijn.
            </li>
          </ul>
        </Section>

        <Section
          id="review"
          icon={<MessageSquarePlus size={17} />}
          title="Menselijke review"
          intro="Jij blijft de regisseur: markeer tekst, geef aanwijzingen en laat de agent gericht herschrijven."
        >
          <ol className="space-y-4">
            <Step n={1} title="Plaats een opmerking">
              Selecteer tekst in het concept; er verschijnt een knop om een <strong>verankerde opmerking</strong> te
              plaatsen. Typ je opmerking of wijzigingsinstructie en klik op <Term>Plaatsen</Term>. Een{' '}
              <strong>algemene opmerking</strong> (zonder tekstselectie) kan via het reviewpaneel rechts.
            </Step>
            <Step n={2} title="Laat de agent verwerken">
              Bij een open opmerking kies je <Term>Verwerk</Term>: de agent herschrijft precies dat fragment volgens
              jouw instructie. Met <Term>Verwerk opmerkingen</Term> boven de editor verwerk je alle open opmerkingen in
              één keer. Zelf afhandelen kan ook: <Term>Afvinken</Term>.
            </Step>
            <Step n={3} title="Beoordeel het resultaat">
              Een verwerkte opmerking keur je goed met <Term>Akkoord</Term> of maak je ongedaan met{' '}
              <Term>Terugdraaien</Term>. Een akkoord gegeven opmerking kun je altijd weer <Term>Heropenen</Term>.
            </Step>
          </ol>
          <p className="text-sm text-muted-foreground">
            Klik op een verankerde opmerking in het reviewpaneel om direct naar de gemarkeerde passage in de tekst te
            springen.
          </p>
        </Section>

        <Section
          id="exporteren"
          icon={<FileDown size={17} />}
          title="Exporteren"
          intro="Het concept exporteer je rechtstreeks vanuit de projectomgeving, met behoud van opmaak."
        >
          <InfoGrid
            items={[
              {
                title: (
                  <span className="flex items-center gap-1.5">
                    <FileText size={14} /> PDF
                  </span>
                ),
                text: 'Klik op PDF in de balk boven het document. Handig om te delen of te archiveren; het document wordt als download aangeboden.',
              },
              {
                title: (
                  <span className="flex items-center gap-1.5">
                    <Download size={14} /> Word (.docx)
                  </span>
                ),
                text: 'Klik op Word voor een volwaardig .docx-bestand met koppen, tabellen en opsommingen — direct verder te bewerken in Microsoft Word.',
              },
            ]}
          />
        </Section>

        <Section
          id="configuratie"
          icon={<Building2 size={17} />}
          title="Bedrijfsconfiguratie"
          intro="Je bedrijfsprofiel is vaste input voor elke inschrijving. Eén keer goed invullen betaalt zich bij elk project uit."
        >
          <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
            <li>
              <strong>Bedrijfsgegevens:</strong> bedrijfsnaam, omschrijving, KvK-nummer, website en contact-e-mail.
            </li>
            <li>
              <strong>Profiel &amp; bewijs:</strong> wie je bent, kernwaarden, onderscheidend vermogen en referenties
              met resultaten. Hoe concreter (cijfers, projectnamen, resultaten), hoe sterker de teksten.
            </li>
            <li>
              <strong>Documenten uploaden:</strong> voeg bedrijfsbrochures of referentiedocumenten toe; deze tellen mee
              als bron in elk project.
            </li>
          </ul>
        </Section>

        <Section
          id="schrijfkader"
          icon={<ClipboardList size={17} />}
          title="Schrijfkader"
          intro="Eén kader in vier secties dat bepaalt hóe de agent schrijft. Alles wat je hier vastlegt wordt automatisch in elk nieuw project gebruikt."
        >
          <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
            <li>
              <strong>Klik op een kopje</strong> (Schrijfregels, Schrijfwijze, Kwaliteit) om de volledige uitwerking te
              zien: de ingebouwde basis, je vastgelegde regels en je eigen aanpassingen — precies zoals de agent ze
              krijgt.
            </li>
            <li>
              Per sectie schrijf je regels direct in, óf je uploadt een document en laat de AI daar relevante regels
              uit destilleren.
            </li>
            <li>
              <strong>Handmatige aanpassingen:</strong> in elke sectie (en bovenaan voor algemene accenten) typ je in
              gewone taal wat anders moet. Die aanpassingen hebben de hoogste prioriteit na de leidraad en gaan bij elk
              project mee naar de schrijfagent, de AI-review en het herschrijven van fragmenten.
            </li>
            <li>
              Met <Term>Wat de schrijfagent ontvangt</Term> zie je letterlijk de tekst die als bron wordt meegegeven.
            </li>
            <li>
              De vierde sectie, <strong>Eerdere aanbestedingen &amp; achtergrond</strong>, destilleert eerdere
              inschrijvingen tot een profiel: zo schrijft de agent in jouw bewezen stijl.
            </li>
            <li>
              Denk aan zaken als: actieve schrijfstijl, maximale zinslengte, verplichte terminologie van de
              opdrachtgever, en hoe je omgaat met bewijsvoering.
            </li>
          </ul>
        </Section>

        <Section
          id="lessons"
          icon={<GraduationCap size={17} />}
          title="Lessons learned"
          intro="Leer van elke inschrijving. De leerpuntendatabase voedt automatisch je volgende projecten."
        >
          <ol className="space-y-4">
            <Step n={1} title="Evalueer een afgerond project">
              Klik in de projectomgeving op <Term>Evalueer &amp; leer</Term>. Leg de uitkomst vast (
              <Badge className="bg-emerald-600 text-white">gewonnen</Badge>{' '}
              <Badge className="bg-rose-600 text-white">verloren</Badge>{' '}
              <Badge variant="secondary">ingetrokken</Badge> <Badge variant="outline">onbekend</Badge>), eventueel de
              behaalde score, en wat er gebeurde. De AI destilleert daaruit een leerpunt met situatie en aanbeveling.
            </Step>
            <Step n={2} title="Beheer je leerpunten">
              Op de pagina <Term>Lessons learned</Term> kun je leerpunten toevoegen, bewerken, filteren op uitkomst en
              doorzoeken. Elk leerpunt heeft een projecttitel, opdrachtgever, categorie, situatie, leerpunt en
              aanbeveling.
            </Step>
            <Step n={3} title="Profiteer automatisch">
              Bij een nieuw project selecteert de agent zelf de relevante leerpunten en past ze toe. In de projectomgeving
              zie je onder <strong>Toegepaste leerpunten</strong> welke lessen zijn meegenomen.
            </Step>
          </ol>
        </Section>

        <Section
          id="vergelijken"
          icon={<GitCompareArrows size={17} />}
          title="Projecten vergelijken"
          intro="Zet twee of meer projecten naast elkaar om patronen in je aanpak te ontdekken."
        >
          <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
            <li>
              Kies op de pagina <Term>Projecten vergelijken</Term> minimaal twee opgeslagen projecten en klik op{' '}
              <Term>Vergelijk</Term>.
            </li>
            <li>
              <strong>Aanpak &amp; structuur naast elkaar:</strong> een directe, feitelijke vergelijking van de opbouw
              van beide inschrijvingen.
            </li>
            <li>
              <strong>AI-samenvatting:</strong> een analyse met <em>overeenkomsten</em>, <em>wat opvalt</em> en{' '}
              <em>verschillen in aanpak</em> — handig om je winnende patronen te herkennen.
            </li>
          </ul>
        </Section>

        <Section
          id="beheer"
          icon={<ShieldCheck size={17} />}
          title="Beheer & API-instellingen"
          intro="De adminpagina is alleen zichtbaar wanneer een beheerderswachtwoord is geconfigureerd, en is bereikbaar via /admin."
        >
          <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
            <li>
              <strong>TenderNed API:</strong> endpoint en sleutel voor de aanbestedingencatalogus.
            </li>
            <li>
              <strong>Neon database:</strong> connection string voor de gedeelde stijlbibliotheek en leerpunten.
            </li>
            <li>
              <strong>Schrijfagent- en Reviewagent-API:</strong> per agent de provider, base-URL, het model en de
              API-sleutel. Zonder eigen sleutels gebruikt de app de server-side configuratie (indien aanwezig).
            </li>
            <li>
              Log na afloop uit met <Term>Uitloggen</Term>; de adminsessie verloopt automatisch na 8 uur.
            </li>
          </ul>
        </Section>

        <Section
          id="faq"
          icon={<HelpCircle size={17} />}
          title="Veelgestelde vragen"
        >
          <div className="space-y-2">
            <Faq question="Waar wordt mijn werk opgeslagen?">
              Projecten, dossiers, bronnen en concepten worden centraal in de database (Neon/PostgreSQL)
              opgeslagen. Je kunt dus op een andere computer of in een andere browser verder werken waar je
              gebleven was. Ook de stijlbibliotheek en leerpunten staan in dezelfde database.
            </Faq>
            <Faq question="De knop Genereer doet niets of geeft een foutmelding.">
              Controleer de statusregel in de linkerkolom: staat &ldquo;Schrijfagent actief&rdquo; op niet actief, dan
              ontbreekt een API-configuratie. Vraag de beheerder om de schrijfagent-API in te stellen via de
              adminpagina.
            </Faq>
            <Faq question="Mijn upload wordt geweigerd.">
              Ondersteunde formaten zijn PDF (tot 50 MB), Word (.docx en .doc), PowerPoint, Excel (.xlsx en .xls),
              txt, md en csv (tot 4 MB). Gescande PDF&rsquo;s zonder tekstlaag worden automatisch via AI-OCR
              uitgelezen (tot 4 MB, mits een AI-sleutel op de server is geconfigureerd).
            </Faq>
            <Faq question="Verdwijnen mijn handmatige aanpassingen als ik opnieuw genereer?">
              Opnieuw genereren vervangt de tekst van het concept. Wil je gericht iets verbeteren zonder de rest te
              raken, gebruik dan een opmerking met <Term>Verwerk</Term> — die herschrijft alleen het gemarkeerde
              fragment.
            </Faq>
            <Faq question="Hoe verwijder ik een gedownloade aanbesteding of project?">
              Een project verwijder je met de prullenbak-knop op de projectkaart in het overzicht. Een gedownloade
              aanbesteding zonder project blijft in je database staan en verschijnt onderaan het overzicht; maak er
              een project van of laat hem staan.
            </Faq>
            <Faq question="Wat betekent de kansscore precies?">
              De score is een inschatting op basis van vier factoren: match tussen je profiel en de uitvraag, je
              referenties, de harde eisen en de concurrentie. Klik op de tegel voor de volledige opbouw met weging en
              signalen per factor. Zie het als richting, niet als garantie.
            </Faq>
          </div>
        </Section>

        <Section
          id="tips"
          icon={<Lightbulb size={17} />}
          title="Tips voor een winnende inschrijving"
        >
          <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
            <li>
              <strong>Begin met de leidraadanalyse.</strong> De &ldquo;vraag achter de vraag&rdquo; vertelt je wat de
              opdrachtgever écht belangrijk vindt — stuur daar je bronnen en opmerkingen op.
            </li>
            <li>
              <strong>Voed de agent met bewijs.</strong> Referenties met concrete resultaten leveren sterkere teksten
              op dan algemene beloften.
            </li>
            <li>
              <strong>Respecteer de limieten.</strong> Houd de tegels Woorden en Karakters in de gaten; de formele
              eisen uit de leidraad worden automatisch gesignaleerd.
            </li>
            <li>
              <strong>Reviewen loont.</strong> Het verschil tussen Brons en Goud zit in jouw opmerkingen: hoe
              specifieker de instructie, hoe beter de herschrijving.
            </li>
            <li>
              <strong>Sluit elk project af met Evalueer &amp; leer.</strong> Zo wordt elke inschrijving — gewonnen of
              verloren — input voor de volgende.
            </li>
          </ul>
          <Separator />
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Sparkles size={15} className="text-primary" />
            Veel succes met je volgende inschrijving!
          </p>
        </Section>
      </div>
    </main>
  )
}
