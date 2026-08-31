# CLAUDE.md - DEVA GIS Publishing

Operating instructions for GIS metadata, ArcGIS Portal publishing, and Python/ArcPy
work at Death Valley National Park (DEVA). This file is self-contained: everything
needed to produce a compliant deliverable is below. Do not go looking for a separate
standards document.

**Author / data steward:** Jamie Weleber, NEPA & GIS Specialist, Death Valley National
Park, working through a Great Basin Institute cooperative agreement.
**Metadata standard:** FGDC-STD-001-1998 (FGDC Content Standard for Digital Geospatial
Metadata).

---

## 0. Non-negotiables

Read these first. They are the errors that get caught in review.

1. **Every published dataset needs TWO artifacts, authored together:** a complete FGDC
   XML file and a Portal HTML description snippet. Never deliver one without the other
   unless explicitly told to.
2. **Never invent fields.** Ask for the actual field schema (names, types, widths,
   aliases, definitions, domain values) before writing any `<eainfo>` block. A guessed
   attribute table is worse than no attribute table.
3. **The NPS use-constraints disclaimer goes in verbatim** (Section 2.6). Do not
   paraphrase, shorten, or reflow it.
4. **HTML snippets use inline CSS only.** No `<style>` blocks, no `<script>`, no
   `<html>`, `<head>`, or `<body>` wrapper. Portal strips them.
5. **No em dashes anywhere** - not in XML, not in HTML, not in Python, not in prose.
   Portal mangles special characters, and it is a house style rule besides. Use plain
   hyphens.
6. **Ask before assuming CRS, extent, or feature count.** These are dataset facts, not
   defaults.

---

## 1. The deliverable contract

| Artifact | Purpose | Where it lives |
|---|---|---|
| FGDC XML | Formal federal compliance record. The authoritative metadata. | Saved alongside the source geodatabase; imported into ArcGIS Pro layer properties and into the Portal item via the Metadata tab. |
| HTML snippet | Human-readable item description for Portal display. | Pasted into the Portal item Description field via the HTML/Source editor. |

The XML is authoritative. The HTML is derived from it. If the two disagree, the XML wins
and the HTML gets fixed.

---

## 2. FGDC XML

### 2.1 Required top-level sections

| Section | Content |
|---|---|
| `idinfo/citation` | Layer title, originator, publication date, edition, geospatial data presentation form |
| `idinfo/descript` | Abstract (full description) and Purpose (intended use) |
| `idinfo/timeperd` | Time period of content plus currentness reference |
| `idinfo/status` | Progress (`Complete` / `In work`) and update frequency |
| `idinfo/spdom` | Bounding coordinates: West, East, North, South in decimal degrees |
| `idinfo/keywords` | Theme keywords with thesaurus; place keywords (DEVA, county, state); ISO topic category |
| `idinfo/accconst`, `idinfo/useconst` | Access and use constraints; NPS disclaimer verbatim in `useconst` |
| `idinfo/ptcontac` | NEPA & GIS Specialist, Death Valley NP, P.O. Box 579, Death Valley CA 92328 |
| `dataqual/lineage` | Source datasets and chronological process steps |
| `spdoinfo` | Spatial data type (Vector / Raster) and topology type |
| `spref` | Horizontal coordinate system definition (CRS, datum, projection parameters) |
| `eainfo` | Entity and attribute information - one `<attr>` per field |
| `distinfo` | Distribution liability, format, download URL if applicable |
| `metainfo` | Metadata date, contact, standard name and version |

### 2.2 Lineage is the quality signal

`dataqual/lineage` is the section reviewers actually read. It must document:

- Every source dataset: name, originator, publication date, scale or resolution, access URL
- Processing steps in chronological order, each with a date
- Tool names and key parameter settings for every geoprocessing step
- Any manual edits, digitizing, or attribute assignment
- Every projection transformation applied

Example `srcinfo` block:

