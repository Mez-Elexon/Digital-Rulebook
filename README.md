# BSC SMART Standards — Digital Rulebook Data Catalogue Package

This repository contains **machine-readable JSON data catalogues** and their **JSON Schemas** for three BSC catalogue families:

- **CVA** — Central Volume Allocation (Annex B Data Dictionary)
- **BMRS** — Balancing Mechanism Reporting Service (reporting requirements + derived items)
- **SVA** — Supplier Volume Allocation (Volume 2 Data Items)

The package is positioned at **SMART utility model Level 2 (with Level 3 signals)**: explicit structure, metadata, and initial semantic classifications to support downstream validation and enrichment.

## Quick start

- GitHub Pages landing page: `index.html` (repo root)
- Raw artefacts (open directly):
  - `cva_annex_b_data.json`
  - `bmrs_data_catalogue.json`
  - `sva_data_catalogue.json`
- Schemas:
  - `cva_annex_b_schema.json`
  - `bmrs_schema.json`
  - `sva_schema.json`

## What’s included

### 1) JSON Schemas

These define the canonical structure and required metadata for each catalogue.

| File | Purpose |
|------|---------|
| `cva_annex_b_schema.json` | CVA Annex B data items + metadata + acronyms |
| `bmrs_schema.json` | BMRS reporting items + calculated items + functional rules + metadata |
| `sva_schema.json` | SVA Vol 2 data items + metadata + flow mapping signals |

### 2) JSON Data catalogues (instances)

Each catalogue file includes:
- `metadata` (title, reference, version, effective date, status, SMART level)
- `statistics` (coverage counts)
- `acronyms`
- an items array (`data_items` / reporting structures depending on catalogue)

| File | Scope (headline) |
|------|-------------------|
| `cva_annex_b_data.json` | **497** CVA data items (NETA IDD enrichment + semantic classification flags) |
| `bmrs_data_catalogue.json` | **93** reporting items + **26** calculated items + **8** functional rules |
| `sva_data_catalogue.json` | **420** SVA data items + data-flow usage counts + cross references |

## Why this exists

The digital rulebook needs a **data foundation layer** before rules can be decomposed and made executable:

- the catalogues define **what data exists**
- the rulebook defines **what happens to that data** (obligations, conditions, calculations, validations)

This repo therefore acts as a seed input for:
- docs-as-code / CI validation pipelines
- structured clause decomposition pilots (e.g. BSC Section T)
- future ontology alignment (SMART Level 4 readiness)

## Using the package

### Validation
Use any JSON Schema validator (e.g. AJV) against the relevant schema:

- validate `cva_annex_b_data.json` with `cva_annex_b_schema.json`
- validate `bmrs_data_catalogue.json` with `bmrs_schema.json`
- validate `sva_data_catalogue.json` with `sva_schema.json`

### Consumption patterns
Typical downstream consumers will:
- read `metadata` for governance/versioning
- use `statistics` to confirm completeness and coverage
- ingest item arrays into a model store (graph, relational, document DB)
- add stronger Level 3 semantics (clause-level references, computability, relationships, endpoint mappings)

## Publishing (GitHub Pages)

This repo ships a single interactive landing page (`index.html`) that:
- loads the JSON catalogues at runtime
- displays document metadata and summary statistics
- links to raw JSON and schema files

Recommended Pages settings:
- Settings → Pages → “Deploy from a branch”
- Branch: `main` (or `master`)
- Folder: `/ (root)`

## Licence / attribution
Unless otherwise stated, the catalogue content is derived from BSC artefacts and should be treated as **Elexon / BSC** sourced material with appropriate internal handling and attribution.
