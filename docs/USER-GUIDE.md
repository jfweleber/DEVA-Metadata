# Using the DEVA Metadata Publisher

For DEVA GIS staff publishing a layer to Portal or ArcGIS Online. Fifteen
minutes for a layer you know well, longer for one with many attributes.

Site: <https://metadata.weleber.net>

## Before you start

Have these to hand. The tool will not guess any of them:

- An export from ArcGIS, see below.
- What each user-facing field actually means, and the meaning of every coded
  value in it.
- Where the data came from: source datasets with originators and dates.
- What you did to produce the layer: tools, parameters, dates.

## Getting the export out of ArcGIS Pro

**Use the XML Workspace Document.** It works whether or not the layer has any
metadata, which most do not.

1. In the Catalog pane, right-click the geodatabase, feature dataset or feature
   class and choose **Export**, then **XML Workspace Document**.
2. Choose **Binary** or **Text**; text is what to upload here.
3. Leave **Export the data** ticked if you can. With the data included the tool
   counts your features and measures your value ranges instead of asking you.
4. Save the `.xml` somewhere you can find it.

That file carries the field schema, the domains, the geometry type, the
coordinate system, the extent and the editor tracking configuration. What it
does not carry is anything a person has to write: the title, the abstract, the
purpose, the keywords and the lineage. Those are what the wizard asks for.

**If the layer already has good metadata**, export that too and upload it
instead: right-click the layer, **View Metadata**, then **Export** on the
Metadata tab. FGDC CSDGM, ArcGIS Metadata and ISO 19139 all work. If the
workspace export already had metadata embedded in it, the tool uses both without
being asked.

### A note on large exports

A workspace exported with data can be very large. The tool reads it in pieces
and shows progress; a few hundred megabytes is fine, and nothing is uploaded
anywhere. If your geodatabase is enormous, export just the one feature class
rather than the whole thing.

### Picking a dataset

A workspace export of a whole geodatabase holds many feature classes and tables.
Metadata is written for one dataset at a time, so the tool asks which one you are
publishing. Do the others afterwards; each gets its own pair of artifacts.

## You do not have to write the metadata

The step that matters most is **Describe**, and it exists so you never face a
blank abstract box. You answer a page of questions, most of them checkboxes, and
the tool writes:

- the abstract, purpose and Portal summary
- theme keywords, place keywords, tags and the ISO topic category
- the access constraints, including the restricted wording for sensitive
  species and cultural resource locations
- the use limitations caution box and the data quality section
- the methodology text and a first draft of the lineage process steps
- draft definitions for fields with common names, such as OBSERVER or
  SURVEY_DATE

It writes from your answers and from what it read out of your export. It does
not make anything up: skip a question and the sentence it would have produced
simply is not there.

Two things are still yours. Read the abstract before you download it, because
your name is on the record. And define the fields that only you understand: a
field called `HSI_Mean` or `Habitat_Category` means something specific to your
project, and no tool can know what.

Anything drafted can be edited on the steps that follow. If you edit the
abstract and then answer more questions, use **fill only what is still empty** so
your wording survives.

## The nine steps

**1. Upload.** Drop the file in. The tool tells you what it read and what it
could not find. Nothing is uploaded to a server; the file is read in your
browser.

**2. Describe.** The guided questions above. Answer them, press **Write the
draft**, and most of the record fills in. You can come back and rewrite after
changing an answer.

**3. Identification.** Title, publication date, originator, abstract, purpose,
status and the contact block. The abstract and purpose arrive already drafted. The abstract should be two to three paragraphs
covering what the data are, how they were made and where they cover. Leave a
blank line between paragraphs.

**4. Keywords.** Theme keywords, place keywords and one ISO topic category,
suggested from your answers and the field names. Add anything a colleague would
search for that is missing. The NPS use
constraints disclaimer is fixed and cannot be edited, which is deliberate.

**5. Spatial.** Confirm the geometry type, feature count and bounding box, and
set both coordinate systems: the one the source geodatabase uses (normally
NAD 1983 UTM Zone 11N) and the one the hosted service uses (normally Web
Mercator). Confirm these even when the upload filled them in.

