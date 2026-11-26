# Orders export design check

The Orders pipeline shows Export beside New order for staff who can view orders and download lists. The menu offers CSV and Excel (.xlsx). Feedback reports the downloaded row count or the download error.

The [orders export browser spec](../../../../apps/web/e2e/orders-export.spec.ts) opens the menu with the keyboard at 1440 × 900 and 360 × 800, checks for horizontal overflow, and downloads both formats from a filtered pipeline. It checks the CSV row against the saved order line. The screenshots are written to this folder and to the browser run's artifacts.
