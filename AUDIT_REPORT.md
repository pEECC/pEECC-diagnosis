# Audit report — v5 single-file

## Why this version exists
The previous version could load the static page headings while failing to render the actual EECC tables. The likely cause was reliance on separate JavaScript/JSON files or incorrect GitHub upload paths. This version embeds all data, CSS, and JavaScript directly into `index.html`.

## Content counts rendered in test harness
- EECC facility profile fields: 16/16
- EECC facility availability rows: 34/34
- EECC ward profile fields: 8/8
- EECC ward readiness rows: 35/35
- LCC diagnostic items: 7/7
- LCC anchors: 7/7 items have 1–5 anchors

## Scoring tests passed
- Facility availability all-yes test: 25/25 = 100%
- Ward readiness all-ready test: 28/28 = 100%
- Ward readiness with oxytocin marked not relevant: 27/27 = 100%
- LCC all-5 test: mean score = 5.0

## Technical change
- No separate `data/` folder required.
- No separate `app.js` required.
- No separate `style.css` required.
- Uploading only `index.html` is sufficient.
