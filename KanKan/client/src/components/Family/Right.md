# Family Tree — Complete Behavior Specification

This document fully describes the rendering, animation, interaction, and layout behavior of the family tree component. It can be used to independently re-implement the component from scratch.

---

## 1. Component Structure

The component renders inside a single `<svg>` element. It contains two top-level groups:

- **`<g class="tree-group">`** — Contains all tree nodes, links (parent-child connectors), and stub lines. This group is transformed by D3 zoom (pan + scale).
- **`<g class="strip-group">`** — The generation strip (世代条带) on the right side. This group is NOT inside tree-group. Its x-position is fixed to the right edge of the SVG viewport. Its y-positions are computed from the zoom transform to stay vertically aligned with the tree.

Other UI elements (person detail panel, context menu, breadcrumb, search) are external React components and not part of this SVG.

---

## 2. Layout Constants

```typescript
NODE_GAP = 55          // horizontal spacing between sibling leaf nodes
LEVEL_HEIGHT = STUB_LEN + TYPICAL_BOX_H + STUB_LEN + 32 = 150
                       // vertical spacing between generations
                       // decomposed: stub above (20) + box (78) + stub below (20) + gap (32)
BOX_Y_OFFSET = -16     // name box top relative to node anchor point
TYPICAL_BOX_H = 78     // typical 3-character name: 3*18 + 24
STUB_LEN = 20          // length of AA and AC stub lines
GEN_STRIP_W = 34       // width of the generation strip
NODE_STEP_MS = 50      // delay between each new node reveal (ms)
```

---

## 3. Tree Layout Algorithm

### 3.1 Coordinate System
- X-axis: horizontal, grows rightward. Rightmost = eldest child (Chinese genealogy convention: 长子在右). `sortOrder` is authored to preserve this rule.
- Y-axis: vertical, grows downward. Each generation at `depth * LEVEL_HEIGHT`.

### 3.2 Layout Function: `layoutSubtree(node, leftEdge)`
- Recursive, bottom-up.
- Leaf nodes are placed at `leftEdge`, returning width = `NODE_GAP`.
- Internal nodes: layout all children left-to-right, then position the parent at its **rightmost child's x**. This ensures the parent is always vertically aligned with the eldest (rightmost) child.
- Returns the total width consumed.

### 3.3 Visible Window
- `visibleStartDepth`: absolute depth of the topmost visible generation.
- `maxVisibleDepth`: number of generations visible (e.g., 2 or 3).
- `buildVisibleTree(root, startDepth, maxVisible)`: extracts the subtree within the visible window. Creates a virtual root at depth=-1 if multiple nodes exist at `startDepth`.

### 3.4 Right Alignment
- During animation, partial trees are narrower than the full tree.
- `alignRight(tree)`: shifts all node x-coordinates so the rightmost node in the partial tree matches `fullMaxX` (the rightmost x in the complete target tree).
- Effect: the rightmost side of the tree stays fixed on screen; new nodes expand to the left.

---

## 4. Initial Rendering

### 4.1 Startup
1. Compute the visible tree from the data.
2. Layout the tree (`layoutSubtree`).
3. Determine `maxDepthRef` (number of visible depth levels).
4. Render all nodes and links into the SVG.
5. Position the view so the **rightmost node** is near the right edge of the viewport (not centered!). The tree is drawn close to the strip, right-aligned.
   - Initial X: `viewportWidth - rightPadding - maxX` where `rightPadding = 30 + GEN_STRIP_W`.
   - Initial Y: `40 + STUB_LEN = 60` (fixed vertical offset from viewport top).
6. Render the generation strip at the right edge.
7. The strip and tree heights are determined by the predefined generation count (`maxVisibleDepth`), starting from generation at `visibleStartDepth`.

### 4.2 Node Reveal Order Algorithm

All nodes are revealed one at a time, from right to left. The reveal order is determined by a single sort:

**Sort all nodes by descending x-coordinate** (as computed by `layoutSubtree`). If two nodes have the same x, the deeper (lower generation) node comes first.

This produces a natural right-to-left drawing effect because:
- The rightmost node (largest x) is always drawn first.
- Since `layoutSubtree` positions a parent at its rightmost child's x, the rightmost child and its parent share the same x. The tie-break by depth means the child appears before the parent.
- Siblings are spaced by `NODE_GAP`, so they naturally sort right-to-left.

