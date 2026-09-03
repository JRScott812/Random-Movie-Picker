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