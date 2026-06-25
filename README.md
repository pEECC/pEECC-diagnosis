# Emergency Care Facility Diagnostic Tool — v5 single-file

This version is intentionally self-contained: all EECC and LCC question data are embedded in `index.html`.

This avoids the previous problem where the page headings loaded but the EECC tables did not render because the browser/GitHub page could not load separate JSON files.

Upload/replace `index.html` in the GitHub repository root. The older `app.js`, `style.css`, and `data/` files can remain, because this version does not depend on them.
