# DEVA Metadata Publisher

Online metadata builder for Death Valley National Park GIS staff, published at
**[metadata.weleber.net](https://metadata.weleber.net)**.

Upload the metadata XML that ArcGIS Pro exports for a layer, answer the handful
of questions FGDC needs and ArcGIS does not collect, and download the two
artifacts the DEVA publishing standard requires:

| Artifact | What it is | Where it goes |
|---|---|---|
| FGDC XML | The authoritative FGDC-STD-001-1998 record | Saved beside the source geodatabase, imported into the Pro layer metadata, and uploaded on the Portal item Metadata tab |
| HTML snippet | The human-readable item description | Pasted into the Portal or AGOL item Description field through the HTML/Source editor |

Both are authored together. Neither ships alone.

## How it works

1. **Upload.** Drop in the `.xml` ArcGIS Pro exported. The tool reads ArcGIS
   metadata format, FGDC CSDGM and ISO 19139 records, and pulls out the field
   schema, extent, coordinate system, feature count, keywords and lineage.
2. **Answer what is missing.** The wizard flags exactly what the export did not
   carry. In practice that is field definitions, domains, the purpose statement
   and lineage detail, which is what reviewers actually check.
3. **Review.** Live validation against the FGDC required elements and the DEVA
   deliverable checklist, with a rendered preview of the Portal snippet.
4. **Download.** The XML file and the HTML snippet, plus a `.json` draft you can
   reopen later.

Nothing is uploaded anywhere. Parsing, generation and validation all run in the
browser, so an unpublished dataset export never leaves the machine it is on.

## What the tool enforces

Straight from `CLAUDE.md`, the DEVA GIS publishing standard that ships in this
repository:

- Every published dataset gets both artifacts (Section 1).
- Field schemas come from the uploaded file, never invented (Rule 2). The
  attributes step will not fabricate a field it did not read.
- The NPS use constraints disclaimer is written verbatim, and validation fails a
  record that paraphrases it (Section 2.6).
- The HTML snippet is a fragment: inline styles only, no wrapper tags, no
  scripts, `<font size>` on every text run, and the exact green palette
  (Section 3).
- No em dashes anywhere. Typed text is normalized on the way into both
  artifacts, and you are told when it happened (Rule 5).
- Enumerated domain values each get their own `<attrdomv><edom>` block, never
  nested (Section 2.5).
- `atnumdec` appears on numeric fields and nowhere else (Section 2.4).
- System and editor tracking fields are documented in the XML and kept out of
  the Portal attributes table (Sections 5.1 and 5.2).
- When the analysis and service coordinate systems differ, the final process
  step says so in the wording the standard specifies (Section 2.3).
- `<spref>` carries real FGDC grid or projection parameters, not just a
  coordinate system name, so the record validates rather than merely reading
  well.

## Documentation

- [`docs/USER-GUIDE.md`](docs/USER-GUIDE.md) walks DEVA staff through the eight
  steps and the publishing workflow that follows.
- [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) covers hosting at
  metadata.weleber.net, where the domain already points at an nginx host and
  needs only a server block and a certificate.
- [`CLAUDE.md`](CLAUDE.md) is the DEVA GIS publishing standard this tool
  implements.

## Running it locally

No build step and no dependencies. Any static file server will do.

```bash
npm run serve      # http://localhost:8080
npm test           # unit tests, node --test
```

Node 18 or newer for the tests and the dev server. The site itself needs only a
modern browser.

## Repository layout

```
index.html              the whole app shell
assets/app.css          styling, using the Section 3.2 palette
src/lib/                pure logic, no DOM, unit tested
  xml.js                dependency-free XML parser and writer
  text.js               house style: em dash rule, dates, escaping
  crs.js                coordinate system registry and FGDC spref builder
  model.js              the project model and DEVA constants
  import.js             reads ArcGIS Pro, FGDC and ISO records
  fgdc.js               generates the FGDC XML
  html.js               generates the Portal snippet
  validate.js           FGDC required elements plus the Section 8 checklist
src/app/                the wizard UI
samples/                an example ArcGIS Pro export for training and tests
tests/                  unit tests
docs/                   user guide and deployment notes
CLAUDE.md               the DEVA GIS publishing standard this tool implements
```

`src/lib` has no DOM dependencies, which is why the same code runs in the
browser and under `node --test`.

## Adding a coordinate system

`src/lib/crs.js` holds the systems DEVA publishes in. Add an entry with its
EPSG code, datum and FGDC grid or projection parameters, and it appears in the
Spatial step automatically. Anything not listed can still be described by hand
in the app, and is written out through the standard's `<otherprj>` element.

## Credits

National Park Service, Death Valley National Park. Built for the GIS publishing
workflow maintained by Jamie Weleber, NEPA and GIS Specialist, under a Great
Basin Institute cooperative agreement.

Metadata standard: FGDC Content Standard for Digital Geospatial Metadata
(FGDC-STD-001-1998).