```xml
<srcinfo>
  <srccite><citeinfo>
    <origin>Wilderness.net / Aldo Leopold Wilderness Research Institute</origin>
    <pubdate>20250101</pubdate>
    <title>National Wilderness Preservation System</title>
  </citeinfo></srccite>
  <srcscale>24000</srcscale>
  <typesrc>online</typesrc>
  <srctime><timeinfo><sngdate><caldate>20250101</caldate></sngdate>
  </timeinfo><srccurr>publication date</srccurr></srctime>
  <srccitea>Wilderness.net NWPS</srccitea>
  <srccontr>Source polygon geometry and all attributes</srccontr>
</srcinfo>
```

### 2.3 CRS note pattern for the final process step

When the Portal service CRS differs from the analysis CRS, say so explicitly in the last
process step so that `spref` (which documents the hosted service) and the process steps
(which document the analysis) can each be read without ambiguity:

> Analysis CRS: NAD 1983 UTM Zone 11N (EPSG 26911). Layer published to ArcGIS Portal in
> WGS 1984 Web Mercator Auxiliary Sphere (EPSG 3857) per Portal hosting requirements;
> source geodatabase retains NAD 1983 UTM Zone 11N.

### 2.4 eainfo - required sub-elements per field

Document **every** field, system fields included. One `<attr>` block per field.

| Sub-element | Required | Guidance |
|---|---|---|
| `attrlabl` | Yes | Exact geodatabase field name, not the alias. Example: `UNIT_NAME` |
| `attalias` | Recommended | Human-readable alias. If none is set, repeat the field name. |
| `attrtype` | Yes | FGDC type terms: `String`, `Integer`, `Single`, `Double`, `Date`, `OID`, `Geometry`, `GlobalID` |
| `attwidth` | Yes | Character length for String; storage bytes for numeric. `0` for Geometry and OID. |
| `atnumdec` | Numeric only | Decimal places. `0` for Integer, `6` for Double area fields. Omit for String, Date, Geometry, OID. |
| `attrdef` | Yes | Plain-English description of what the values represent, not a restatement of the field name. |
| `attrdefs` | Yes | `NPS` or `Death Valley National Park` for internal fields, `ESRI` for geodatabase system fields, or the source agency/standard for inherited fields. |
| `attrdomv` | Yes | One of the three domain types below. |

### 2.5 Domain types

| Element | Use when | Children |
|---|---|---|
| `<edom>` | Controlled vocabulary or coded values. **One separate `<attrdomv><edom>` block per distinct value - do not nest them.** | `<edomv>`, `<edomvd>`, `<edomvds>` |
| `<rdom>` | Continuous numeric where a min/max is more meaningful than an enumeration. | `<rdommin>`, `<rdommax>`, `<attrunit>` |
| `<udom>` | Free text, or values that cannot be enumerated. | A brief characterization statement |

### 2.6 NPS use constraints - paste verbatim into `<useconst>`

```
The National Park Service shall not be held liable for improper or incorrect use of the data described and/or contained herein. These data and related graphics (i.e., .gif or .jpeg format files) are not legal documents and are not intended to be used as such. The information contained in these data is dynamic and may change over time. The data are not better than the original sources from which they were derived. It is the responsibility of the data user to use the data appropriately and consistently within the limitations of geospatial data in general and these data in particular. The related graphics are intended to aid the data user in acquiring relevant data; it is not appropriate to use the related graphics as data. The National Park Service gives no warranty, expressed or implied, as to the accuracy, reliability, or completeness of these data. It is strongly recommended that these data are directly acquired from an NPS server and not indirectly through other sources which may have changed the data in some way. Although these data have been processed successfully on computer systems at the National Park Service, no warranty expressed or implied is made regarding the utility of the data on other systems for general or scientific purposes, nor shall the act of distribution constitute any such warranty. This disclaimer applies both to individual use of the data and aggregate use with other data.
```

