# Repeatable tasks

## Add a product or change a spec
1. Edit the true catalog in `src/world/catalog.ts` (and `pimExport` if the PIM should get it wrong).
2. `npm run export` writes `knowledge/pim.json` and `knowledge/parts.json`.
3. Add a rule test in `tests/domain.test.ts` if a rule now sees a new case.
4. `npm run evaluate && npm run bakeoff && npm run gate && npm run seed && npm run readme`.

## Add a compatibility rule
1. Write it in `src/desk/domain/compat.ts`, recording the PIM fields it reads as facts.
2. Write the world's own reading in `src/world/truth.ts`, apart from the desk's code.
3. Test it in `tests/domain.test.ts`, then regenerate as above.

## Add a help article
1. `knowledge/kb/<id>.md` with a title and a one-line summary in each of de, en, fr, pl.
2. If customers should ask about it, add a symptom to `src/world/phrases.ts`.
3. Check that a clear description puts it first in both retrievers (`tests/llm.test.ts`).

## Change a prompt or a route
1. Edit `prompts/*.md` or `config/desk.json`.
2. `npm run golden` re-records the golden cases; read the diff of `evals/golden.json`.
3. `npm run bakeoff` if the change is about which model reads or writes.

## Point the desk at real models
1. Set `OPENAI_BASE_URL` and `OPENAI_API_KEY` (any OpenAI-compatible endpoint: OpenAI, Azure OpenAI, a LiteLLM proxy
   in front of Anthropic) and the model names and prices in `config/desk.json`.
2. Run the golden cases against them by re-recording on a copy, and compare the resolutions before switching.

## Run the held-out seeds
Once, at the end: `npm run lock && npm run heldout`, then write `docs/heldout.md` and `npm run readme`.
