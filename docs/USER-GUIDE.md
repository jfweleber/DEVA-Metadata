# Using the DEVA Metadata Publisher

For DEVA GIS staff publishing a layer to Portal or ArcGIS Online. Fifteen
minutes for a layer you know well, longer for one with many attributes.

Site: <https://metadata.weleber.net>

## Before you start

Have these to hand. The tool will not guess any of them:

- The metadata export from ArcGIS Pro for the layer.
- What each user-facing field actually means, and the meaning of every coded
  value in it.
- Where the data came from: source datasets with originators and dates.
- What you did to produce the layer: tools, parameters, dates.
- The feature count and extent of the published layer.

## Getting the export out of ArcGIS Pro

1. In the Catalog pane, right-click the feature class or layer, choose
   **View Metadata**.
2. On the **Metadata** tab of the ribbon, click **Export**.
3. Choose **FGDC CSDGM Metadata** or **ArcGIS Metadata**. Either works.
4. Save the `.xml` somewhere you can find it.

The export carries the field schema, extent, coordinate system and feature
count. It rarely carries field definitions, which is the part you will spend
most of your time on.

## The eight steps

**1. Upload.** Drop the file in. The tool tells you what it read and what it
could not find. Nothing is uploaded to a server; the file is read in your
browser.

**2. Identification.** Title, publication date, originator, abstract, purpose,
status and the contact block. The abstract should be two to three paragraphs
covering what the data are, how they were made and where they cover. Leave a
blank line between paragraphs.

**3. Keywords.** Theme keywords, place keywords and one ISO topic category.
Match these to the tags you will put on the Portal item. The NPS use
constraints disclaimer is fixed and cannot be edited, which is deliberate.

**4. Spatial.** Confirm the geometry type, feature count and bounding box, and
set both coordinate systems: the one the source geodatabase uses (normally
NAD 1983 UTM Zone 11N) and the one the hosted service uses (normally Web
Mercator). Confirm these even when the upload filled them in.

**5. Lineage.** Every source dataset with its originator, date and scale, then
every processing step in order with a date. Name the tool and the parameter
values. "Buffered the layer" is not a process step. "Buffered by 450 m to match
the HSI focal neighborhood" is. If the two coordinate systems differ, the tool
adds the required sentence to the last step for you.

**6. Attributes.** The core of the work. Every field needs a plain-English
definition and a definition source. Fields flagged **needs definition** in red
are the ones blocking you.

Pick the domain type that fits:

| Domain | Use it when | Example |
|---|---|---|
| Enumerated (edom) | The field holds a fixed set of coded values | `Habitat_Category` with Moderate Core and Optimal Core |
| Range (rdom) | A continuous number where a min and max say more than a list | `ACRES` from 0.01 to 18422.53 |
| Free text (udom) | Anything that cannot be listed | A notes or observer field |

System fields such as `OBJECTID` and `Shape_Area` are documented in the XML and
hidden from the Portal table automatically. Editor tracking fields are left out
of both, and a note explaining that is added to the item description.

**7. Description.** The parts of the Portal page that are not derived from the
XML: the overview, an optional category table, methodology prose, and the two
callout boxes. Put prohibited uses in the yellow caution box.

**8. Review and download.** Fix anything listed in red, check the preview, then
download the XML and copy the HTML snippet.

## Publishing what you downloaded

1. Save the XML next to the source geodatabase.
2. In Pro: right-click the layer, **View Metadata**, **Import**, select the
   file, type **FROM_FGDC**.
3. Share the layer to Portal as a Hosted Feature Layer.
4. On the Portal item page: **Metadata** tab, **Import**, upload the XML,
   format **FGDC CSDGM**.
5. On the item **Description** tab, switch to the HTML source view, paste the
   snippet, save.
6. Check that headings, table colors and callout boxes rendered.
7. Fill in Summary, Tags and Keywords to match the keywords in this record.

A service name containing the word **Tract** fails to publish with a generic
error about six seconds in. Rename the service first, for example
`DEVA GIS Parcels`.

## Saving your work

Your record is saved in this browser automatically and comes back when you
return. It is tied to that one browser on that one machine.

To move a record between machines, or to keep it for later, use **Save draft
(.json)** on the review step and reopen it with **Open a saved draft** on the
upload step.

**Start over** clears everything. Download first.

## Common questions

**The upload found no fields.** The export was made from a layer rather than the
feature class, or the metadata style in Pro is set to Item Description, which
omits the attribute section. Re-export from the feature class in the Catalog
pane. You can also add fields by hand on the Attributes step, from the real
schema in Pro. Do not type in a schema from memory.

**My coordinate system is not in the list.** Choose **Other / not listed** and
describe it. Paste the well-known text from Pro layer properties so the
projection is unambiguous.

**It changed my dashes and quotation marks.** On purpose. Portal mangles em
dashes and curly quotes, so both artifacts use plain hyphens and straight
quotes. This is house style, not a bug.

**Can I edit the NPS disclaimer?** No. It has to appear word for word.

**Do I have to fill in every warning?** Warnings are suggestions and do not
block a download. Anything in red does block a compliant record.
