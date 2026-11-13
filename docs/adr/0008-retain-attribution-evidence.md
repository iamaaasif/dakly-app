# 0008: Retain individual evidence for attribution rebuilds

- Status: proposed
- Date: 2026-11-13

## Context

Feature 11 allows the owner to change the attribution window and rebuild the last 365 days. ADR 0006 keeps the selected attribution on an order and removes a general contact-touch table. Selected attribution, daily aggregates and the first/last tap on a link cannot reconstruct an intermediate visit or an older uncredited touch. Purging workflow steps after 90 days loses evidence before the promised rebuild horizon.

## Decision

Keep the order's selected attribution and the existing campaign/workflow send evidence. Add `tracked_link_visits` as the narrow exception to ADR 0006: each redirect visit records its tracked link, occurrence time and opaque event key. It does not store an IP address, user agent or an additional contact profile. Retried persistence reuses the visit's event key; a later intentional visit gets a new key.

Retain attribution evidence for at least 372 days: the 365-day rebuild horizon plus the maximum seven-day lookback. Workflow step retention starts when the run finishes, never while it is active. Retain link and source evidence until their latest relevant visit/completion also passes the horizon. Customer erasure takes precedence and removes identifying evidence; anonymous aggregate reporting may remain.

Daily metrics refresh from affected outbox events within five minutes, with nightly reconciliation. Late returns and corrections recompute affected historical metric days under ANA-1's definitions. This updates the nightly-only assumption in ADR 0006 without adding a general touch-event subsystem.

Legacy migration backfills known first and last distinct tap times using deterministic legacy event keys. Intermediate historical visits were never recorded and cannot be recovered. Preserve existing attribution for legacy periods with incomplete evidence; exact reconstruction covers evidence collected under this contract as the retained history grows.

## Consequences

Attribution rebuilds can inspect every newly recorded and retained eligible tap, including repeated taps between orders. They cannot claim exact coverage for earlier periods that stored only first/last taps. The extra rows have store isolation, a permanent per-store event key and a time index for bounded processing. Their storage and purge cost must be measured with realistic traffic. The schema establishes storage and keys; redirect persistence, rebuild workers, provider eligibility and five-minute refresh remain planned implementation work and require tests before release.
