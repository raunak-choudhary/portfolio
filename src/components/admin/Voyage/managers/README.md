# Voyage managers: the schema contract

A voyage chapter edits a table through a schema: one plain object in
`<table>.schema.js`, registered in `index.js`. The deck, the record dialog,
the read view and the records service read nothing else, so a new section is
one schema file plus its tests. The pure helpers live in `schemaModel.js`.

## Schema keys

| Key | Required | Meaning |
|---|---|---|
| `table` | yes | Supabase table name; also the registry key. |
| `singular`, `plural` | yes | Words used in buttons, counts and sentences ("New skill", "3 skills"). |
| `titleKey` | yes | Column shown as the dialog title. |
| `fields` | yes | Field list, see below. |
| `groups` | yes | `[{ label, keys }]`: fieldsets of the form and sections of the read view. Every field belongs to one group. |
| `card` | yes | `row => ({ title, subtitle, chips, image, flags })`. Flags: `starred`, `featured`, `award`, `current`, `expired`, `hidden`. |
| `searchText` | yes | `row => string` (lower case) used by the deck search from nine records. |
| `mode` | no | `'singleton'` for one-row tables (hero, about): a read panel with Edit, no deck, no delete, no reorder. All rows are loaded and `pickSingleton` prefers the active one, then the latest, so a save never inserts a second row. |
| `orderKey` | no | Order column. Only a flat deck with an `orderKey` gets drag to reorder; a drag rewrites the whole column. When the order column is also a form field, a new record keeps a typed value; an empty one takes the next number after the others. |
| `orderDirection` | no | `'desc'` (default, highest first) or `'asc'`. |
| `sort` | no | `rows => rows` for tables without an order column, or with a custom order (skills: featured, order number, name). |
| `group` | no | `{ key, priorityKey, emptyLabel, defaultPriority }`: a grouped deck. Groups sort by priority, then name; Up and Down renumber every group 1..n and write only the changed ones. A new record, or one moved to another group, takes its group's priority. |
| `cardStyle` | no | `'compact'` for long lists (small icon, no media band). |
| `cardImage` | no | `'logo'` shows the card image whole (logos, badges) instead of cropping it to the band. |
| `visibility` | no | `[{ key, publicValues, fallback? }]`: every rule must hold for the row to be public; a card that fails one gets the `hidden` flag. |
| `cleanup` | no | `[{ key, bucket }]`: columns holding file URLs to remove from storage after the row is deleted (only URLs inside that public bucket; storage errors never undo the delete). |
| `images` | no | Legacy image-list uploader for the projects schema. |
| `dateOrder` | no | `[{ start, end, strict?, unless? }]`: end after (strict) or not before the start, skipped while the `unless` toggle is on. |
| `rules` | no | `form => ({ [key]: sentence })`: cross-field checks run after the field checks; a field's own error wins. |
| `linkFor` | no | `row => url` for a public link from the read view. |

## Field keys

Common: `key`, `label`, `kind`, `required`, `help`, `placeholder`, `default`.

