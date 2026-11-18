# Changelog

All notable changes to the GNARF Form Download app are documented here.
Versions follow [Semantic Versioning](https://semver.org/). The version in
`package.json` is the single source: it is written into the app manifest
(`manifest.webapp`) and the build file name, and shown in the app footer and
on every PDF page.

## [1.0.0] - 2026-11-18

### Added
- Data set picker (NTD GNARF by default; any data set with a
  `d2-autogen-forms` configuration, such as NTD GNARF-APVD, can be chosen).
- Organisation unit (country) and year selection.
- Tab selection: full data set (all tabs open for the country) or selected
  tabs, with an option to also pick tabs that are not open.
- Tabs open/closed from the Introduction answers, using the same
  dataStore rules as the data entry form.
- PDF download with data, or as a blank form, keeping the form layout:
  tab order, section titles, header/footer texts, age/sex grids, the
  detailed/basic age group switch, greyed cells and Country progress
  disease columns.
- Manifest developer: Filoi Private Limited.
