# Game Loop

## Core loop

```
Open app → continue learning → finish a concept → earn XP →
see the graph expand → come back tomorrow
```

The daily challenge and spaced-repetition reviews reinforce this loop: there's always a
short, low-friction reason to return.

## Progression

XP (constants in `@toastcrumb/types`):

- Lesson complete: **+10** (`XP_PER_LESSON`)
- Quiz correct: **+5** (`XP_PER_CORRECT_QUIZ`)
- Level up every **100 XP** (`XP_PER_LEVEL`); `levelForXp()` is the single source of truth

Streak:

- +1 for each UTC day with at least one completed lesson, tracked via `lastActiveDate`

Spaced review:

- Concepts become due for review on an FSRS-6 schedule; reviewing keeps knowledge fresh
  without re-playing whole lessons

## Goals

- **Primary:** complete at least one concept per day
- **Secondary:** keep the streak alive

## Feedback

After each concept: show XP earned, reveal newly unlocked concepts, and expand the graph
visually.

## No punishment

- No hearts, no lives, no failure loops
- A wrong answer teaches; it never blocks progress
