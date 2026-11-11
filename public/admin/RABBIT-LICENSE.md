# Rabbit figure sources

## rabbit-1.png

- What it is: a photograph of a white-tailed jackrabbit (Lepus townsendii) in its winter coat, seen from the side in mid-leap. This is a photograph, not a silhouette.
- Source page: https://commons.wikimedia.org/wiki/File:White-Tailed_Jackrabbit_on_Seedskadee_National_Wildlife_Refuge_(25795217461).jpg
- Original file: https://upload.wikimedia.org/wikipedia/commons/1/12/White-Tailed_Jackrabbit_on_Seedskadee_National_Wildlife_Refuge_%2825795217461%29.jpg (3440 x 2283; the 1920-pixel Commons rendition was used)
- Author: USFWS Mountain-Prairie (U.S. Fish and Wildlife Service), Flickr photo 25795217461
- Licence as stated on the page: "Public domain" (a work of the U.S. Fish and Wildlife Service, a federal agency). Commons marks attribution as not required. A courtesy credit to "USFWS Mountain-Prairie" is still good practice.
- Date fetched: 2026-11-10
- Processing: cropped around the animal, then the blue sky was keyed out by a standard-library Python script. Background score = b - max(r, g): sky measured 64 to 85 and fur 3 to 39. Soft alpha ramps between 35 and 60. Only the connected region containing the hare is kept. The snow bank below the feet is removed along a straight cut line. Blue was taken out of the edge pixels (b capped at max(r, g) + 8). Then flipped horizontally with `sips -f horizontal` so the hare faces right, and resized with `sips -Z 512`. Final size: 512 x 434 RGBA.
- Edges: clean. Fur edges against the sky have soft alpha with no visible blue fringe. Known flaw: the lowest few pixels of the hind toes are clipped flat where the toes touched the snow.
