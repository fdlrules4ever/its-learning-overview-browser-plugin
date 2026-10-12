# itslearning Overzicht (proof-of-concept)

Chrome-extensie die het huiswerk van alle vakken in itslearning op één scherm zet.

- **Weekplanning**: per vak het weekplan uit de Planner, met omschrijving, taken, huiswerk en toetsen. Blader met de pijltjes (of ← →). In het weekend opent het overzicht op de week erna.
- **Totaaloverzicht**: alle komende weken onder elkaar, per week een lijst vakken met de inhoud. Met "Eerdere weken tonen" kijk je terug.
- **Toetsen**: alle toetsen, PTD's, PO's en dictees die vanaf deze week gepland staan, per week.
- **Opdrachten**: wat itslearning als te laat, open of voltooid registreert (voltooide opdrachten staan ingeklapt onderaan).

Getest met een **ouderaccount** en een **leerlingaccount** (Dalí College). Alle tabbladen werken voor beide.

## Installeren (Chrome of Edge)

1. Pak de zip uit naar een vaste map (niet in Downloads laten staan als je die opruimt).
2. Ga naar `chrome://extensions` en zet rechtsboven **Ontwikkelaarsmodus** aan.
3. Klik op **Uitgepakte extensie laden** en kies de map `itslearning-overzicht`.
4. Log in op itslearning. In de menubalk staat nu naast Vakken, Updates, Groepen en Agenda een extra item **Overzicht**. Het overzicht opent onder de menubalk, zodat je gewoon naar de andere onderdelen kunt blijven klikken.
5. Wil je het overzicht direct zien bij het openen van itslearning? Zet in het overzicht rechtsboven **Automatisch openen** aan. Het opent dan één keer per tabblad vanzelf; daarna bepaal je zelf.

Het extensie-icoon in de Chrome-werkbalk werkt ook. Vindt de extensie de menubalk niet (bijvoorbeeld na een wijziging door itslearning), dan verschijnt rechtsonder een oranje knop als terugval.

## Privacy

- De extensie draait alleen op `*.itslearning.com` en gebruikt je bestaande login. Er worden geen wachtwoorden opgeslagen.
- Er gaat geen data naar een andere server. Alleen afvinkjes en zelfgekozen vaknamen worden lokaal in de browser bewaard.

## Bekende beperkingen

- De extensie gebruikt interne itslearning-adressen. Als itslearning de site aanpast, kan het overzicht stoppen met werken.
- Toetsen worden herkend op het type "Toets" en op woorden in de titel (toets, PTD, PO, SO, dictee, presentatie). Controleer belangrijke data altijd in itslearning.
- Een opdracht staat alleen op "voltooid" als die via itslearning is ingeleverd. Werk dat op papier is ingeleverd, kan dus als "te laat" verschijnen.
- Afvinken is alleen voor jezelf en wordt niet naar itslearning gestuurd.
- Vaknamen komen uit de vakcode (bijvoorbeeld `1ha-netl-26/27` wordt Nederlands). Klik op een vaknaam om die te hernoemen.

## Actuele gegevens

- Bij het openen zie je meteen de laatst opgehaalde gegevens. Op de achtergrond wordt intussen gecontroleerd of er iets veranderd is.
- Rechtsboven staat hoe oud de gegevens zijn: een groene stip als alles actueel is, oranje als het verversen mislukt is of de gegevens ouder zijn dan een uur.
- Zolang het overzicht open en zichtbaar is, ververst het automatisch als de gegevens ouder zijn dan 10 minuten. Dat gebeurt ook als je terugkomt naar het tabblad.
- Het scherm wordt alleen opnieuw opgebouwd als er echt iets veranderd is. Uitgeklapte onderdelen en je scrollpositie blijven staan.
- De knop ↻ ververst direct.
- Laden gaat in twee stappen: eerst de planning (ongeveer 2 seconden), daarna de opdrachtstatus (ongeveer 4 seconden; itslearning verwerkt die pagina's één voor één). Vakken zonder planner worden voor de planning overgeslagen.

De gegevens worden lokaal in de browser bewaard (`chrome.storage.local`), alleen voor dezelfde ingelogde ouder.

## Nieuwe versie installeren

Vervang de map door de nieuwe versie en klik op `chrome://extensions` op het vernieuw-icoon van de extensie.

## Bestanden

- `manifest.json`: extensieconfiguratie (Manifest V3, rechten: alleen `storage`)
- `content.js`: haalt de gegevens op en tekent het overzicht
- `background.js`: verwerkt de klik op het extensie-icoon