### 2.7 Worked eainfo example

Taken from `DEVA_GIS_Desert_Tortoise_Core_Habitat.xml` (published February 2026). It shows
all three domain types in one layer. Use it as the pattern.

```xml
<eainfo>
  <detailed>
    <enttyp>
      <enttypl>DEVA_GIS_Desert_Tortoise_Core_Habitat</enttypl>
      <enttypd>Core habitat polygons for desert tortoise derived from focal density analysis of
        habitat suitability model outputs. Each polygon represents a spatially concentrated zone
        of moderate or optimal habitat quality.</enttypd>
      <enttypds>Death Valley National Park</enttypds>
    </enttyp>

    <!-- OID system field -->
    <attr>
      <attrlabl>OBJECTID</attrlabl>
      <attalias>OBJECTID</attalias>
      <attrtype>OID</attrtype>
      <attwidth>4</attwidth>
      <attrdef>System-assigned unique record identifier. Automatically managed by the geodatabase. Do not edit.</attrdef>
      <attrdefs>ESRI</attrdefs>
      <attrdomv><udom>Sequential positive integers automatically assigned by the geodatabase.</udom></attrdomv>
    </attr>

    <!-- Geometry field -->
    <attr>
      <attrlabl>Shape</attrlabl>
      <attalias>Shape</attalias>
      <attrtype>Geometry</attrtype>
      <attwidth>0</attwidth>
      <attrdef>Feature geometry. Automatically managed by the geodatabase.</attrdef>
      <attrdefs>ESRI</attrdefs>
      <attrdomv><udom>Coordinates defining the polygon feature geometry.</udom></attrdomv>
    </attr>

    <!-- String field with enumerated domain: one attrdomv per coded value -->
    <attr>
      <attrlabl>Habitat_Category</attrlabl>
      <attalias>Habitat Category</attalias>
      <attrtype>String</attrtype>
      <attwidth>50</attwidth>
      <attrdef>Classification of core habitat quality based on underlying HSI scores and focal
        density analysis. Indicates whether the polygon represents concentrated moderate or
        optimal habitat for desert tortoise.</attrdef>
      <attrdefs>Death Valley National Park</attrdefs>
      <attrdomv>
        <edom>
          <edomv>Moderate Core</edomv>
          <edomvd>Areas where at least 40% of the surrounding 450m neighborhood consists of
            moderate-quality habitat (HSI scores 2.0-2.49). Represents concentrated zones of
            habitat with moderate suitability for desert tortoise populations.</edomvd>
          <edomvds>Death Valley National Park</edomvds>
        </edom>
      </attrdomv>
      <attrdomv>
        <edom>
          <edomv>Optimal Core</edomv>
          <edomvd>Areas where at least 40% of the surrounding 450m neighborhood consists of
            optimal-quality habitat (HSI scores 2.5-3.0). Represents concentrated zones of
            highest-quality habitat conditions for desert tortoise populations.</edomvd>
          <edomvds>Death Valley National Park</edomvds>
        </edom>
      </attrdomv>
    </attr>

    <!-- Double field with range domain: note atnumdec and attrunit -->
    <attr>
      <attrlabl>ACRES</attrlabl>
      <attalias>Area (Acres)</attalias>
      <attrtype>Double</attrtype>
      <attwidth>8</attwidth>
      <atnumdec>6</atnumdec>
      <attrdef>Area of the core habitat polygon in acres, calculated from polygon geometry
        in the analysis coordinate system (NAD 1983 UTM Zone 11N).</attrdef>
      <attrdefs>Death Valley National Park</attrdefs>
      <attrdomv>
        <rdom>
          <rdommin>0.01</rdommin>
          <rdommax>999999.999999</rdommax>
          <attrunit>acres</attrunit>
        </rdom>
      </attrdomv>
    </attr>

    <!-- ESRI auto-calculated geometry field: attrdefs = ESRI, udom -->
    <attr>
      <attrlabl>Shape_Area</attrlabl>
      <attalias>Shape_Area</attalias>
      <attrtype>Double</attrtype>
      <attwidth>8</attwidth>
      <atnumdec>6</atnumdec>
      <attrdef>Area of the polygon feature in square meters. Automatically calculated and
        maintained by the geodatabase. Use the ACRES or HECTARES fields for
        human-readable area values.</attrdef>
      <attrdefs>ESRI</attrdefs>
      <attrdomv><udom>Positive real numbers automatically calculated from polygon geometry.</udom></attrdomv>
    </attr>

  </detailed>
</eainfo>
```

