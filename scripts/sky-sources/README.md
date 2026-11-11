# Sky sources

Inputs for `scripts/build-sky-figures.mjs`, which writes `public/admin/sky/figures.json` for the admin dashboard's zodiac sky. They are kept here so the output can be rebuilt and checked from the repository alone:

```
node scripts/build-sky-figures.mjs          # rebuild
node scripts/build-sky-figures.mjs --check  # fail if the committed output is stale
```

| File | Source | Licence |
|---|---|---|
| `lines.json` | `constellations.lines.json` from [d3-celestial](https://github.com/ofrohn/d3-celestial) by Olaf Frohn: constellation stick figures as GeoJSON MultiLineStrings of [RA, Dec] in degrees, RA in -180 to 180 | BSD 3-clause |
| `names.json` | `constellations.json` from [d3-celestial](https://github.com/ofrohn/d3-celestial): constellation ids and names | BSD 3-clause |
| `stars.js` | The Yale Bright Star Catalogue, derived from d3-celestial's `stars.6.json` (stars to magnitude 6.5) and flattened to `window.STARS=[[ra, dec, mag, bv], ...]`, RA in 0 to 360 | Public domain (catalogue data) |
| `manifest.json` | Produced in this project: for each Sidney Hall drawing (Urania's Mirror, 1824, public domain), the image size and the pixel positions of two to five reference stars with their RA and Dec, used to register the drawing to the star pattern | This project |

d3-celestial is Copyright (c) 2015, Olaf Frohn, under the BSD 3-clause licence. Redistribution of its data files requires keeping its copyright notice, conditions and disclaimer; the full text is in `LICENSE-d3-celestial.txt` beside this file, and the dashboard credits the project.

Only the figure geometry, magnitudes and drawing fits derived from these files ship to the browser; the catalogue itself does not.
