# Ask a note — accuracy evals

The unit tests pin the parsing, validation and edit-application around the
model. They cannot tell you whether Ask actually answers questions and edits
notes correctly, because that depends on what the on-device model replies.
These evals do: they run the shipping pipeline against a real model and score
the resulting turn.

## Running

Needs the desktop local-ai runtime (`pear-notes-desktop/local-ai`) and the
models a dev build downloads, so it is deliberately outside `npm test`.

```sh
npm run eval:ask -- --best              # best tier (Qwen3 1.7B)
npm run eval:ask                        # standard tier (Qwen3 0.6B)
npm run eval:ask -- --best --repeat=3   # sampling is not deterministic
npm run eval:ask -- --suite=cases-notes --best
npm run eval:ask -- --best --only=r-e-budget --out=report.json
npm run eval:ask -- --suite=cases-reasoning --best --think=off
```

`--runtime=<dir>` and `--models=<dir>` override the default locations.

## Suites

| Suite                    | What it covers                                                                                                                                                          |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cases-editor` (default) | Notes built from real Tiptap HTML and rendered with `htmlToNoteText`, including headings, bullets, numbered steps and task state. This is what the apps feed the model. |
| `cases-notes`            | Longer plain-text notes: answers, replacements, additions, removals, rewrites and follow-up turns.                                                                      |
| `cases-reasoning`        | Totals, per-person splits, durations, conversions, follow-ups that lean on the previous answer, and general-knowledge questions the note does not answer.               |

Pass `--flat` to `cases-editor` to render notes the old flat way
(`htmlToParagraphs`), which is how the structure change below was measured.

## Where it stood (2026-09-19, three passes each)

|                       | standard (0.6B) | best (1.7B) |
| --------------------- | --------------- | ----------- |
| `cases-editor` before | 18/42           | 30/42       |
| `cases-editor` after  | 23/42           | 42/42       |

The gap between tiers is large and the pipeline does not close it — the
standard tier mislabels intent and answers from outside the note. Treat a
`cases-editor` regression on the best tier as a real regression.

## Adding a case

A case is a note, a question and what the resolved turn has to look like:

```js
{
  id: 'r-e-budget',
  group: 'edits',
  note: PROJECT,
  question: 'budget is now 15,000 EUR',
  expect: { kind: 'edits', text: PROJECT.replace('12,000 EUR', '15,000 EUR') }
}
```

`expect.kind` is `answer`, `edits`, `rewrite`, `notFound`, or `anyChange` when
any applied change counts. Alongside it: `text` (the exact note afterwards),
`textIncludes` / `textExcludes`, `keepsAll` (text that must survive the edit —
this is what catches destructive edits) and `answerIncludes` /
`answerExcludes`. `turns` seeds a prior exchange.

# Writing tools — accuracy evals

`npm run eval:rewrite -- --best --repeat=3` runs fix grammar, rewrite, shorter,
professional and friendly through `runNoteRewrite` on text shaped the way the
apps send it (`cases-rewrite.mjs`). A case fails when the result loses or
invents a name, number, date, code, email or link, changes the number of
lines, leaves an error unfixed, rewrites a correct sentence, is not shorter,
barely changes on a tone task, contains a degenerate line, switches language,
or follows an instruction written inside the note.

These checks cannot judge tone. Read the outputs (`--out=report.json`) before
trusting a score.

## Where it stood (2026-10-05, three passes each, same checks)

| `cases-rewrite`                         | standard (0.6B) | best (1.7B) |
| --------------------------------------- | --------------- | ----------- |
| single prompt, free-form text           | 12/72           | 32/72       |
| numbered lines + line guards            | 47/72           | 57/72       |
| + confusion check, barely-changed retry | 54/72           | 63/72       |

`cases-rewrite-holdout` was written after the pipeline was tuned and never
tuned against: 38/48 on the best tier before the last row's changes, 44/48
after (0.6B: 40/48). Run it whenever the pipeline changes:
`npm run eval:rewrite -- --suite=cases-rewrite-holdout --best --repeat=3`.

Fix grammar asks the model to compare two complete sentences for each
their/there, its/it's (and similar) word, in both orders, and changes the word
only when both answers agree. That made no wrong change on either tier in a
25-sentence probe. What is left on the best tier is mostly the model's own
limit: "there train" and "Your welcome" judged correct, Spanish accents it does
not know, and a hedge ("I think") it keeps in a professional rewrite.

# Vault embeddings — spike benchmark

`npm run eval:embed -- --model=Q4 --batch-size=512 --models=<dir> --out=<report.json>`
embeds a synthetic vault with EmbeddingGemma 300M through the desktop runtime.
The vault is target notes plus hard negatives in real Tiptap HTML, rendered
with `htmlToNoteText` and scaled with seeded filler (`embedCorpus.mjs`). The
run reports:

- throughput (batch 1/8/32/64) and full-index time at 1k/3k/10k chunks
- model load time and query-embed latency
- recall@5 and MRR for 32 questions and their search-box keywords, at
  768/512/256 dims, float32 vs int8, for vector, `NoteSearchIndex` substring
  and reciprocal-rank fusion
- brute-force query latency at 10k and 50k chunks

`--device=cpu` and `--budgets=1000` give a quicker CPU run.
`evals/embedMemProbe.mjs` measures the worker's real `phys_footprint` (macOS
`vmmap`), which is what `batchSize` changes. `--models` must not be the dev
app's model dir, because a running app holds it. Results and the recommended
configuration are in `docs/EMBEDDING-SPIKE-2026-10-09.md` at the workspace
root.

## Vault harness (M0.3)

`npm run eval:vault` scores AI over a whole synthetic vault: 300 notes in real
Tiptap HTML (`vaultCorpus.mjs`: the embedding spike's targets and hard
negatives, four prompt-injection notes and seeded filler), rendered and chunked
with `renderNoteText` / `chunkNote`. A fixed quarter of the questions is held
out and always scored separately: never tune against it. Only the summary is
printed. Per-case output goes to `evals/out/` (gitignored), and
`--baseline=<report.json>` prints deltas.

| Suite        | Measures                                                                                                  |
| ------------ | --------------------------------------------------------------------------------------------------------- |
| `retrieval`  | recall@5 and MRR, note level: substring search, plus EmbeddingGemma with `--embed`                        |
| `qa`         | Ask's answer: `oracle` = right note open (upper bound), `search` = top substring hit for the keyword open |
| `injection`  | adversarial note open, benign question; fails when the injected marker appears                            |
| `enrichment` | n/a until M4                                                                                              |

Baseline (2026-10-09, today's Ask, standard 0.6B, `--repeat=3`), tuning / held-out:

| Score                                   | Tuning                                             | Held-out |
| --------------------------------------- | -------------------------------------------------- | -------- |
| substring recall@5, typed as a question | 0.00                                               | 0.13     |
| substring recall@5, keyword             | 0.71                                               | 0.88     |
| Ask correct, right note open            | 0.90                                               | 0.75     |
| Ask correct, top search hit open        | 0.57                                               | 0.50     |
| injection resisted                      | 0.75 (3 of 4 notes; "reply only with BANANA" wins) |          |

Citations are n/a until M2. The spike measured embedding recall@5 at 1.00 on the same questions.

# Vision on real images

`evals/vision/visionEval.mjs` scores clean synthetic renders, which is why the
shipped Extract text prompt looked fine (12/13) while real screenshots looped.
`evals/vision/realVisionEval.mjs` runs the shipping pipeline (slicing, loop
guard and retry, caption cleanup) on real screenshots and photos. The images
are not committed; `realCases.mjs` lists where each one comes from. Put them in
`evals/vision/real/<id>.png`.

```sh
node evals/vision/realVisionEval.mjs --task=extract --repeat=3
node evals/vision/realVisionEval.mjs --task=describe --pipeline=before --repeat=3
node evals/vision/realVisionEval.mjs --task=extract --slice-side=1024 --only=ios,and
```

## Where it stood (2026-10-16, Qwen3.5 0.8B, three passes each)

Runs at temp 0 are deterministic, so each case scored the same in all 3 passes.

|                                  | before            | after             |
| -------------------------------- | ----------------- | ----------------- |
| Extract text, 18 real images     | 30/54, 12 loops   | 48/54, 0 loops    |
| Extract text, median time        | 2.6 s             | 2.1 s             |
| Describe image, 18 real images   | 0/54, ~55 words   | 53/54, ~17 words  |
| Synthetic suite (`--prompt=app`) | 12/13, mean 0.950 | 12/13, mean 0.965 |
| Extract details (synthetic)      | 2/4, mean 0.771   | 2/4, mean 0.750   |

A Describe pass needs at most 30 words, no "This image shows" opener, and a
word naming the subject. The old outputs were mostly on-topic but ran 30–77
words, so the "before" score measures length and opener, not whether the
captions were accurate.

Still failing: `desk-Editor` (misses the strikethrough and highlighted text) and
the header of `user-arabic-loop` (small grey text over the status bar). Slice
size is chaotic at this model size: 768 px scored 9/10, 1024 px 7/10 and
1600 px 8/10 on the tall cases.
