# Gym-ordsky – design spec

Date: 2026-09-25
Context: Forskernatt stand at NTNU about Physical Education (kroppsøving/gym) in Norway.

## Purpose

Visitors to the stand reflect on how they perceive PE by answering two questions
with one word each. All answers are shown live as two animated word clouds on a
big monitor. Success = a visitor can answer in under ~15 seconds without help,
the clouds are readable from a few metres away, and the stand staff can remove
inappropriate words and export the answers afterwards.

## Constraints

- One shared device at the stand (keyboard + big monitor). No phones, no login.
- No backend. Answers persist in the browser via `localStorage`.
- Static files only; publishable as-is on GitHub Pages.
- Must work offline once loaded (no CDN, fonts bundled locally).
- Norwegian UI text; must handle æ/ø/å correctly.
- Single ~5-hour session: no reset feature, no profanity filter.

## Files

| File | Responsibility |
|------|----------------|
| `index.html` | Page markup |
| `config.js` | Editable settings: title, the two questions, colours |
| `style.css` | Visual design ("gymsal" theme) |
| `cloud.js` | Word-cloud layout + animation. Input: `[{word, count}]` + container. No knowledge of storage or form. |
| `store.js` | Load/save responses in `localStorage`, word counting, delete word, CSV building |
| `app.js` | Wires form flow, clouds, admin panel |
| `fonts/` | Locally bundled display font (woff2) |
| `tests/` | Browser-runnable tests for `store.js` and `cloud.js` layout (`tests/index.html`) |

## Behaviour

### Answer flow
1. Input bar shows "1/2" and question 1. Visitor types a word, presses Enter.
2. Input bar shows "2/2" and question 2. Enter submits.
3. Short "Takk!" confirmation; both words animate into their clouds; the form
   resets to question 1.
- Escape (or a "Tilbake" hint) returns from question 2 to question 1.
- Normalisation: trim, lowercase (`toLocaleLowerCase('nb')`), strip surrounding
  punctuation. Empty input is ignored.
- If the input contains whitespace, show a hint «Bare ett ord 🙂» and do not advance.
- Max length 30 characters.
- If question 2 is left untouched for 60 s (`idleResetMs`), the form resets to
  question 1 so the next visitor starts fresh.

### Word clouds
- Two clouds side by side, each headed by its question.
- Font size scales with count (sqrt scale between a min and max size, relative
  to the largest count in that cloud) and to the available container size.
- Layout: words sorted by count (desc, ties alphabetical), each placed along an
  Archimedean spiral from the centre at the first position that doesn't overlap
  already-placed words (bounding-box collision). Words that don't fit are
  shrunk globally (retry with a smaller scale).
- Every word is an absolutely positioned DOM element keyed by word. On update,
  elements are reused and moved/resized with CSS transitions (transform +
  font-size), so words slide and grow. New words fade/scale in. The word(s) just
  submitted get a brief pulse highlight.
- Each word gets a stable colour from the gym-floor line palette in
  `config.js` (hash of the word), so colours don't jump when ranks change.
- Re-layout on window resize (debounced).

### Hidden clouds ("skillevegg" curtain)
- Added 2026-09-25 at the user's request, so visitors aren't inspired by earlier answers.
- Clouds are blurred behind a curtain styled as a sports-hall dividing curtain,
  with the text «Svar først, så får du se hva andre har svart».
- After a submit the curtain rolls up for `revealMs` (10 s), then drops again.
  It drops immediately if someone starts typing.
- Clouds are also shown while the admin panel is open, and while the admin
  toggle «Vis ordskyene hele tiden» is on (not persisted).
- A "shot clock" in the header counts down (whole seconds plus a draining bar)
  until the curtain drops; the last 3 s turn red and pulse. It is hidden when
  nothing will be hidden (staff toggle on or admin open) and when typing drops
  the curtain early.

### Admin panel
- Toggle with `Ctrl+Shift+A`, or type `/admin` + Enter in the answer field
  (fallback: some browsers reserve `Ctrl+Shift+A`). Not visible otherwise.
- Lists all words per question with count and a delete button. Deleting a word
  blanks that answer in every response for that question (rows are kept, so
  respondent numbers stay stable).
- "Last ned CSV" button downloads `gym-ordsky-YYYY-MM-DD.csv`:
  UTF-8 with BOM, `;` separated, header `respondee_number;answer_1;answer_2`,
  one row per response, `respondee_number` incremental starting at 1.
  Fields containing `;`, `"` or newlines are quoted.

### Data model
`localStorage["gym-ordsky-v1"] = { nextN: number, responses: [{ n, a1, a2, t }] }`
where `t` is an ISO timestamp. Invalid/missing storage → start empty.

## Visual direction
"Gymsal": dark court-coloured background with faint court-line decoration, a
bold condensed sports display font, words in court-line colours (yellow, red,
blue, white, green). High contrast, readable from distance; large input bar.

## Change 2026-09-25: two words, merge, raw CSV
- Answers may have one or two words (both questions); 3+ words → «Maks to ord 🙂».
  Max 40 characters. Question 1 text: «Beskriv "gym" med ett eller to ord.»
- Each response stores the raw text (`r1`, `r2`, whitespace collapsed) and the
  cloud form (`a1`, `a2`). The CSV exports the raw text, unchanged by admin actions.
- Delete and merge are display rules in `rules.hidden[q]` / `rules.merges[q]`
  (from → to pairs). Deleted words stay hidden for later answers; merges apply to
  later answers; merges can be undone from the admin panel.
- This replaces the earlier behaviour where Delete blanked the cell in the CSV.

## Error handling
- `localStorage` unavailable/full: keep working in memory and show a small
  warning in the admin panel.
- Corrupt stored JSON: start empty (old value kept under a backup key).

## Testing
- `tests/index.html` runs plain-JS assertions in the browser for: normalisation,
  counting, delete word, CSV output (BOM, quoting, blanks), and cloud layout
  (no overlaps, all words inside bounds, largest word biggest).
- Manual/Playwright check of the full flow in a browser: answer, clouds update
  with animation, admin delete, CSV download.

## Deployment
Repo root is the site. Enable GitHub Pages on the `main` branch (root). README
explains how to edit `config.js` and publish.