---

## 3. Portal HTML description snippet

### 3.1 Constraints

| Constraint | Detail |
|---|---|
| Styles | Inline only. Portal strips `<style>` blocks. |
| Text sizing | Wrap text in `<font size="2">` inside elements for consistent Portal rendering. |
| Em dashes | Never. Portal mangles special characters. Plain hyphens only. |
| Images | Avoid inline images; they break on item export. |
| Scripts | Not permitted. |
| Tables | Supported. Use `border-collapse:collapse` with explicit cell borders. |
| Wrapper tags | None. The snippet is a fragment. |

### 3.2 Color palette

| Element | Value |
|---|---|
| Heading text (H1/H2/H3) | `color: rgb(44, 95, 45)` |
| H1 underline | `border-bottom: 3px solid rgb(44, 95, 45)` |
| H2 underline | `border-bottom: 2px solid rgb(151, 188, 98)` |
| Table header row | `background-color: rgb(44, 95, 45); color: white` |
| Table odd row | `background-color: #f9f9f9` |
| Table even row | white, no style needed |
| Yellow warning box | `background-color: #fff3cd; border-left: 4px solid #ffc107` |
| Green approved box | `background-color: #d4edda; border-left: 4px solid rgb(44, 95, 45)` |
| Gray note box | `background-color: #e9ecef; border-left: 4px solid #6c757d` |

### 3.3 Section order

Include in this order, omitting sections that do not apply:

| Section | Required | Notes |
|---|---|---|
| Title (H1) | Yes | Full display name of the layer |
| Overview (H2) | Yes | 2-3 paragraphs: description, purpose, geographic scope |
| Classification / Categories | As needed | Value tables, category definitions, HSI scores |
| Methodology | As needed | Data sources table plus processing prose. Always include for models and analysis layers. |
| Attributes | Yes | User-facing fields only |
| Use Limitations | Yes | Yellow box for prohibited uses, gray box for general caveats |
| Data Quality | As needed | Source accuracy, vintage, known issues |
| Technical Specifications | Yes | Feature type, CRS, extent, feature count, spatial resolution |
| References | As needed | Academic or agency sources behind the methodology |
| Contact Information | Yes | DEVA block, Section 6 |
| Metadata Footer | Yes | Metadata date, standard, created by |

### 3.4 Skeleton

Replace `[BRACKETED]` content. Keep the inline styles exactly as written.

