# Content System

This describes the **shape and rules** of learning content — enough to read a
`content/concepts/*.json` file or author one. It is the data model; how content is
generated is out of scope here.

The canonical types live in `@toastcrumb/types` (`Concept`, `Lesson`, `Card`).

## Core unit: Concept

Everything revolves around a **concept** — e.g. Cache, Load Balancing, DNS, TLS. One JSON
file per concept in `content/concepts/<id>.json`.

A `Concept` has:

- `id` — stable slug (also the key all user state is stored against)
- `title`, `description`
- `difficulty` — 1–5
- `domain` — the track it belongs to (e.g. `"networking"`, `"caching"`)
- `prerequisites[]` — concept ids to learn first
- `next[]` — recommended next concepts (the graph's forward edges)
- `contexts[]` — real-world scenarios the concept is grounded in
- `lessons[]`

## Lessons and cards

A `Lesson` is an ordered sequence of **cards** (`Card[]`) plus `type`
(`scenario` | `quiz` | `mixed`), `xpReward`, and `orderIndex`. A concept may carry several
lesson variants over the same material.

Card types (`CardType`):

| Type | Role |
|---|---|
| `context` | a real-world situation (always the first card) |
| `tension` | the problem |
| `insight` | the concept reveal |
| `model` | a mental model — diagram / analogy |
| `misconception` | a confident wrong belief, always followed by an `insight` |
| `dialogue` | a short back-and-forth |
| `quiz` | a multiple-choice question |
| `reward` | the payoff (always the last card) |
| `stat` `compare` `flow` `diagram` `chart` | visual cards, rendered as components |

A lesson opens with `context` and ends with `reward`; in between it interleaves exposition,
visuals, and quizzes. Typical length is 8–12 cards.

### Quiz features

A `quiz` card has `question`, `options[]`, `correctIndex`, and an optional `explanation`.
Three optional markers refine it:

- **`pretest: true`** — a prediction the learner commits to *before* the concept is taught
  (guessing wrong is expected; the following exposition lands harder). A pretest renders and
  is answerable but is **excluded from all scoring** — no XP, no spaced-review grade, never
  in the daily pool. Its `explanation` is the corrective feedback.
- **`contrast: true`** — a question that pits two named cases side by side and asks which
  behaves differently and *why* (driving transfer). Unlike a pretest it **scores normally**;
  its `question` must name both cases inline so it stands alone in review and the daily.
- **`optionExplanations[]`** — index-aligned to `options`; for a wrong option it names the
  specific misconception a learner picking it holds. When present its length must equal
  `options.length`. Purely additive — it never changes scoring.

## Authoring rules

- Aim for 8–12 cards per lesson; go beyond only when a concept genuinely needs it, and never
  exceed the hard max (16).
- Keep every card to 1–2 short sentences; no paragraph longer than 2–3 lines. See
  **Length budget** below for the numbers.
- Always open with context, never a definition.
- Every lesson includes at least one `quiz` card.
- Show ideas visually by default — most lessons include ≥2 visual cards, usually a diagram
  or chart, unless a visual genuinely doesn't fit.
- Every quiz is interrogative and effortful: no yes/no questions, no "What is X?"
  definition-recognition — ask what happens, which one wins, or why.

## Length budget (Epic 10)

A lesson must be finishable in **under 60 seconds** — the core-loop promise the product is
built on. That translates to roughly **250 words (1500 characters)** of reading for the whole
lesson, and it is the binding constraint on lesson text: card *counts* were never the problem,
words per card were.

| Gate | Constant | Value | Applies to |
|---|---|---|---|
| Whole lesson | `MAX_LESSON_CHARS` | `1500` (~250 words) | Every card's `body` + `headline`, every quiz's `question` + `options` + `explanation`, and visual-card prose (labels, points, step details, node/edge captions) |
| Non-quiz card body | `MAX_BODY_CHARS` | `220` (~35 words) | One card's `body` |
| Quiz card | `MAX_QUIZ_CARD_CHARS` | `300` (~50 words) | `question` + `options` + `explanation` summed |
| Pretest card | `MAX_PRETEST_QUIZ_CARD_CHARS` | `200` (~33 words) | Same fields on a `"pretest": true` quiz |
| Per-distractor rationale | `MAX_OPTION_EXPLANATION_CHARS` | `200` (~33 words) | One non-empty `optionExplanations` entry |

Four things about it are easy to get wrong:

- **The lesson total is what binds.** The per-card ceilings are headroom for the occasional
  longer card, not targets — 220 × 8 cards is already over budget. At 8–12 cards the working
  average is ~18–25 words per card.
- **`optionExplanations` are excluded from the lesson total**, and deliberately so: they are
  read one at a time after answering, not as part of the linear read, and counting them made
  pretest-first lessons arithmetically impossible. They are still fenced per entry — excluded
  from the total is not unmeasured. Never shorten them to make room for prose.
- **Measurement is on *rendered* text.** A `[[term|definition]]` gloss counts only as `term`;
  the definition is tap-to-reveal and capped separately (`MAX_ANNOTATION_WORDS`). Keep
  annotating every technical term — glosses are free against this budget.
- **The budget is words per card, never cards per lesson.** Meeting it by deleting a card, a
  quiz, or a distractor rationale is a regression, not a fix.

A pretest gets the tighter quiz ceiling because the `insight` card immediately after it does
the teaching; a checking quiz's `explanation` has to stand on its own.

The gates live in `scripts/lib/content-rules.ts` (dev tooling) rather than `@toastcrumb/types`,
because nothing outside `scripts/` reads a length gate. They surface as advisory warnings in
`pnpm content:validate`, and `pnpm content:validate --strict-length` promotes them to errors.

Enforcement is **staged**: the checks ship advisory first and `--strict-length` is wired into CI
only once the whole library fits. That ordering is load-bearing, not timidity — turning them
hard while lessons are still being shortened would fail CI on every concept in the repo. Until
then the flag is a local command; run it before committing regenerated content.

Enforcement sits at the validator rather than in the selector's hard-reject path, so an
over-long generated lesson gets regenerated instead of silently dropped from selection.

## Machine-enforced rules

These are validated against constants exported from `@toastcrumb/types` — the single source
of truth for each rule:

| Rule | Constant | Value |
|---|---|---|
| Hard max cards per lesson | `MAX_CARDS_PER_LESSON` | `16` |
| First card must be `"context"` | `FIRST_CARD_TYPE` | `"context"` |
| Every lesson needs ≥1 `"quiz"` card | `REQUIRED_CARD_TYPES` | `["quiz"]` |
| Every concept needs ≥1 lesson | `MIN_LESSONS_PER_CONCEPT` | `1` |

The length budget above is enforced from `scripts/lib/content-rules.ts` instead of
`@toastcrumb/types`, under `pnpm content:validate --strict-length`.

## Content style

**Use:** real companies (Netflix, Cloudflare, Stripe), real systems (Redis, DNS, TLS),
simple diagrams, concrete analogies.

**Avoid:** academic definitions, long explanations, abstract-only learning.

Density beats completeness: pick the single strongest detail, number, or example per card and
cut the rest. A `reward` card in particular should do **one** job — connect to the reader's
life, or add a surprising detail, or end shareably — not all three.
