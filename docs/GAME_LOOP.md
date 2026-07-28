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

Daily anchor:

- The learner names a concrete cue time ("after my morning coffee" → 08:00), asked once on
  the reward screen after their **first** completed concept and editable on `/learn`. Stored
  as `User.reminderAnchorMinutes` / `reminderTimezone`.
- At most **one** emphasised nudge per local day, only after that time has passed, and only
  when reviews are genuinely due — the message states the real number of due concepts. A
  passive due-count line may show whenever work is actually waiting; when nothing is due,
  nothing is shown at all.
- The nudge never invokes the streak and never threatens a loss. A lapse simply leaves
  overdue reviews waiting — consistent with **No punishment** below. What the learner is
  invited to protect is real graph knowledge, never a farmable number.

## Goals

- **Primary:** complete at least one concept per day
- **Secondary:** keep the streak alive

## Feedback

After each concept: show XP earned, reveal newly unlocked concepts, and expand the graph
visually.

## No punishment

- No hearts, no lives, no failure loops
- A wrong answer teaches; it never blocks progress
