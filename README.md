# Hva er gym for deg? – ordsky til Forskernatt

En enkel nettside til standen om kroppsøving på Forskernatt (NTNU).
Besøkende svarer på to spørsmål med ett eller to ord hver, og svarene vises som to
animerte ordskyer – jo flere som har svart det samme ordet, jo større blir det.

- Ingen innlogging, ingen server: alt er statiske filer.
- Svarene lagres i nettleseren (`localStorage`) på maskinen ved standen.
- Ordskyene er skjult bak en «skillevegg» så nye besøkende ikke lar seg
  inspirere av andres svar. Etter at noen har svart, rulles skilleveggen opp i
  10 sekunder (eller til neste person begynner å skrive). En «shot clock» øverst
  teller ned til skilleveggen går ned igjen.
- Fungerer uten internett når siden først er lastet, også om noen trykker F5
  (sidens filer lagres i nettleseren). Åpne siden én gang med nett før kvelden starter.

## Endre spørsmålene

Åpne `config.js` og endre teksten:

```js
questions: [
  'Beskriv "gym" med ett eller to ord.',
  'Nevn én ting du savner i gym.',
],
```

Her kan du også endre tittel, undertittel, takketekst, farger, teksten på
skilleveggen, hvor lenge ordskyene vises etter et svar (`revealMs`) og hvor lenge
siden venter før den går tilbake til spørsmål 1 (`idleResetMs`).

## Kjøre lokalt

```bash
python3 -m http.server 8000
```

Åpne <http://localhost:8000>. (Man kan også dobbeltklikke `index.html`, men da
lagres svarene under en annen adresse enn på den publiserte siden.)

## Publisere på GitHub Pages

1. Lag et nytt repository på GitHub og push denne mappen til `main`:
   ```bash
   git remote add origin https://github.com/<bruker>/<repo>.git
   git push -u origin main
   ```
2. På GitHub: **Settings → Pages → Build and deployment → Deploy from a branch**,
   velg `main` og `/ (root)`, trykk **Save**.
3. Etter et minutt ligger siden på `https://<bruker>.github.io/<repo>/`.

## På standen

- Bruk **samme nettleser og samme adresse** hele kvelden, og **ikke** privat
  vindu/inkognito – ellers forsvinner svarene.
- Trykk **F11** for fullskjerm.
- Flyten: skriv ett eller to ord → **Enter** → ett eller to ord → **Enter**. **Esc** går tilbake
  til spørsmål 1.

### Admin

Åpne/lukk adminpanelet med **Ctrl+Shift+A**, eller skriv `/admin` i svarfeltet
og trykk Enter (noen nettlesere bruker Ctrl+Shift+A selv).

- **Slett** skjuler et ord fra skya (også hvis noen skriver det igjen senere).
- **Slå sammen**: huk av to eller flere varianter (f.eks. «savner variasjon»,
  «mangler variasjon», «variasjon») og trykk **Slå sammen valgte**. Du velger
  navnet på det sammenslåtte ordet. Nye svar med en av variantene havner
  automatisk i det sammenslåtte ordet. **Angre** i lista under oppløser en
  sammenslåing.
- Slett og Slå sammen påvirker bare ordskyene. CSV-en inneholder alltid det
  folk faktisk skrev.
- **Vis ordskyene hele tiden** ruller opp skilleveggen til du slår det av
  (fint for å diskutere resultatene). Ordskyene vises også mens adminpanelet er åpent.
- **Last ned CSV** laster ned alle svar slik de ble skrevet, som
  `respondee_number;answer_1;answer_2` (UTF-8, åpnes riktig i Excel).

- **Slett alle svar** (nederst i adminpanelet) gir et helt blankt ark: alle svar,
  sammenslåinger og slettede ord fjernes, også fra CSV-en, og nummereringen
  starter på 1 igjen. Du må skrive **SLETT** for å bekrefte. En kopi av svarene
  lastes ned først (`…-før-sletting.csv`). Bruk dette for å fjerne testdata før
  dere går live.

**Husk å laste ned CSV før du lukker nettleseren på slutten av kvelden.**

## Tester

```bash
node tests/run-node.js
```

eller åpne `tests/index.html` via den lokale serveren.

## Filer

| Fil | Innhold |
|-----|---------|
| `index.html` | Selve siden |
| `config.js` | Tekster og farger – den eneste fila du trenger å endre |
| `style.css` | Utseende |
| `app.js` | Svarflyt, adminpanel og CSV-nedlasting |
| `store.js` | Lagring, telling, sletting og CSV |
| `cloud.js` | Plassering og animasjon av ordskyene |
| `fonts/` | Anton og Barlow Condensed (SIL OFL) |
