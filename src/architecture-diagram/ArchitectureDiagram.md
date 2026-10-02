# Architecture Diagram — General Guidance

Reusable conventions for hand-authored SVG architecture diagrams (grouped
boxes + arrows), distilled from iterating on one such diagram. Apply these
to any new diagram of this style; nothing here is specific to one project.

## Structure

Two levels of box:

- **Big box** (a.k.a. "module"): a container grouping related components.
  Dashed border, transparent fill, a plain title. Purely a visual grouping —
  it does not itself represent a component.
- **Inner box**: an actual component/file/class living inside a big box.
  Solid border + fill, its own color, a title (and optionally a subtitle),
  then body text.

Arrange big boxes as a small grid/flow (rows and columns) based on the
dependency story you want to tell — e.g. entry points at the top, a shared
"contracts/interfaces" box in the center acting as a hub, concrete
implementations at the bottom. Let the _reader's eye path_ (top-to-bottom,
left-to-right) match the _narrative_ (request comes in here, flows through
this, lands here).

## Big-box (module) styling

- Border: dashed, a single neutral grey, used for **every** big box
  regardless of what's inside it. Don't color-code big boxes — color
  belongs to inner boxes only (see below). A consistent neutral dashed
  frame is what visually says "this is a grouping, not a component."
- Fill: transparent. The frame should never obscure or tint what's behind
  or around it.
- Title: centered, same neutral/muted color as the border, bold, smaller
  than inner-box content would suggest at a glance but still clearly a
  section header (not body text).

### Big-box padding — six values, all equal