```html
<h1 style="font-weight:400; margin:24px 0px 12px; font-size:36px; line-height:1.1; color:rgb(44, 95, 45); border-bottom:3px solid rgb(44, 95, 45); padding-bottom:10px;"><font size="4">[Layer Title]</font></h1>

<h2 style="font-weight:400; margin:30px 0px 5px; font-size:18px; line-height:1.1; color:rgb(44, 95, 45); border-bottom:2px solid rgb(151, 188, 98); padding-bottom:5px;"><font size="3">Overview</font></h2>
<p style="margin:12px 0px; font-size:14px; line-height:1.6;"><font size="2">[2-3 paragraph description]</font></p>

<h2 style="font-weight:400; margin:30px 0px 5px; font-size:18px; line-height:1.1; color:rgb(44, 95, 45); border-bottom:2px solid rgb(151, 188, 98); padding-bottom:5px;"><font size="3">Attributes</font></h2>
<table style="width:100%; border-collapse:collapse; margin:15px 0; font-size:14px;">
<tr style="background-color:rgb(44, 95, 45); color:white;">
<th style="padding:8px 12px; text-align:left; border:1px solid #ddd;"><font size="2">Field Name</font></th>
<th style="padding:8px 12px; text-align:left; border:1px solid #ddd;"><font size="2">Description</font></th>
</tr>
<tr style="background-color:#f9f9f9;">
<td style="padding:8px 12px; border:1px solid #ddd;"><font size="2">[FieldName]</font></td>
<td style="padding:8px 12px; border:1px solid #ddd;"><font size="2">[Description]</font></td>
</tr>
<tr>
<td style="padding:8px 12px; border:1px solid #ddd;"><font size="2">[FieldName]</font></td>
<td style="padding:8px 12px; border:1px solid #ddd;"><font size="2">[Description]</font></td>
</tr>
</table>

<h2 style="font-weight:400; margin:30px 0px 5px; font-size:18px; line-height:1.1; color:rgb(44, 95, 45); border-bottom:2px solid rgb(151, 188, 98); padding-bottom:5px;"><font size="3">Use Limitations</font></h2>
<div style="background-color:#fff3cd; border-left:4px solid #ffc107; padding:10px; margin:15px 0;">
<font size="2"><strong>Caution:</strong> [Warning text. State prohibited uses.]</font>
</div>
<div style="background-color:#e9ecef; border-left:4px solid #6c757d; padding:10px; margin:15px 0;">
<font size="2"><strong>Note:</strong> [General disclaimer or caveat.]</font>
</div>

<h2 style="font-weight:400; margin:30px 0px 5px; font-size:18px; line-height:1.1; color:rgb(44, 95, 45); border-bottom:2px solid rgb(151, 188, 98); padding-bottom:5px;"><font size="3">Technical Specifications</font></h2>
<table style="width:100%; border-collapse:collapse; margin:15px 0; font-size:14px;">
<tr style="background-color:rgb(44, 95, 45); color:white;">
<th style="padding:8px 12px; text-align:left; border:1px solid #ddd;"><font size="2">Parameter</font></th>
<th style="padding:8px 12px; text-align:left; border:1px solid #ddd;"><font size="2">Specification</font></th>
</tr>
<tr style="background-color:#f9f9f9;">
<td style="padding:8px 12px; border:1px solid #ddd;"><font size="2">Feature Type</font></td>
<td style="padding:8px 12px; border:1px solid #ddd;"><font size="2">[Point / Polyline / Polygon / Raster]</font></td>
</tr>
<tr>
<td style="padding:8px 12px; border:1px solid #ddd;"><font size="2">Coordinate System</font></td>
<td style="padding:8px 12px; border:1px solid #ddd;"><font size="2">[e.g., NAD 1983 UTM Zone 11N (EPSG: 26911)]</font></td>
</tr>
<tr style="background-color:#f9f9f9;">
<td style="padding:8px 12px; border:1px solid #ddd;"><font size="2">Extent</font></td>
<td style="padding:8px 12px; border:1px solid #ddd;"><font size="2">[Geographic extent]</font></td>
</tr>
<tr>
<td style="padding:8px 12px; border:1px solid #ddd;"><font size="2">Feature Count</font></td>
<td style="padding:8px 12px; border:1px solid #ddd;"><font size="2">[Number of features]</font></td>
</tr>
</table>

<h2 style="font-weight:400; margin:30px 0px 5px; font-size:18px; line-height:1.1; color:rgb(44, 95, 45); border-bottom:2px solid rgb(151, 188, 98); padding-bottom:5px;"><font size="3">Contact Information</font></h2>
<p style="margin:12px 0px; font-size:14px; line-height:1.6;">
<font size="2"><strong>Death Valley National Park</strong><br>
P.O. Box 579<br>
Death Valley, CA 92328<br>
Phone: (760) 786-3200</font>
</p>
<p style="margin:12px 0px; font-size:14px; line-height:1.6;">
<font size="2"><strong>GIS &amp; Data Questions:</strong> Jamie Weleber, NEPA &amp; GIS Specialist</font>
</p>

<h2 style="font-weight:400; margin:30px 0px 5px; font-size:18px; line-height:1.1; color:rgb(44, 95, 45); border-bottom:2px solid rgb(151, 188, 98); padding-bottom:5px;"></h2>
<p style="margin-top:30px; margin-bottom:1.5rem; font-size:14px; color:#666; text-align:center;">
<font size="2"><span style="font-weight:600;">Metadata Date:</span> [Month Day, Year]<br>
<span style="font-weight:600;">Metadata Standard:</span> FGDC Content Standard for Digital Geospatial Metadata (FGDC-STD-001-1998)<br>
<span style="font-weight:600;">Created by:</span> [Name, Park Unit - Title]</font>
</p>
```

