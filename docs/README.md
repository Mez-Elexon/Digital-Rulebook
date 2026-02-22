# BMRS Catalogue Explorer (GitHub Pages)

This folder contains a **drop-in** static GitHub Pages site for browsing the BMRS data catalogue with:

- Faceted filters (table, semantic type, provider, frequency, temporal scope, granularity, ontology candidate)
- Full-text search across codes/descriptions/refs
- Deep links (filters + selected item persisted in the URL)
- Item detail panel with raw JSON and copy-to-clipboard

## Files

- `index.html` — entrypoint (SPA router via hash)
- `assets/app.js` — client-side logic
- `assets/styles.css` — styling
- `data/bmrs_data_catalogue.json` — the catalogue instance
- `schemas/bmrs_schema.json` — the schema

## How to use in your repo

Option A (recommended): copy these folders into your repo root:

```
index.html
assets/
data/
schemas/
```

Then enable GitHub Pages:

- Settings → Pages → Deploy from a branch
- Branch: `main` (or `master`)
- Folder: `/ (root)`

Option B: if you already have a landing page, mount this under `/bmrs/` and adjust `DATA_URL` in `assets/app.js` accordingly.

## Deep links

Examples (yours will vary):

- `#/reporting?q=imbalance&table=1`
- `#/reporting?semantic_type=measurement&data_provider=NETSO&sel=...`
- `#/calculated?q=derived`
