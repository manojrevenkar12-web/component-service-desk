# Working in component-service-desk

Fast feedback first: `npm test` runs the domain, model, reading, reply-check, golden, service (on PGlite, PostgreSQL in
WASM with pgvector), MCP and invariant tests in about half a minute. `cd web && npm test && npm run typecheck` for the
console. After any change to the desk, the world or the settings run

```bash
npm run evaluate && npm run bakeoff && npm run gate && npm run seed && npm run readme
```

and commit the regenerated `reports/`, `demo/seed.json` and `README.md`. CI fails when they disagree with the code.
After a change to the catalog in `src/world/catalog.ts` run `npm run export` first; after a change to the prompts or
the routes, `npm run golden` re-records the golden cases (check that they still say what they should).

## Layout

| path | what it is | may import |
|---|---|---|
| `src/desk` | reading, rules, retrieval, the workflow, the gateway, the reply check, the service, MCP | `src/wire.ts`, `src/catalog-shape.ts`, `src/config.ts` |
| `src/world` | the simulated maker: true catalog, customers, invoices, models, SAP, agents | `src/wire.ts`, `src/catalog-shape.ts`, `src/keyed.ts`, `src/config.ts` |
| `src/eval` | runs designs on the world, scores, reports, golden cases, README | everything |
| `web` | the console | the HTTP API |

## Invariants (checked in `tests/invariants.test.ts` and the tests)

1. **The truth stays in the world.** `src/desk` never imports `src/world` or `src/eval`. The demo seed holds what the
   desk received and decided.
2. **The world does not read the desk's settings.** `src/world` reads `config/world.json` and the published
   `knowledge/policy.json`, never `desk.json`, `designs.json`, `gate.json` or `service.json`.
3. **Same luck for every design.** Every random draw is keyed by what it is about (`src/keyed.ts`): the message, the
   task, the model, the attempt. Two designs that send the same request get the same answer.
4. **The model reads and code decides.** The reading prompt asks for quotes; the drafting prompt for wording. Code
   checks every quote against the text, resolves products, applies the rules, writes to SAP and checks the draft.
   Only the `no_rules` ablation and the `model_alone` design send the deciding prompts.
5. **Customer text is data.** Nothing in a message can change a rule, a decision or a write.
6. **Identifiers decide, names propose.** Article numbers and serials with a valid check digit name one product; a
   name proposes every product it fits, and the desk answers only when all of them give the same answer.
7. **Every SAP write once.** One idempotency key per serial; after a timeout the key is looked up before a retry.
8. **A person approves what cannot be undone.** Declined claims wait for review.
9. **Settings in config.** Models, routes, prices, thresholds and designs live in `config/`; the console's colours,
   sizes and durations in `web/src/shared/theme.css` and `tokens.ts`.
10. **Generated reports.** README numbers come from `reports/`; the README is written by `npm run readme`.

## The held-out rule

`config/heldout.json` is run once: `npm run lock` records a fingerprint of the desk (code, prompts, knowledge, settings)
in `config/heldout.lock`, then `npm run heldout` refuses any other desk and refuses to run twice. It writes
`reports/heldout.json`; findings go into `docs/heldout.md`. Fixes are made and measured on dev. The held-out seeds are
not run again and `config/gate.json` is not moved.
