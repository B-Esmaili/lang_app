# Shared rich-text document and responsive layout

The course builder and template editor render native HTML through the same
`ResponsiveLayout.svelte` component. It maps persisted device variants to CSS
Grid using proportional `fr` columns, named spacing tokens resolved in `rem`,
numeric grid lines, and content-sized rows. The browser therefore owns text
wrapping, font shaping, selection, caret placement, bidirectional layout, and
accessibility.

Templates persist relative column weights, named slots, desktop/tablet/phone
arrangements, gap tokens, and optional padding tokens. Pixels and measured
rectangles never enter saved definitions. Auto mode uses a `ResizeObserver` and
root-relative breakpoints; explicit device previews remain deterministic.
Existing JSONB templates are compatible, so this rendering change needs no
database migration.

`EditableText.svelte` provides the shared Tiptap editing boundary. Its compact
schema stores plain text plus the existing annotation ranges, including
overlapping bold, emphasis, underline, highlight, and vocabulary marks. It
preserves UTF-16 offsets used by saved lesson documents. Persian and Arabic
content uses native shaping, ZWNJ, combining marks, RTL selection, browser IME,
and the configured Arabic font without a parallel rendering path.

Lesson history remains the source of truth for undo and redo. Rich-text changes
flow through the same immutable lesson mutations and autosave path as frame,
widget, and appearance changes. External history snapshots reconcile into
Tiptap while retaining a sensible selection. Standalone text editors use a
local ProseMirror history plugin.

`interactions/lesson-drag.ts` measures the actual DOM frames, slots, and
widgets for drop placement. Dragging begins only from dedicated native grips,
leaving text bodies available for mouse and touch selection. Delete and move
controls are similarly separate from editable content, so Backspace/Delete
inside text always edits text. Template regions follow the same grip rule and
use native CSS Grid boxes as drop targets.

Audio waveforms render as reusable SVG inside semantic DOM widgets. Future
coordinate systems, unit circles, simulations, and other graphical widgets can
use SVG, WebGL, or another focused renderer within their own widget boundary.
They do not change the surrounding selectable document or responsive template
contract.

Preview mode removes authoring controls while keeping native selectable text
and learner activities. Frame borders remain absent by default; authors can
choose subtle or accent borders through the shared appearance model.
