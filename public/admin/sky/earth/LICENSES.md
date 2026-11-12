# Licences for the Earth and Moon maps

Textures for the voyage's opening scene (the Earth with its city lights, the Moon in orbit). All are NASA products and in the public domain in the United States; NASA asks to be credited. Each file here is a derived work: resized with macOS `sips` where noted and encoded to WebP with `cwebp`. Nothing is cropped; the equirectangular layout (longitude -180 to 180 left to right, latitude 90 to -90 top to bottom) is unchanged.

| File | What it is | Source | Credit |
| --- | --- | --- | --- |
| `earth-day.webp` (2048 x 1024) | Blue Marble Next Generation, land and ocean colour, resized from the 3840 px Wikimedia Commons rendition of NASA Visible Earth's image | NASA Visible Earth, via Wikimedia Commons (fetched 2026-11-10 for the Earth-from-orbit preview) | NASA Earth Observatory / Visible Earth |
| `earth-night.webp` (2048 x 1024) | Earth at night, city lights (Suomi NPP VIIRS composite), from the three.js planet-texture set which mirrors NASA's map at web size | https://github.com/mrdoob/three.js/tree/dev/examples/textures/planets (`earth_lights_2048.png`) | NASA Earth Observatory / NOAA NGDC |
| `earth-clouds.webp` (1024 x 512, alpha) | Cloud cover map, from the same three.js set | same (`earth_clouds_1024.png`) | NASA Earth Observatory |
| `moon-color.webp` (2048 x 1024) | CGI Moon Kit colour map built from Lunar Reconnaissance Orbiter Camera data, 2K JPEG | https://svs.gsfc.nasa.gov/4720 (`lroc_color_2k.jpg`, fetched 2026-11-12) | NASA's Scientific Visualization Studio |

The three.js repository is MIT licensed; the images in it are NASA products and carry no copyright. The Sun, Earth's axial tilt and the Moon's phase in the scene are computed, not drawn, so no further imagery is involved.

## Credit line for the dashboard footer

Earth and Moon maps: NASA Earth Observatory / Visible Earth, NASA's Scientific Visualization Studio (LRO). Public domain.
