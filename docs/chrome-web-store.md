# Chrome Web Store: invulteksten

Kopieer per veld in het Developer Dashboard.

## Zip bouwen

Vanuit de projectmap (gebruikt de laatste commit, dus eerst committen):

```bash
git archive --format=zip -o dist/overzicht-voor-itslearning.zip HEAD manifest.json background.js content.js icons
```

Maak `dist/` eerst aan als die nog niet bestaat. Verhoog bij elke nieuwe upload `version` in `manifest.json`.

## Tabblad "Store listing"

**Taal:** Nederlands

**Categorie:** Education (Onderwijs)

**Samenvatting (uit manifest, max. 132 tekens):**
Eén overzicht van huiswerk, toetsen en opdrachten over alle vakken in itslearning. Geen officieel product van itslearning.

**Beschrijving:**

```
Zie in één scherm wat er deze week moet gebeuren, voor alle vakken tegelijk.

itslearning toont huiswerk en opdrachten per vak. Wil je weten wat er deze week op het programma staat, dan klik je elk vak apart open. Deze extensie zet alles bij elkaar, voor leerlingen én ouders.

WAT JE ZIET
• Weekplanning: per vak het weekplan uit de Planner, met huiswerk, taken en toetsen. Blader met de pijltjes naar andere weken.
• Totaaloverzicht: alle komende weken onder elkaar.
• Toetsen: alle toetsen, PTD's, PO's en dictees die vanaf deze week gepland staan.
• Opdrachten: wat te laat, open of voltooid is, met deadlines.

HOE HET WERKT
Na installatie staat er in de menubalk van itslearning een extra item "Overzicht", naast Vakken, Updates en Agenda. Het overzicht opent onder de menubalk, zodat je gewoon verder kunt klikken in itslearning. Afvinken en vaknamen aanpassen kan ook; dat blijft op je eigen computer.

Heb je als ouder meerdere kinderen? Dan kies je bovenaan welk kind je bekijkt.

PRIVACY
De extensie gebruikt je bestaande itslearning-login en praat alleen met itslearning. Er gaan geen gegevens naar de maker of naar andere partijen. Geen tracking, geen advertenties.

LET OP
Dit is geen officieel product van itslearning en is niet verbonden aan of goedgekeurd door itslearning AS. De extensie gebruikt de gegevens die itslearning zelf toont; controleer belangrijke data altijd in itslearning.
```

**Afbeeldingen:**
- Icoon 128×128: `icons/icon128.png`
- Screenshot(s) 1280×800 of 640×400: minimaal 1, maximaal 5. Gebruik fictieve gegevens of blur namen.
- Kleine promotegel 440×280: optioneel, maar zonder komt de extensie minder goed in beeld.

## Tabblad "Privacy"

**Single purpose (enkel doel):**
```
Toont huiswerk, toetsen en opdrachten uit alle vakken van een itslearning-account in één overzicht, binnen de itslearning-website.
```

**Rechtvaardiging `storage`:**
```
Bewaart lokaal de laatst opgehaalde planning en opdrachten (zodat het overzicht direct verschijnt), de opdrachten die de gebruiker zelf afvinkt, zelfgekozen vaknamen en de instelling "automatisch openen". Niets wordt naar een server gestuurd.
```

**Rechtvaardiging host-toegang (`*.itslearning.com`):**
```
De extensie werkt alleen op itslearning. Ze voegt een menu-item toe aan de itslearning-pagina en haalt met de bestaande sessie van de gebruiker de planning en opdrachten op bij de itslearning-omgeving van de school (elke school heeft een eigen subdomein, vandaar de wildcard).
```

**Remote code:** Nee, ik gebruik geen remote code.

**Gegevensgebruik — aanvinken:**
- [x] Persoonlijk identificeerbare informatie (voornaam en itslearning-nummer van het kind/de leerling)
- [x] Website-inhoud (planning, huiswerk en opdrachten uit itslearning)
- [ ] Al het andere niet aanvinken

**Verklaringen — alle drie aanvinken:**
- [x] Ik verkoop of draag gebruikersgegevens niet over aan derden, buiten de goedgekeurde gebruiksscenario's
- [x] Ik gebruik of draag gebruikersgegevens niet over voor doeleinden die niet gerelateerd zijn aan het enkele doel van mijn item
- [x] Ik gebruik of draag gebruikersgegevens niet over om kredietwaardigheid te bepalen of voor leningen

**URL privacybeleid:** de URL waarop je `docs/privacy.html` host (bijv. `https://franklippes.com/overzicht-itslearning/privacy`).

## Tabblad "Distribution"

- **Zichtbaarheid:** Unlisted (alleen met link) om te beginnen.
- **Regio's:** alle regio's, of alleen Nederland en België.
