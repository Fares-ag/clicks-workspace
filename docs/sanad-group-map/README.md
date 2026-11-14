# Sanad group footprint — interactive site

Live: **https://expansion.clicks.qa** (`?lang=ar` for Arabic).  
Until DNS is pointed: https://clicks-expansion.vercel.app

Deploy from this folder: `npx vercel --prod --yes`

DNS at the `clicks.qa` registrar (Tasjeel): **CNAME** `expansion` → `d4f4e98af0178bf9.vercel-dns-017.com`  
(same pattern as `admin` and `finance`). Then `npx vercel domains verify expansion.clicks.qa`.

Open `index.html` in a browser (needs internet once, to load the map outlines).

```powershell
cd docs/sanad-group-map
python -m http.server 8765
```

Then visit:

- English: http://127.0.0.1:8765/?lang=en
- Arabic: http://127.0.0.1:8765/?lang=ar

Click a country, city, or row in the left list. Drag to pan, use + / − to zoom.

Static images for decks: `sanad-group-map.png` and `sanad-group-map-ar.png`.
