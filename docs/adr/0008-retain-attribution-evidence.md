# 0008: Retain individual evidence for attribution rebuilds

- Status: accepted (lean form, D31)
- Date: 2026-11-13

## Context

Feature 11 allows the owner to change the attribution window and rebuild the last 365 days. ADR 0006 keeps the selected attribution on an order and removes a general contact-touch table. Selected attribution, daily aggregates and the first/last tap on a link cannot reconstruct an intermediate visit or an older uncredited touch. Purging workflow steps after 90 days loses evidence before the promised rebuild horizon.

## Decision

Keep the order's selected attribution and the existing campaign/workflow send evidence. Add `tracked_link_visits` as the narrow exception to ADR 0006: each redirect visit records its tracked link, occurrence time and opaque event key. It does not store an IP address, user agent or an additional contact profile. Retried persistence reuses the visit's event key; a later intentional visit gets a new key.

Retain attribution evidence for at least 372 days: the 365-day rebuild horizon plus the maximum seven-day lookback. Workflow step retention starts when the run finishes, never while it is active. Retain link and source evidence until their latest relevant visit/completion also passes the horizon. Customer erasure takes precedence and removes identifying evidence; anonymous aggregate reporting may remain.

Daily metrics refresh from affected outbox events within five minutes, with nightly reconciliation. Late returns and corrections recompute affected historical metric days under ANA-1's definitions. This updates the nightly-only assumption in ADR 0006 without adding a general touch-event subsystem.

Lean form, accepted with D31. A visit also stores `visitor_hash`, an HMAC of the IP address and user agent under a key that rotates daily, used only to count unique visitors for that day; the raw values are never stored. `tracked_link_visits` is partitioned by month on `occurred_at` and keeps 13 months of exact tap times, which covers the 372-day horizon. Each finished day is also rolled into `tracked_link_visit_days` (visits, unique visitors, first and last tap time per link), kept while the link exists, for reports older than 13 months. A month of raw taps is dropped only after the rollup watermark has passed it. See [growth.md](../data/growth.md#link-visits-without-personal-data).

## Consequences

Attribution rebuilds see every tap with its exact time across the whole 365-day horizon, so they pick the same link a live attribution would. The extra rows have store isolation, a permanent per-store event key and a time index for bounded processing. Expiry drops a whole month, so purging costs nothing per row; about 2.4 GB at 1,000 stores. The schema establishes storage and keys; redirect persistence, rebuild workers, provider eligibility and five-minute refresh remain planned implementation work and require tests before release.
