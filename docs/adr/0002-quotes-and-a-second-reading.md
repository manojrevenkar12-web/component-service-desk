# 2. Quotes, and a second reading when the first has gaps

## Context
Models paraphrase while claiming to quote: "SM 24DP1..." for "SM24DP1...", an ISO date for "03.04.2025".

## Decision
Every extracted value carries the characters it came from. Code drops a quote that is not in the text, then checks
the reading against the message: an invoice attached but not read, a compatibility question with one part, a spare
part without an item, a claim without a product. Any gap sends the message to a second reading. Serials and dates
on an invoice are also found by pattern and check digit when exactly one is there.

## Consequences
A bad reading costs a second call, not a wrong answer. An invoice that has text but no single readable date and
serial goes to a person instead of asking the customer for a document they already sent.
