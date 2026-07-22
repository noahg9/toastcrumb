# Content

Static, pre-generated learning content. **Content lives here as JSON, never in the
database** — the app reads these files at build/runtime; the database stores only dynamic
user state.

This repo ships a small **sample set** (the caching cluster). The full library that powers
the hosted product is maintained separately.

## Layout

```
content/
└── concepts/
    └── <concept-id>.json   # one Concept per file (see @toastcrumb/types)
```

## Rules

Each file is one `Concept` and matches the `Concept` type in `packages/types`; the
machine-enforced rules below are backed by constants exported from `@toastcrumb/types`:

- Each file is one `Concept` and matches the `Concept` type in `packages/types`.
- Aim for 8–12 cards per lesson; hard max `MAX_CARDS_PER_LESSON` (16) — go higher only when a concept genuinely has more to cover. No paragraph > 2-3 lines.
- Always open with context, never a definition — the first card must be `"context"` (`FIRST_CARD_TYPE`).
- Every lesson includes at least one interaction: a `"quiz"` card (`REQUIRED_CARD_TYPES`).
- Every concept has at least one lesson (`MIN_LESSONS_PER_CONCEPT`).

Content is authored offline, validated against these rules, and committed as approved JSON.
There is no live AI generation in the running application.

## License

The content in this directory is licensed under [CC BY-NC 4.0](LICENSE), separately from the
code in this repository. See [`LICENSE`](LICENSE).
