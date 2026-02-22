# BSC SMART Data Catalogue Explorers

An experimental, machine-readable visualisation layer for the BSC data catalogues:

- Central Volume Allocation (CVA)
- Supplier Volume Allocation (SVA)
- Balancing Mechanism Reporting Service (BMRS)

This repository provides interactive explorers for structured JSON representations of these catalogues.

The objective is to explore how traditional BSC artefacts can evolve into machine-readable, queryable and ontology-aligned resources consistent with SMART standards and digital rulebook principles.

---

## Purpose

The Balancing and Settlement Code (BSC) data catalogues are traditionally distributed as static documents and spreadsheets.

This repository demonstrates:

- Structured JSON representation of catalogue artefacts  
- Schema-aligned structural contracts  
- Semantic classification clustering  
- Ontology candidate identification  
- Interactive exploration via GitHub Pages  

This is a technical experiment in digital rulebook transformation.

---

## Explorers

### CVA Explorer

Explores Annex B (Data Dictionary), including:

- Domain types  
- Logical formats  
- Semantic classification  
- Ontology candidate flagging  
- Valid sets  

---

### SVA Explorer

Explores Volume 2 (Data Items), including:

- Data flow count  
- NETA IDD cross-references  
- Settlement semantic clustering  
- Computability flags  

---

### BMRS Explorer

Explores:

- Reporting items (Tables 1–6)  
- Calculated data items  
- Functional validation rules  

---

## Design Principles

This project follows a three-layer architecture:

### 1. Data Layer  
Canonical JSON catalogue representations.

### 2. Schema Layer  
JSON Schema definitions describing structural contracts.

### 3. Presentation Layer  
A shared explorer UI built in vanilla JavaScript.

No frameworks.  
No build tooling.  
Fully static and GitHub Pages compatible.

---

## Folder Structure

```
bsc-smart-data-explorers/
│
├── index.html
├── cva.html
├── sva.html
├── bmrs.html
│
├── app.js
├── app.css
│
├── data/
│   ├── cva_annex_b_data.json
│   ├── sva_data_catalogue.json
│   └── bmrs_data_catalogue.json
│
├── schemas/
│   ├── cva_annex_b_schema.json
│   ├── sva_schema.json
│   └── bmrs_schema.json
│
└── README.md
```

---

## Running Locally

Open `index.html` directly in a browser.

Or deploy via GitHub Pages:

Settings → Pages → Deploy from `main` branch.

---

## Future Directions

- RDF / Turtle export layer  
- SHACL validation overlay  
- Ontology graph visualisation  
- Settlement lifecycle clustering  
- Cross-catalogue semantic alignment  

---

## Disclaimer

This repository is an independent experimental project.

It is not an official Elexon product, service or publication.

The data representations and visualisations provided here are exploratory and may not reflect the latest official BSC documentation.

Users should always refer to official Elexon publications for authoritative information.

---