A workspace export states its extent in the dataset's own coordinate system, and
FGDC wants decimal degrees, so the tool converts it for you. It can do that for
UTM, Web Mercator and geographic coordinates. For anything else it leaves the
box empty and asks, rather than filling in a number it cannot stand behind.

**6. Lineage.** A first draft of the process steps arrives from your collection
answers. Sharpen it: add every source dataset with its originator, date and
scale, and put the tool names and parameter values into the steps. Name the tool and the parameter
values. "Buffered the layer" is not a process step. "Buffered by 450 m to match
the HSI focal neighborhood" is. If the two coordinate systems differ, the tool
adds the required sentence to the last step for you.

**7. Attributes.** The core of the work. Every field needs a plain-English
definition and a definition source. Fields flagged **needs definition** in red
are the ones blocking you.

From a workspace export, a lot of this arrives already done. Coded value domains
and range domains defined in the geodatabase come across as FGDC enumerated and
range domains, and editor tracking fields are identified from the geodatabase's
own configuration rather than guessed from their names. If the export included
the data, each field also shows what is actually in it: how many values, how many
empty, the range for numbers, the date span for dates, and the distinct values
for text where there are few enough to list.

Pick the domain type that fits:

| Domain | Use it when | Example |
|---|---|---|
| Enumerated (edom) | The field holds a fixed set of coded values | `Habitat_Category` with Moderate Core and Optimal Core |
| Range (rdom) | A continuous number where a min and max say more than a list | `ACRES` from 0.01 to 18422.53 |
| Free text (udom) | Anything that cannot be listed | A notes or observer field |

System fields such as `OBJECTID` and `Shape_Area` are documented in the XML and
hidden from the Portal table automatically. Editor tracking fields are left out
of both, and a note explaining that is added to the item description.

**8. Description.** The parts of the Portal page that are not derived from the
XML: the overview, an optional category table, methodology prose, and the two
callout boxes. Put prohibited uses in the yellow caution box.

**9. Review and download.** Fix anything listed in red, check the preview, then
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

## Portal item fields

The review step also gives you the **Summary**, **Tags** and **Credits** for the
Portal item page, with copy buttons. Those three live on the item page rather
than in either file, and they are the ones people usually retype from scratch.

## Common questions

**The upload found no fields.** If you uploaded a metadata export, it was
probably made with the metadata style set to Item Description, which omits the
attribute section. Export an XML Workspace Document instead; it always carries
the schema. You can also add fields by hand on the Attributes step, from the real
schema in Pro. Do not type in a schema from memory.

**My layer has no metadata at all.** That is the normal case and the reason the
workspace export is the recommended upload. The schema, domains, extent and
coordinate system all come from the geodatabase, and you write the title,
abstract, purpose, keywords and lineage.

**It offered me values it saw in the data, instead of just using them.** For
numbers, the measured range is filled in for you: that is a description of the
data. For text, the observed values are offered but not applied, because a field
holding four different names is not necessarily a controlled vocabulary. If it
is one, click the button and the values are added.

**My coordinate system is not in the list.** Choose **Other / not listed** and
describe it. Paste the well-known text from Pro layer properties so the
projection is unambiguous.

**It changed my dashes and quotation marks.** On purpose. Portal mangles em
dashes and curly quotes, so both artifacts use plain hyphens and straight
quotes. This is house style, not a bug.

**Can I edit the NPS disclaimer?** No. It has to appear word for word.

**The tool wrote my abstract. Is that allowed?** Yes, and it is the point. What
it writes is assembled from your answers about your data, the same way you would
write it yourself but faster and in consistent wording. Read it before you
download. If a sentence is not true of your data, fix it: the record carries
your name, not the tool's.

**A field definition says "suggested, review it".** The tool guessed that
definition from the field name. Common names such as OBSERVER or SURVEY_DATE
mean the same thing on most layers, so it offers wording to save you typing. Open
it, check it is true, and edit it so it says something the field name does not.
The flag clears as soon as you touch the text.

**Do I have to fill in every warning?** Warnings are suggestions and do not
block a download. Anything in red does block a compliant record.