---

## 4. Publishing workflow

| Step | Action |
|---|---|
| 1 | Author FGDC XML in the ArcGIS Pro layer metadata editor or as a plain XML file. Save alongside the source GDB. |
| 2 | Import into the layer: right-click layer > View Metadata > Import > select file, type `FROM_FGDC`. |
| 3 | Draft the HTML snippet from the skeleton. Render it in a browser before pasting. |
| 4 | Share layer to Portal: Share > Web Layer, published as a Hosted Feature Layer. |
| 5 | On the Portal item page: Metadata tab > Import > upload the FGDC XML. Format: `FGDC CSDGM`. |
| 6 | Item Description tab > HTML/Source toggle > paste the snippet > Save. |
| 7 | Verify rendering: headings, table colors, callout boxes. |
| 8 | Fill in Summary, Tags, and Keywords per the table below. |

### 4.1 Item-level fields

| Field | Guidance |
|---|---|
| Summary | One sentence: content plus geographic scope. |
| Tags | Comma-separated: park unit (DEVA), topic keywords, NPS, data type, year. Match the FGDC theme keywords. |
| Keywords - Theme | ISO 19115 topic categories plus content keywords. Always include `National Park Service` and `Death Valley`. |
| Keywords - Place | Death Valley National Park; Death Valley; Inyo County; San Bernardino County; California; Nevada; Mojave Desert, as applicable. |
| Keywords - ISO Topic | The single best-fitting ISO 19115 category (boundaries, environment, biota, transportation, etc.). |
| Credits | National Park Service, Death Valley National Park. Portal description by [Name]. |

### 4.2 Known issues

- **`Tract` in a service name fails to publish.** Any service name containing the word
  `Tract` fails at the Portal publish step with a generic error roughly six seconds in.
  Rename the service before publishing (for example `DEVA GIS Parcels`). The terms are
  functionally equivalent in most administrative contexts.
- **XML import format.** Select `FGDC CSDGM` when importing into a Portal item; Portal
  auto-converts to ArcGIS metadata format for display. The HTML description field is a
  separate thing and must be populated by hand.

---

## 5. Attribute documentation policy

### 5.1 System fields

Document these in the FGDC `eainfo` XML. **Omit them from the Portal HTML Attributes
table** - they are auto-managed and mean nothing to end users.

| Field | Standard description |
|---|---|
| `OBJECTID` | System-assigned unique identifier. Automatically managed by the geodatabase. Do not edit. |
| `Shape` | Feature geometry. Automatically managed. |
| `globalid` | Globally unique identifier (GUID) assigned by the system for replication and sync. |
| `SHAPE_Length` | Calculated perimeter or length in the layer's coordinate system units. Automatically maintained. |
| `SHAPE_Area` | Calculated polygon area in the layer's coordinate system units. Automatically maintained. |

### 5.2 Editor tracking fields