1. top (box top edge → title)
2. title → first row of inner boxes
3. left (box edge → inner-box edge)
4. right (box edge → inner-box edge)
5. bottom (last inner-box edge → box bottom edge)
6. _(if this big box sits beside another in the same row/column with a
   deliberately different gap, that's a separate concern — see "Diagram-level
   padding" below, not part of this per-box list)_
7. if there are arrows inside the Big-box, the spacing between the inner boxes needs to be big enough to allow the labels to be clearly visible.

Pick **one padding value** and apply it to top/title-gap/bottom uniformly.
Left/right can be a **different single value** from the others, as long as
it's identical across every big box — they don't have to numerically match
top/bottom, they just have to match _each other_.

**When content no longer fits: grow the frame, don't shrink or reflow the
inner box.** The frame is cheap to resize (it's just a dashed rectangle);
an inner box's internal layout is comparatively expensive to redo safely.
Growing a frame has cascading effects to track:

- Any arrow that targets that frame's edge as a "module boundary" endpoint
  needs its coordinate updated to the new edge position.
- Any "midpoint of this box's height/width" calculation used for routing
  (see right-angle arrows below) needs recomputing.
- Gaps to neighboring rows/columns may shrink; check they stay positive
  before deciding whether to also shift those neighbors.

## Inner-box styling

Each inner box: **title** (bold, small), optional **subtitle** (e.g. a
file path or one-line identifier), then **body text** (description lines).
Own solid fill + border color, distinct per box — this is where all the
diagram's color-coding actually lives.

### Inner-box padding — six values, all equal

1. top (box top edge → title)
2. title → subtitle (only if a subtitle exists)
3. subtitle → body text (or title → body text directly, if no subtitle)
4. left (box edge → left-aligned text)
5. right (clearance against box edge for text)
6. bottom (last body line → box bottom edge)

Pick one padding value and use it for all six, treating "title → subtitle"
and "subtitle → text" as the _same_ gap even when a box skips the subtitle
tier (in that case it's just "title → text" using the same value). Do **not**
also try to force every box's line-to-line spacing _within_ the body-text
block to match across boxes — that's incidental to content length, not a
padding concern. Only the gaps _around_ the title/subtitle/text sections,
plus the four edge margins, need to be uniform.

**Box sizes should differ based on content.** Don't force uniform box
dimensions — a box with more lines is taller. What's uniform is the
_padding_, not the box. When one inner box grows and would collide with a
sibling stacked below it in the same big box, push the sibling down (keep
whatever gap between siblings you'd already established) rather than
shrinking either box's content.

## Color

- Color is assigned **per inner box**, one distinct hue each (unless two
  boxes are so tightly related — e.g. two halves of the same conceptual
  component — that sharing a hue with a shade difference reads as "same
  family"; if you do this and it's later flagged as inconsistent, just
  unify to one flat color rather than defending the shade distinction).
- **An arrow's color = the color of its destination box**, not its source.
  This applies whether the destination is an inner box or (for a
  cross-module arrow) conceptually "this whole module" — pick the
  representative color of what's being pointed at.
- Big-box frames do not carry color (see above) — they're always the
  neutral dashed grey, regardless of what color-family their contents use.
- A legend that lists one swatch per module/category should track color
  changes — when an inner box's color changes, its legend swatch is easy
  to forget since it's not adjacent to the box visually. Re-check the
  legend any time you touch inner-box colors.

## Arrows

- **Cross-module arrows connect module boundary to module boundary** — the
  edge of one big box's dashed frame to the edge of another's — never to an
  inner box's edge, even though the "real" dependency is between two inner
  boxes. The big box is the unit of connection at this zoom level.
  - Exception: an arrow that is _internal_ to a single big box (both
    endpoints inside the same module) should point at the actual inner
    boxes involved — the module-boundary rule only applies to arrows that
    _cross_ between modules.
- **Prefer the shortest reasonable path.** When two modules are simply
  adjacent, route between their _facing_ edges (the edge of A closest to B,
  to the edge of B closest to A) rather than from corner to corner or
  through the long way around. A long vertical/horizontal gap between rows
  is often unavoidable (it's dictated by the row spacing), but horizontal
  wander within that gap is usually avoidable — minimize it.
- **Right-angle (dog-leg) routing**, when requested for a specific arrow:
  exit near a _named corner_ of the source box (e.g. "bottom-right"), run
  straight in one axis, then turn 90° at a meaningful reference point (e.g.
  "the vertical midpoint of the destination box's height") to enter the
  destination's edge. When multiple such arrows enter the same edge, stagger
  their turn-points (different y or x values, a consistent offset apart) so
  the parallel segments and their corners don't overlap. If asked to swap
  which of two such arrows is "above" the other, that's about their
  entry-point order on the shared edge, not about which was drawn first.
- **Label placement**: a label must never sit on top of its own line.
  - For a shallow-angle or steep/near-vertical line, don't rotate text to
    match the slope if it's short — plain horizontal text beside the line
    (anchored `end` if the label sits to the line's left, `start` if to its
    right) reads better than rotated text, especially past ~45°.
  - For a right-angle arrow, put the label **above the horizontal segment**
    (or beside the vertical one), centered on that segment specifically —
    not floating at some arbitrary point on the overall path.
  - When a label is moved to fix an overlap, prefer a modest nudge over a
    large jump — overcorrecting just creates a new "too far away" complaint.
- **Line style encodes a real distinction, and the legend must state what
  it is.** A common pair: solid = direct call/import, dashed = indirect/
  structural (e.g. "creates via factory," "depends on shared types"). Before
  choosing solid vs. dashed for a given arrow, check what the underlying
  code actually does — don't dash a real function call just because it
  feels indirect, and don't leave an arrow dashed out of habit after its
  underlying relationship turns out to be a direct call.
- A **hub pattern** — one central box that many others point into (e.g. a
  shared types/interfaces module) — reads well as a fan of thin, dashed,
  neutral-colored connectors, one per contributing module, all obeying the
  module-boundary rule above.
- **Minimum 40px gap between two boxes directly connected by an arrow.** If
  the boxes' facing edges would otherwise sit closer than that (e.g. two
  inner boxes side by side in the same big box), the arrow reads as a tick
  mark rather than a visible line. Grow the containing frame to create the
  gap (see "growing the frame" above) rather than shrinking either box.

## Diagram-level (canvas) padding

The canvas itself has its own set of paddings, analogous to a big box's:
top, left, right, bottom, "title → first row," and (if there's a legend or
footer block) "last row → legend." Make these equal too, using the same
method as everywhere else: pick one value, then adjust.

Two things are specific to this outermost level:

- **Left/right padding is usually dictated by whichever element is widest**
  (often a full-width legend or footer bar) — everything above it may have
  been positioned with much larger, uneven side margins as a byproduct of
  earlier moves. Check the actual bounding box of _all_ content (including
  that footer bar) before picking a target padding, not just the box grid.
- **Fixing this is best done as one uniform translation** (shift every
  x-coordinate by the same delta, or every y-coordinate) rather than
  reflowing element-by-element — it's mechanical, preserves every existing
  relative layout decision, and is low-risk _if scripted carefully_. Two
  footguns when scripting a bulk coordinate shift over hand-authored SVG:
  1. Arrowhead `<marker>` definitions use **local marker-space coordinates**
     (typically a small fixed range like `0–10`), not canvas coordinates —
     never apply the canvas-level shift to marker path data.
  2. A naive substring check for "does this line contain a path attribute"
     (e.g. checking for `d="`) can false-positive on unrelated attributes
     whose name happens to end in the letter the check is looking for
     (e.g. `marker-end="..."`, `xlink:href="..."`). This mis-routes the
     whole line's transform and can silently skip real coordinates that
     should have shifted. Match the attribute name precisely (a leading
     word-boundary plus the exact attribute name, e.g. `\bd="`), or require
     the value itself to look like a path (starts with a command letter
     such as `M`).
     After any bulk transform, re-derive and re-verify at least one dependent
     quantity by hand (e.g. re-add up a padding gap) rather than assuming the
     script did the whole job correctly — bulk transforms are exactly where a
     silent partial failure is easiest to miss.

## General working method

- After each visual change, restate in one sentence _why_ the change is
  correct (e.g. "this arrow now touches the module edge, not the inner
  box") — this is what catches the inevitable off-by-one or misapplied
  convention before it compounds into the next change.
- Prefer **rewriting the whole file** over many scattered small edits when
  a change touches more than ~5–6 coordinated values (e.g. normalizing
  padding across every box) — partial edits across a large coordinate web
  are where inconsistencies creep in. For small, localized changes (move
  one label, recolor one box), targeted edits are fine and preferable.
- When a request could be read as either "fix this one thing" or "fix this
  and rebalance everything around it," default to the narrower reading
  unless the user's wording clearly asks for the broader one — a wide
  reading multiplies the blast radius (and the chance of a mistake) for
  every request, including ones meant to be small.