| Kind | Stored as | Extra keys |
|---|---|---|
| `text`, `textarea` | string | `min`, `max` (characters), `rows` |
| `numeric` | string kept as typed (GPA "3.50") | `min`, `max` (value) |
| `number` | number or null | `min`, `max`, `integer` |
| `rating` | whole number 1..max or null | `max` (default 5) |
| `toggle` | boolean | `clears` (key or keys emptied when switched on) |
| `select` | string or null | `options [{value,label}]`, `allowEmpty`, `emptyLabel`, `tolerateUnknown` (a stored value outside the list stays valid), `ignoreCase` (a stored value that differs from an option only in case loads as that option; it is saved in the option's spelling once the owner changes that field, see "What a save writes"), `max` |
| `url` | string or null | `loose` (bare domains saved with https://), `pattern`, `patternMessage`, `max` |
| `link` | string or null | web address, `/path` or `#anchor`; `max` |
| `date` | `YYYY-MM-DD` or null | `min`, `max` (a date or `'today'`), `disabledWhen` (toggle key; the date clears and saves null), `disabledHelp` |
| `tags`, `urls` | string array | `max` (entries), `itemMax`, `editable` (inline editing, refuses blanks and repeats), `suggestions`, `nullWhenEmpty` |
| `images` | URL array | uploads through `schema.images` |
| `image`, `file` | URL or null | `upload` |
| `files` | array of URLs and, with `allowText`, typed names | `upload`, `allowText`, `max`, `itemMax` (typed names only), `nullWhenEmpty` |
| `pairs` | `[{ key, value, order_index }]` (a legacy object still loads) | `max`, `keyMax`, `valueMax`; labels must be unique; the value is a one-line textarea that grows with its text (Enter and newlines are refused) |
| `derived` | computed on save, read-only | `compute(form)` |

`upload` is `{ bucket, accept, typesLabel, maxBytes, maxCount, perBatch, removeReplaced, path }`.
`path({ id, form, file, index, stamp, ext })` returns the object path inside the bucket.
Uploads need a saved record: a new record shows "Save the x once, then add ...".
Each upload writes only its own column at once. With `removeReplaced`, a replaced or
removed file leaves storage after the row stops pointing at it. Keep `maxBytes`
within the bucket's own cap (organization-logos is 2 MiB).

Shared pieces for list sections live in `sectionKit.js`: the status field and its
visibility rule, logo and image upload presets, the public-page sort comparators
(`orderThenDate`, `featuredFirst`, `newestBy`), and card text helpers
(`monthYear`, `dateRange`, `isPast`, `joinSet`, `firstOf`, `searchOf`).

## Behaviour every kind gets

An empty value (`emptyValue`), validation with fixed sentences (`validateForm`),
normalisation for the write (`normalizeForm`), a dirty check against the saved
row (`isDirty`), a labelled control with counter, `aria-invalid` and
`aria-describedby` (`Field.js`), and a read rendering (`RecordView.js`).

## What a save writes

A new record writes every field. An update writes only the columns whose
normalised value differs from the saved row (`changedColumns`), plus any
column the deck adds (a group's priority). A field's `default` therefore only
fills the form for a new record or shows in place of an empty column; it is
never written to an existing row the owner did not change.

One more case is written: a field the owner changed during this editing
session whose stored value is not what the form now holds, even when the form
shows the same thing it showed at the start. Switching Visibility away and
back to "Public" on a row whose status is null writes "active"; doing the same
on an `ignoreCase` select writes the option's own spelling over "completed";
retyping a bare domain writes its `https://` form. Merely opening or tabbing
through a field is not a change, and choosing the option a select already
shows fires no change at all, so a displayed default is stored only once the
owner has actually moved that field. It travels with the next save that has
something else to write as well, because Save is enabled by a real difference.

"Overwrite" after a conflict writes every field, because the owner chose to
put this version over the other one, with one exception: file columns (image,
images, file, files) are left out unless the form changed them. Those columns
are written the moment a file is added or removed, so the form's copy can only
be stale; writing it would re-list files removed elsewhere and drop new ones.

File actions (upload, replace, remove) write their one column at once, built
from the saved row's list, so entries typed into a mixed list stay unsaved
edits. In a mixed list only a URL inside the field's bucket (`isBucketUrl`) is
treated as a stored file. When that write fails, the uploaded files leave
storage again only after the row has been read back and does not name them: a
write can commit and lose its answer, and a file the row lists is never
removed. If the row cannot be read, nothing is removed.

## Adding a section

1. Write `<table>.schema.js` with every column the admin data spec lists.
2. Register it in `index.js`; the chapter with that table picks it up.
3. Add a test that round-trips a live-shaped row (`buildForm`, `validateForm`
   gives `{}`, `isDirty` is false) and checks the limits, card and upload paths.
   The list sections load every recorded live row from `e2e/fixtures/` in
   `listSchemas.test.js`; add a new table there.