`CreationDate`, `Creator`, `EditDate`, `Editor` are excluded from both the Portal HTML
Attributes table and the FGDC entity/attribute documentation on layers where NPS policy
restricts display of individual editor identities. If editor tracking is enabled but the
fields are undocumented, add a note saying so under Technical Specifications.

---

## 6. Standard contact block

| Field | Value |
|---|---|
| Organization | National Park Service, Death Valley National Park |
| Address | P.O. Box 579 |
| City / State / ZIP | Death Valley, CA 92328 |
| Phone | (760) 786-3200 |
| Data / GIS contact | Jamie Weleber, NEPA & GIS Specialist |
| Cooperative partner | Great Basin Institute (contract vehicle for GIS services) |

When the originating data came from another NPS division, program, or outside agency,
cite that organization as the originator but still list DEVA as the point of contact for
data questions.

---

## 7. Python / ArcPy conventions

Scripts written for this work follow a consistent house style. Match it.

**Formatting**

- No em dashes in any output: code, comments, docstrings, printed messages.
- Equals-sign bordered section headers to divide the script into phases:

```python
# =============================================================================
# STEP 3: RECLASSIFY HABITAT SUITABILITY RASTER
# =============================================================================
```

- Numbered `STEP` comments in execution order, so a reader can follow the workflow
  top to bottom without reconstructing it.
- Educational inline comments that explain **why**, not what. `# Buffer by 450m to match
  the focal neighborhood used in the HSI analysis` is useful. `# buffer the layer` is not.

**Runtime behavior**

- Progress logging in ArcGIS `AddMessage` style so output is readable both in the Pro
  geoprocessing pane and from a standalone run:

```python
def log(message):
    """Emit progress to both the GP pane and stdout."""
    arcpy.AddMessage(message)
    print(message)
```

- Log at the start and end of each STEP, plus counts of features processed. Silent
  scripts are hard to trust.

**Authentication**

- NPS Portal from inside ArcGIS Pro: `GIS("pro")`.
- ArcGIS Online: requires a registered OAuth application with a `client_id`. It will not
  work with the `"pro"` shortcut.

```python
from arcgis.gis import GIS

gis = GIS("pro")                      # NPS Portal, inherits the Pro session
# gis = GIS("https://www.arcgis.com", client_id="...")   # AGOL, OAuth app required
```

**Coordinate systems**

- Analysis and source geodatabases: NAD 1983 UTM Zone 11N (EPSG 26911).
- Portal hosted services: WGS 1984 Web Mercator Auxiliary Sphere (EPSG 3857).
- When a script reprojects, log both CRS values so the process step in the metadata can
  be written from the log.

---

## 8. Checklist before calling a metadata deliverable done

- [ ] Both artifacts produced: FGDC XML and HTML snippet
- [ ] `<eainfo>` has one `<attr>` per real field, from a schema the user supplied
- [ ] Every `<attr>` has `attrlabl`, `attrtype`, `attwidth`, `attrdef`, `attrdefs`, `attrdomv`
- [ ] Enumerated values are in separate `<attrdomv><edom>` blocks, not nested
- [ ] `atnumdec` present on numeric fields, absent on String/Date/Geometry/OID
- [ ] NPS disclaimer present verbatim in `<useconst>`
- [ ] Lineage documents sources, dated process steps, tools, and parameters
- [ ] Final process step names both the analysis CRS and the service CRS if they differ
- [ ] HTML uses inline styles only, no wrapper tags, no scripts
- [ ] HTML uses the green palette values exactly
- [ ] System and editor-tracking fields excluded from the HTML attributes table
- [ ] Contact block and metadata footer present in the HTML
- [ ] No em dashes anywhere in either artifact

---

*Derived from the DEVA GIS Metadata Standards & Publishing Reference (June 2026),
developed under the Great Basin Institute cooperative agreement, FY2025-2026.
Template source: NPS-Metadata-Template.html.*