**Example**: Given a tree where 李国栋 has children 李志远, 李国梁, 李国芬 (right to left), and 李志远 has children 李志宏, 李志伟 (right to left):

The reveal order would be approximately:
1. 李志宏 (rightmost leaf, largest x)
2. 李志远 (same x as 李志宏 because parent aligns with eldest child, but deeper tie-break puts child first — actually 李志远 is shallower so it comes after)
3. 李志伟 (next sibling, smaller x)
4. 李国梁, 李国芬... (continue leftward)

The key insight: **this is NOT a tree traversal** (not DFS, not BFS). It's a flat sort of all nodes by their x-position. The tree structure doesn't matter for the reveal order — only the final computed x-coordinate matters.

### 4.3 Right Alignment During Reveal

When nodes are revealed incrementally, the tree is **right-aligned**: the rightmost node is always at the same x-position (`fullMaxX`). As each new node appears:
- The layout is recomputed with the revealed nodes.
- All nodes are shifted so the rightmost node stays at `fullMaxX`.
- Existing nodes may slide left to make room for the new node.

This creates the visual effect of the tree "growing from right to left" — the right side is anchored, new content expands leftward.

### 4.4 Animation Timing

- Each node appears `NODE_STEP_MS` (50ms) after the previous one.
- The node fades in and slides to its position.
- Its parent-child link appears simultaneously.
- When a parent gained its first child, the parent's ▼ expand stub disappears.

### 4.3 Critical Rule: Never Reposition After Initial Placement
Once the strip and tree are positioned on initial render:
- Do **NOT** re-center the tree in the viewport.
- Do **NOT** move the strip to a different position.
- The strip stays at the top-right. The tree draws adjacent to (left of) the strip.
- The only position changes come from user pan/zoom or animation-driven view adjustments.

---

## 5. Generation Strip

### 5.1 Structure
- Fixed at the right edge of the SVG: `translate(svgWidth - stripWidth, 0)`.
- Contains one cell per visible generation, with:
  - Background rect (alternating white/light blue).
  - Label text (e.g., "第3世") in vertical orientation.
  - Horizontal and vertical border lines.
- ▲ arrow above the first cell (if `canShiftUp`).
- ▼ arrow below the last cell (if `canShiftDown`).

### 5.2 Position Calculation
Each cell's Y position = `genZoneTop(depth) * zoom.k + zoom.y` (tree coordinate mapped to screen).
Cell height = `(genZoneBottom - genZoneTop) * zoom.k`.

### 5.3 Synchronization with Tree
- Strip is rendered via D3 (not React state) to avoid re-render lag.
- Updated in the zoom handler on every zoom/pan event — same frame as the tree transform.
- During animation, strip updates are skipped to prevent flickering. Updated once when animation ends.

### 5.4 Strip Updates on Shift
When the user clicks ▼ or ▲:
1. The strip labels update immediately to show the new generation window (e.g., 第4世→第5世).
2. Then the node animation plays.
3. The strip does NOT move during animation.

---

## 6. Shift Down Animation (Click ▼)

### 6.1 Overview
Clicking ▼ shifts the visible window down by one generation. The top generation scrolls out, a new bottom generation appears.

### 6.2 Steps

#### Step 0: Prepare
1. Compute the full target tree (new visible window).
2. Set `maxDepthRef` from the target tree.
3. Update the strip labels.
4. Reposition the zoom transform so the rightmost node of the target tree is near the right edge of the viewport.
5. Pre-compute ALL animation frames.

#### Frame 0: Shift existing nodes
- Nodes from the previous top generation (L0) are removed (fade out).
- Remaining nodes shift up one level: L1→L0, L2→L1.
- These nodes now have new coordinates (right-aligned to `fullMaxX`).
- Nodes at the new bottom row show `hasHiddenChildren` stub (▼) since their children aren't revealed yet.
- The tree appears to "compress" vertically and shift up.

#### Frames 1..N: Reveal new nodes one by one
- New nodes appear globally from **right to left** (sorted by descending x coordinate in the full tree).
- Each new node:
  - Appears at its correct (x, y) position.
  - Fades in briefly (opacity 0→1).
  - Its parent-child link appears simultaneously.
