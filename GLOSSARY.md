# Combinotion

Joy for Books' book-operations context: titles are the operational spine, and inventory is an auditable history of how copies move.

## Language

### Catalog

**Title**:
The durable catalog identity of a book.
_Avoid_: Book record, SKU, listing

### Stock

**Quantity-on-hand**:
Physical copies currently held for a title.
_Avoid_: Stock, inventory count, on-hand balance

**Active reserved quantity**:
Copies of a title promised to active reservations.
_Avoid_: Holds, allocated stock, reserved on-hand

**Available-to-request**:
Copies that can still be reserved. Zero during a shortage.
_Avoid_: Availability, free stock, remaining

**Shortage**:
Quantity-on-hand below active reserved quantity.
_Avoid_: Oversell, stockout, negative availability

**Inventory movement**:
One auditable stock change for a title: opening balance, receipt, adjustment, donation, reservation, release, or reservation consumption.
_Avoid_: Ledger entry, transaction, event

**Opening balance**:
The first inventory movement for a title, taken from a physical count.
_Avoid_: Seed stock, initial inventory

**Receipt**:
Copies received onto quantity-on-hand.
_Avoid_: Restock, inbound

**Donation**:
Copies leaving quantity-on-hand, typically from a visit.
_Avoid_: Fulfillment, shipment, decrement

**Adjustment**:
A reasoned correction to quantity-on-hand.
_Avoid_: Edit, override, manual count

### Requests and visits

**School request**:
A school's claim for one or more titles, submitted without a staff account.
_Avoid_: Order, application, booking

**Reservation**:
One title line of a school request: a claim on copies.
_Avoid_: Hold, allocation, line item

**Reserve**:
A new claim on available-to-request copies.
_Avoid_: Allocate, hold, book

**Release**:
Dropping the remaining claim on a reservation.
_Avoid_: Cancel stock, unreserve, refund

**Reservation consumption**:
A visit donation fulfilling part or all of a reservation.
_Avoid_: Fulfillment, redemption, drawdown

**Restore**:
Putting consumed copies back on that reservation. Not a new claim.
_Avoid_: Reverse, undo, unconsume

**Visit donation**:
Copies given during a school visit, which reduce quantity-on-hand.
_Avoid_: Visit fulfillment, giveaway
