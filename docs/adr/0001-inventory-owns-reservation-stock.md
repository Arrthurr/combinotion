# 0001. Inventory owns reservation stock changes

## Status

Accepted

## Context

A reservation is three writes: the reservation row, an inventory movement, and the title caches (quantity-on-hand and active reserved quantity). `appendInventoryMovement` already kept movement and caches together. Callers still inserted or patched the row themselves, so a reservation could diverge from the ledger.

`reserve` in `lib/domain/requests.ts` encoded availability policy that production writes did not call. Visit undo of a consumption had to reverse a movement and patch the row. A donation may legally leave a title in shortage; restoring that reservation is putting copies back, not claiming new ones.

## Decision

Reservation kinds exist only on `reserve`, `release`, `consume`, and `restore` in the inventory module. `append` and `reverse` refuse them.

`reserve` always refuses when copies are not available-to-request. `restore` does not: shortage is a real state, and restore is not a new claim.

Callers pass `sourceId`. The paired row and movement no-op when that id already exists. Title caches stay; only inventory patches them after create's zeros.

## Consequences

School-request submit, cancel/decline, visit consume/restore, and Notion `verifiedActive` go through this interface. Tests cover those operations through inventory, not through unused reducers.
