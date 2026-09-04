# Random-Movie-Picker
Displays a preview of an available English-language DVD from Taylor University's Zondervan Library through the PALNI catalog, including its location and call number.

Random mode finds an available movie from the catalog. Shelf browsing mode opens the DVD shelf directly without requiring a title or keyword, then lets you move through PALNI's physical DVD shelf with Previous and Next controls. Each nearby record links to the catalog and shows TMDB poster art when available. Classic mode preserves the original random-index picker.

Run `npm start` and open http://localhost:3000.

## Optional TMDB posters

Create a free TMDB API Read Access Token, then copy [example.env](example.env) to `.env` and replace its placeholder value with your token. The local `.env` file is ignored by Git.

```sh
cp example.env .env
npm start
```

For a deployment or GitHub Actions workflow, add the same value as a `TMDB_ACCESS_TOKEN` repository secret/environment variable. Environment variables supplied by the host take precedence over `.env` values. The token is never sent to the browser. Without it, the app continues to show the PALNI title, location, and call number without poster art.

## Production deployment

GitHub Pages serves the frontend at `https://jrscott812.github.io/Random-Movie-Picker/`. The API runs on Heroku at `https://random-movie-picker-4d4e4afe3a91.herokuapp.com/`; [picker.js](picker.js) automatically sends Pages requests to that service. Direct visits to the Heroku URL continue to use its same-origin API.

Set these Heroku Config Vars:

```text
TMDB_ACCESS_TOKEN=your TMDB API Read Access Token
ALLOWED_ORIGIN=https://jrscott812.github.io
CATALOG_URL=https://catalog.library.taylor.edu/cgi-bin/koha/opac-search.pl
DEFAULT_SHELF_ITEMNUMBER=2274508
```

GitHub repository secrets are not automatically available to Heroku at runtime. The server reads Heroku's `PORT` automatically. `ALLOWED_ORIGIN`, `CATALOG_URL`, and `DEFAULT_SHELF_ITEMNUMBER` have the shown values as defaults, so you only need to set them when changing the deployment or library source.