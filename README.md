# World Map Challenge

A static browser game with six modes, selected from the main menu on every visit.

## Quick start

You need Node.js 22 or newer, including npm and npx. No build step or project dependency installation is required.

1. Open a terminal (for example, the integrated terminal in VS Code).
2. Start a local web server from the project folder. On Windows PowerShell:

   ```powershell
   Set-Location C:\Projects\world-map
   npx --yes serve src --listen tcp://127.0.0.1:8080
   ```

   npx downloads `serve` on the first run, so you do not need to install it globally. If you already have `serve` installed, you can run `serve src --listen tcp://127.0.0.1:8080` instead.

3. Open **http://127.0.0.1:8080/** in your browser and choose a mode from the main menu.
4. Keep the terminal running while you play. Press **Ctrl+C** in that terminal to stop the server.

Do not open the HTML file directly: the app uses ES modules and needs an HTTP server. An internet connection is required for the map and D3/TopoJSON libraries; capital metadata and flag images are bundled locally.

Learning progress is saved in your browser. Use the same browser and local address on later visits to continue learning.

## Game modes

- **Name the Countries** preserves the original free-order map challenge, saved answers, typo tolerance and evaluation.
- **Name the Capitals** shows the country and its flag, with capital locations marked on the map. Enter a capital name.
- **Match the Flag** shows the country and its capitals. Choose the correct flag from four randomly shuffled options.
- **Learn: Country names, Capitals, Flags** use zoomed map cards, hiding the information being learned. Country and capital answers are typed; flags use four choices. Country and flag learning also hide capital names and capital map markers, even after revealing the answer. Country-name learning also hides the flag.

All challenges let you browse the map freely and select countries in any order. Save or revise answers, clear them with the inline **×**, or select another country; press **Evaluate** when ready. Answers are saved separately for each challenge in this browser. Capital markers appear for the selected country; hover shows country names before evaluation and reveals capitals afterward. Flag selections can be revised before evaluation.

Automatic jumps zoom in further for tiny countries such as San Marino, so the selected country remains visible after leaving a larger one.

On mobile, the header's hamburger button opens **Main menu**, **How to play**, **Evaluate**, **Start again**, or **Play again** as appropriate. Evaluated challenge details are read-only and hide Save and clear controls. The copyright appears in the main menu; the map copyright is hidden on mobile.

Before evaluation, **Evaluate** appears next to the header's answer count once an answer has been saved. It also remains available in the header actions. **Start again** is in the header actions (the hamburger menu on mobile); use it to clear the current challenge's saved answers and start over.

The capital challenge requires **all** listed capitals for countries with multiple capitals. Enter them in any order, separated by commas or spaces; localized aliases, missing accents and small typos are accepted. Multi-word names need no quotation marks.

Learning decks are independent and saved in this browser:

- Learning progress is shown in the header; **Reset learning** is in the header actions (the hamburger menu on mobile). Cards use input placeholders instead of duplicate text prompts, and hide **Check answer** after submission.
- Country-name learning uses a shorter **Check** button, with **Don't know** beside it.
- Each learning session starts with a random eligible country, then favors the geographically nearest country within the same review priority. Due reviews still precede new cards, and missed-card repetition keeps its existing spacing.
- Learning modes offer **Don't know** to reveal the answer with neutral feedback and count it as a miss. Learning cards then repeat.
- Missed cards reset their streak and return after four other answers. If no other cards are available, they repeat immediately.
- Correct answers schedule reviews after 1, 3, 7, 14, then 30 days (subsequent successes remain at 30 days).
- **Too easy** appears only after a correct answer and excludes that card from the learning deck until **Reset learning** is used. Resetting one deck does not affect the others.
- A completed deck shows its next review time. Returning later resumes the due cards. There is no account or cross-device synchronization.

The interface, country names and capital names follow browser language preferences (English, German or Czech). English names and localized aliases are accepted. Capital learning accepts any listed capital, while the capital challenge requires them all. Yaren represents Nauru's seat of government, as Nauru has no official capital. Greenland remains visible on the map but is excluded from all challenges and learning decks; the active modes cover 196 countries.

## Tests

With Node.js 22 or newer installed, run the focused tests from the project folder:

```sh
node --test src/learning.test.mjs
```

Tests are optional when simply running the app. Loading and browser-storage errors are shown explicitly.

## Project layout and deployment

All deployable files live in `src/`: the HTML page, JavaScript modules, stylesheet, country data, flags, favicon and social preview image. The test file also lives in `src/`, but Firebase excludes `*.test.mjs` files from deployment. Documentation and Firebase configuration stay in the project root and are not deployed.

Firebase Hosting is configured to publish `src/` as the website root. Existing asset URLs and the fallback to `/index.html` are unchanged. The Firebase project remains `konsti-world-map`, as configured in `.firebaserc`.

To deploy, run this from the project root after signing in to the Firebase CLI:

```sh
npx --yes firebase-tools login
npx --yes firebase-tools deploy --only hosting
```

## Data sources

- Map: [world-atlas / Natural Earth](https://github.com/topojson/world-atlas), with the original game's country exclusions and border adjustments retained.
- Country codes and capital names: [mledoze/countries](https://github.com/mledoze/countries), [ODbL license](https://github.com/mledoze/countries/blob/master/LICENSE). The bundled database is derived from this source and is available under the same license.
- Capital coordinates and alternative city names: [GeoNames cities15000](https://download.geonames.org/export/dump/), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Records are joined by country code and city name; multiple-capital entries for Bolivia, Eswatini and Sri Lanka are supplemented.
- Flags: [FlagCDN / Flagpedia](https://flagcdn.com/), bundled as SVG images.

Data snapshot: November 2026. Capital names and administrative arrangements can change; update the bundled metadata when updating the country coverage.