- Existing nodes that need to shift left (to make room for new siblings) slide smoothly to their new positions.
- When a parent's first child appears, the parent's ▼ expand stub is removed.
- **Visual effect**: New children appear in the lowest layer from right to left. Parents get "pushed to the left" as children expand. This ripple can propagate to higher layers because of the rule "parent aligns with eldest (rightmost) child".

#### Final Cleanup
- `animatingRef` set to false.
- Highlight restored.
- Strip updated with final transform.
- Zoom constraints re-applied.

### 6.3 Timing
- `NODE_STEP_MS` (50ms): delay between each new node appearing.
- Each node's fade-in and position slide complete before the next node appears.

---

## 7. Shift Up Animation (Click ▲)

### 7.1 Overview
Clicking ▲ shifts the visible window up by one generation. The bottom generation scrolls out, a new top generation appears.

### 7.2 Visual Effect
- The entire tree is redrawn from scratch, right to left.
- The previous bottom layer is removed (no longer in the visible window).
- Siblings that were spread apart (because their children kept them separated) now get "pushed together" — because their children are no longer displayed.
- New ancestor nodes appear at the top.
- **Effect**: Tree moves down visually, siblings compress closer together, then new ancestors appear at the top.

### 7.3 Implementation
- `baseReveal` starts empty (no nodes initially shown).
- All nodes in the target tree are in the reveal queue, sorted right-to-left.
- Every node gets animated in one by one, producing the full redraw effect.

---

## 8. Node Expand (Click ▼ on a Node)

When clicking the ▼ arrow on a bottom-layer node (node with hidden children):
- The visible window shifts down to show that node's children.
- Same animation as Shift Down, but the view centers on the expanded node's branch.

---

## 9. Pan / Zoom Behavior

### 9.1 Horizontal Pan Only
- Vertical dragging is locked: `cy = lastTransformRef.current.y` (always).
- Only horizontal panning is allowed.

### 9.2 Horizontal Constraints
- When not animating:
  - If tree is wider than viewport: clamp x to keep tree visible (allow scrolling from left edge to right edge with padding).
  - If tree fits in viewport: center tree horizontally (with strip offset).
- When animating: skip constraints entirely — view stays where the animation positioned it.

### 9.3 Zoom
- Scale range: 0.1 to 3.0.
- Zoom changes scale but keeps vertical position locked.

### 9.4 View Positioning
- The tree is always positioned with the rightmost content near the right edge and the strip.
- When the tree is wider than the viewport, the user sees the rightmost portion first and can scroll left to see more.
- **Never** auto-center the tree or jump the view to the left side.

---

## 10. Node Selection & Highlighting

### 10.1 Click on a Node
- Selects the entire **branch**: the node, all its ancestors up to the root, and all its descendants.
- Selected nodes are highlighted (green border, green text, full opacity).
- Unselected nodes are dimmed (opacity 0.15).
- Links within the selected branch are highlighted green.

### 10.2 Click on Node's ▼ Arrow
- Similar to node click: selects the node's parents and children.
- Additionally triggers an expand (shift down to show children).

### 10.3 Highlighting Effect
- `applyHighlight()` smoothly transitions (250ms) the following properties:
  - **Node opacity**: highlighted nodes → 1, others → 0.15 (`COLORS.dimOpacity`).
  - **Node border**: highlighted → green (`rgb(42,175,71)`), stroke-width 2.5; others → gray (`#7a8fa0`), stroke-width 1.2.
  - **Name text**: highlighted → green fill, font-weight 700; others → dark (`#1e293b`), font-weight 500.
  - **Links**: highlighted (both source and target in set) → green stroke, width 2; others → gray, dimmed to 0.15.
- Must NOT run during node-reveal animation — conflicts with the node fade-in effect and can cause nodes to disappear.

### 10.4 Mouse Hover Effects

- **Mouse enter**: node border stroke-width transitions from 1.2 to 2.2 over 120ms.
- **Mouse leave**: stroke-width transitions back to 1.2 (or 2.5 if node is highlighted) over 200ms.

---

## 11. Highlighted Branch & Navigation

When a branch is highlighted (selected), the ▲/▼ strip buttons and node ▼ arrow behave differently:

### 11.1 Shift Down with Highlighted Branch
- The visible tree's rightmost child should be the selected branch's rightmost child.
- Drawing proceeds as normal (right to left), but ensures the selected branch is fully visible and highlighted on the right side.
- Unselected branches may still appear on the left side if there is space.

