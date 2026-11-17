# 3. One return order per serial

## Context
SAP commits some orders and then times out. Customers chase ("where is my replacement?") and resend claims through
the form and by mail. The model alone made 33 duplicate orders on dev; agents 7.

## Decision
The idempotency key is the serial. Before creating, the desk looks the key up; after a timeout it looks again before
retrying. A conversation remembers its order, so a follow-up gets the status, not a new order. In the service the
key is the primary key of `sap_orders`.

## Consequences
Zero duplicates on dev with 5% ghost timeouts. A second, genuinely new defect on the same unit while an order is open
gets the open order's status; a person reopens it if needed.
