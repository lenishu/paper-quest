# Visualizations — knowledge graph, map, layout

Picking the wrong renderer is the classic mistake here.

| Component | What it draws | Where used | Tech |
|---|---|---|---|
| `KnowledgeGraph.jsx` | **the main knowledge graph** — every concept + career skill merged, click-a-star-to-travel. Owns the chrome (search, branch chips, legend, detail panel) and picks the renderer | `ExploreView.jsx` (full page), `Dashboard.jsx` (compact) | 3D by default; 2D canvas fallback |
| `KnowledgeGraph3D.jsx` | the 3D renderer for the above | `KnowledgeGraph.jsx` when `is3d` | `3d-force-graph` (WebGL) |
| `SkillTreeCanvas.jsx` | per-project skill-tree MAP (tiers as layers, prereq edges, node states) | `MapView.jsx` (project tab=map) with `NodePanel.jsx` | canvas + `graphLayout.js` |
| `ReferenceGraph.jsx` | citation map (see [references.md](references.md)) | `ReferencesModal.jsx` | canvas |
| `webgl.jsx` | `WEBGL_OK` probe + `GL3DBoundary` | `KnowledgeGraph.jsx`, `GalaxyPanel.jsx` | — |
| `GalaxyPanel.jsx` / `Galaxy3D.jsx` / `BrainMap.jsx` | old galaxy hero (3D WebGL / 2D fallback) | **unused** (dashboard + explore moved to KnowledgeGraph) | `3d-force-graph`, canvas |

## Panning (canvas maps) — two bugs that will bite again
Pointer handlers share one `endDrag(selectOnTap)` helper. `onPointerMove` bails
to `endDrag(false)` when `(e.buttons & 1) === 0` — a safety net for a missed
`pointerup` (release off-canvas, after a double-click).

1. **Capture on the element that owns the handlers.** The handlers are bound to
   the `<canvas>`, so `setPointerCapture`/`releasePointerCapture` must be called
   on `canvasRef`, **not** the wrapper div. Capturing on the wrapper retargets
   every later pointer event to it, and React then dispatches only to the
   wrapper and its ancestors — the canvas is a *child*, so its handlers go
   silent. Symptom: the map pans ~4px (the drag threshold) then freezes, and
   `pointerup` never arrives. This is what made the map "really hard to drag".
2. **Never read `drag.current` inside a `setState` updater.** React runs the
   updater asynchronously; if `pointerup` lands first, `endDrag` has already set
   it to null and the view crashes with `Cannot read properties of null`. Read
   the origin into locals *before* calling `setView`.

Both apply to `SkillTreeCanvas.jsx` and `ReferenceGraph.jsx`, which share the
pattern.

## KnowledgeGraph.jsx — the Constellation Navigator (primary)
Full-page (ExploreView, `/api/graph?scope=all`) and compact (Dashboard, fed
`dash.galaxy`). Click a node to travel (light up prereqs/unlocks, dim the rest);
the detail panel's Builds-on/Unlocks chips travel onward. Search, branch filter.

**Renderer choice.** `is3d = mode === '3d' && !compact`. The full page defaults
to 3D when `WEBGL_OK`; `GL3DBoundary` drops it to 2D if WebGL dies at runtime,
and the ▦ control toggles manually. **The compact instance is deliberately
always 2D** — one WebGL context per screen; browsers cap how many can be live,
which is what the old galaxy crash was about. All the chrome (chips, legend,
search, panel) is renderer-agnostic and overlays either one.

Branch filtering differs by renderer: 2D skips hidden branches at draw time,
3D filters the data (`shown`) before it reaches the graph.

The 2D canvas keeps a deterministic force `layout()` (one pass, no live jitter),
pan/zoom, and these two hard-won rules:
- **Sizing via `ResizeObserver`, not the rAF loop.** Browsers throttle
  `requestAnimationFrame` in offscreen/background tabs, so the loop can't be
  trusted for first paint; the observer sizes the canvas + draws the moment the
  stage gets width, and interactions call `draw()` explicitly. rAF only smooths
  the warp. Don't move sizing back into the loop.
- The compact instance MUST receive memoized `nodes`/`edges` (see Dashboard's
  `miniNodes`/`miniEdges` useMemo) — a fresh array each render re-runs the
  effect and cancels the loop.

Data: `/api/graph` (merged concepts+careers) for the full page; `dash.galaxy`
(`/api/dashboard`) for the mini. Per-project map data = project `nodes` +
`states` from `GET /api/projects/:id`.

## KnowledgeGraph3D.jsx — the 3D renderer
`3d-force-graph`. Colours follow the 2D legend (mastered green / known blue /
ready amber); **locked keeps its dimmed branch hue**, because a state ring
around all 267 nodes is noise in 3D. Size encodes tier.

**Camera framing is the fiddly part** — this graph is every concept you own, so
it ranges from a handful of nodes to several hundred and no fixed distance
works:
- `fitCore()` fits the **densest 88%** of nodes, not all of them. Plain
  `zoomToFit` frames outliers too, which shrinks the real cluster to a speck.
- The layout keeps expanding for seconds, so a single early fit frames a cloud
  that then grows out of shot. A 900ms interval re-fits while it settles, and
  `onEngineStop` takes the final shot (`cooldownTime` 8s).
- **Auto-framing stops the moment the user takes control** — `pointerdown`,
  `wheel`, *or* a `warp()`. Without that last one, travelling to a concept gets
  immediately undone by the next re-fit.
- `warp(id)` frames the node **with its prerequisites and unlocks** rather than
  flying to a fixed distance — self-scaling, and seeing a concept in context is
  the point of travelling to it. Isolated nodes fall back to a distance
  proportional to the field.

**Legacy galaxy (Galaxy3D/BrainMap/GalaxyPanel):** kept in the tree but not
mounted. The WebGL guard that used to live in `GalaxyPanel` now lives in
`webgl.jsx` and is shared. If you re-mount the legacy panel, remember that a
second live WebGL context competes with the Explore graph.

## graphLayout.js — shared visual vocabulary
`tierOf`, `TIER_LABELS`, `branchColor(branch)` (single source of node color —
Galaxy3D, BrainMap, SkillTreeCanvas all import it), plus the 2D tier-layer
layout used by SkillTreeCanvas.
**Change colors/tiers here, never inline in a component.**
Learning-state colors (mastered/ready/locked dimming) live inside Galaxy3D and
SkillTreeCanvas respectively — keep them consistent if you touch either.

## NodePanel.jsx
Side panel when a map node is selected: blurb, usage-in-paper, prereq list,
bookmark toggle, a **📝 My notes** editor (→ learning.md), and the **Learn**
button (→ learning.md). Uses `MathText`.
