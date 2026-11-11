# Admin fonts

## Oswald

Oswald is a condensed sans serif by Vernon Adams, Kalapi Gajjar and Cyreal. The admin sign-out credits use it. It is self-hosted because the Content Security Policy only allows fonts from this site.

- File: `oswald-variable.woff2`, variable font with a weight axis from 200 to 700, 72,048 bytes
- Version: 4.103 (from the font's name table)
- Source: [Oswald in the Google Fonts repository](https://github.com/google/fonts/tree/main/ofl/oswald), file `Oswald[wght].ttf`, at google/fonts commit `8b0a1d0f5983c89bc2b93f1b5fb55f9e252744b5` (12 March 2026). Google Fonts builds it from [the Oswald upstream repository](https://github.com/googlefonts/OswaldFont) at commit `89795261ac9eeb9aa8cd99f43982c4e4b0e53261`.
- Conversion: TTF to WOFF2 with fontTools 4.51.0 (`TTFont.flavor = "woff2"`). No subsetting, so every glyph is kept (Latin, Latin Extended, Cyrillic and Vietnamese).
- Licence: SIL Open Font License 1.1. The full text is in `OFL-Oswald.txt`, copied unchanged from the source.

```css
@font-face {
  font-family: 'Oswald';
  src: url('/admin/fonts/oswald-variable.woff2') format('woff2');
  font-weight: 200 700;
  font-style: normal;
  font-display: swap;
}
```
