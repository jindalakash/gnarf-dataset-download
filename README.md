# GNARF Form Download (DHIS2 app)

Developed by **Filoi Private Limited**.

A DHIS2 app that downloads the **NTD GNARF** data set as a PDF for one
organisation unit (country) and year, either **with data** or as a **blank
form (without data)**, keeping the layout of the data entry form.

## How it works

GNARF is rendered in data entry by the *d2-autogen-forms* custom form, which
reads its layout from the dataStore (`d2-autogen-forms/NTD_GNARF`). This app
reads the same configuration, so the PDF follows the form:

- **Tabs**: sections are grouped by the integer part of `tabs.order`
  (0 = Introduction, 1 = Country progress, 2-31 = diseases); the decimal part
  orders sections inside a tab (version-style: 15.2 < 15.9 < 15.11).
- **Open tabs**: each disease tab has a `tabs.rules.visible` formula on its
  Introduction answer (`GNARF_Introduction_<disease>`). A tab is open unless
  the answer is empty, 2 (not endemic, will not report) or 3 (no data).
- **Layouts**: `table` (question / answer), `grid-category-columns`
  (rows = data elements, columns = category option combos with multi-level
  headers), `grid` (Country progress: rows = questions, columns = diseases).
- Also applied: `categoryOptionFilter` (detailed vs basic age groups),
  `dataElementsToExclude`, `columnsConfig` (hides disease columns not open),
  `columnsOrder`, `enableGroups`, header/footer texts and data element name
  constants, and greyed fields.

The blank form still uses the country's Introduction answers to decide which
tabs, columns and age groups appear, so it matches what that country fills in.

## Use

1. Pick the data set, country and year.
2. Choose **Full data set** (all open tabs) or **Selected tabs**.
3. Click **Download with data** or **Download without data (blank form)**.

## Develop

```bash
npm install
npm test          # unit tests (Node test runner)
npm start         # dev server against a DHIS2 instance
npm run build     # build/bundle/gnarf-dataset-download-<version>.zip
```

Install the zip through **App Management → Upload app** on the DHIS2 instance.

## Versioning

`package.json` `version` is the single source of truth (written into the
manifest). To release:

```bash
npm run release:patch   # or release:minor / release:major
```

then add an entry to `CHANGELOG.md`, commit, and tag `vX.Y.Z`.
