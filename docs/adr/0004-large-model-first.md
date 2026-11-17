# 4. The large model first

## Context
The intuition is to read with the small model and escalate. The bake-off measured three routings on the dev seeds.

## Decision
Large model first, small as fallback, for reading and drafting.

## Consequences
The large model costs 0.25 ct per ticket against 0.05 ct for small-first, and the total cost per ticket falls from
€0.53 to €0.42: fewer second readings, fewer drafts the check stops, fewer tickets for a person, whose minute costs
€0.75. The decision is re-made with `npm run bakeoff` whenever prices or models change.