### 11.2 Shift Up with Highlighted Branch
- Same principle: the selected branch stays visible and highlighted on the right.
- The view ensures the highlighted branch is always shown.

### 11.3 View Adjustment
- After animation, if a person was pending center (`pendingCenterRef`), the view pans smoothly (600ms) to center on that person and highlights their branch.
- The pending center is triggered by `FamilyPage.tsx` via `setPendingHighlight(personId)` before changing `visibleStartDepth`, followed by `setTimeout(() => centerOnPerson(personId), 80)`.
- The 80ms delay allows the React state change and `drawTree` to complete before centering.
- `centerOnPerson` uses `requestAnimationFrame` for timing.

---

## 12. D3 Rendering Details

### 12.1 Node Elements (`.node`)
- `<g>` element, keyed by `node.data.id` (UUID).
- **Box**: `<rect class="node-border">` — rounded corners (rx/ry=6), white fill (`#fff`), gray stroke (`#7a8fa0`, width 1.2). Width: 26px (no spouse) or 42px (with spouse). Height: `max(nameLen, spouseNameLen) * 18 + 24`.
- **Primary name**: `<text class="name-text">` with one `<tspan class="name-char">` per character, vertical layout (dy=1.25em). Font: 14px "Microsoft YaHei", color `#1e293b`, weight 500. X position: -10 (with spouse) or 0 (without).
- **Spouse name** (if `spouses.length > 0`): second `<text>` at x=10, font 12px, color `#64748b`. Same vertical character layout.
- **Gender dot**: `<circle>` at top-left of box (`cx: -(boxW/2)+5, cy: BOX_Y_OFFSET+6`), radius 3. Color: `#60a5fa` (male) or `#f472b6` (female).
- **Death marker** (if `isAlive === false`): `<text>` "†" at top-right (`x: (boxW/2)-5, y: BOX_Y_OFFSET+9`), font 8px, color `#94a3b8`.
- **Expand stub** (if `hasHiddenChildren`): `<line class="expand-stub">` from box bottom extending `STUB_LEN` down, plus `<text class="expand-stub">` "▼" at `STUB_LEN+10` below box. Line: stroke `#8ea4b8`, width 1. Text: font 10px, color `#94a3b8`, cursor pointer, click calls `onExpandDepth(node.id)`.
- **Enter**: opacity 0 (if animated), positioned at previous position (from `prevPosRef`) or target position.
- **Update**: only remove `.expand-stub` elements if `hasHiddenChildren` is now false. Do NOT rebuild other content.
- **Exit**: immediate remove (no fade).

### 12.2 Link Elements (`.link`)
- `<path>` element, keyed by `"sourceId->targetId"`.
- Path: vertical from parent bottom → horizontal to child x → vertical to child top.
- **Enter**: opacity 0 (if animated).
- **Update**: transition path `d` to new positions.
- **Exit**: immediate remove.

### 12.3 Stub Lines (`.stub-line`)
Only rendered when `visibleStartDepth > 0` (viewing a sub-section of the full tree).

- **AA (ancestor stub)**: vertical line from each top-row node upward.
  - For the **eldest** (rightmost) sibling in each parent group: extends `2 * STUB_LEN` (40px) above box top.
  - For other siblings: extends `STUB_LEN` (20px) above box top.
  - This extra length for the eldest indicates the parent connection point.
- **AB (sibling connector)**: horizontal line connecting siblings at their parent's level.
  - Only drawn when there are 2+ siblings (total in data, not just visible).
  - Position: `y = node._y + BOX_Y_OFFSET - STUB_LEN`.
  - Spans from leftmost to rightmost visible sibling x.
  - If some siblings are outside the visible window (`total > visibleCount`), the line extends ±15px beyond to indicate more exist.

---

## 13. Color Theme

All visual colors used throughout:

| Element | Color |
|---------|-------|
| Background | `#eef2f6` |
| Link / connector line | `#8ea4b8` |
| Highlight (selected branch) | `rgb(42,175,71)` green |
| Node background | `#fff` |
| Node border | `#7a8fa0` |
| Name text | `#1e293b` |
| Spouse text | `#64748b` |
| Stub line / expand arrow | `#94a3b8` |
| Male gender dot | `#60a5fa` |
| Female gender dot | `#f472b6` |
| Dimmed (unselected) opacity | `0.15` |
