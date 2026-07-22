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
- No paragraph longer than 2–3 lines.
- Always open with context, never a definition.
- Every lesson includes at least one `quiz` card.
- Show ideas visually by default — most lessons include ≥2 visual cards, usually a diagram
  or chart, unless a visual genuinely doesn't fit.
- Every quiz is interrogative and effortful: no yes/no questions, no "What is X?"
  definition-recognition — ask what happens, which one wins, or why.

## Machine-enforced rules

These are validated against constants exported from `@toastcrumb/types` — the single source
of truth for each rule:

| Rule | Constant | Value |
|---|---|---|
| Hard max cards per lesson | `MAX_CARDS_PER_LESSON` | `16` |
| First card must be `"context"` | `FIRST_CARD_TYPE` | `"context"` |
| Every lesson needs ≥1 `"quiz"` card | `REQUIRED_CARD_TYPES` | `["quiz"]` |
| Every concept needs ≥1 lesson | `MIN_LESSONS_PER_CONCEPT` | `1` |

## Content style

**Use:** real companies (Netflix, Cloudflare, Stripe), real systems (Redis, DNS, TLS),
simple diagrams, concrete analogies.

**Avoid:** academic definitions, long explanations, abstract-only learning.
