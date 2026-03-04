# Family Tree Canvas Behavior Reference

This document describes the expected behavior for the Family tree view, based on the current implementation. Use this as a reference when modifying or re-implementing the feature.

## Tree Load / Initial View

- Selecting a tree triggers a full reload: `visibleStartDepth` resets to 0, focus is cleared, data is fetched, and the tree is rebuilt.
- The initial view is right-anchored: the tree's max X is aligned to the right edge (minus strip width/padding), with top padding of `40 + STUB_LEN`.
- Generation strip labels are computed as `rootGeneration + visibleStartDepth + depth`.
- Strip positions (`screenY` and `cellHeight`) are derived from the current zoom transform.

## Visible Window and Depth

- Only a window of generations is rendered: `visibleStartDepth` through `visibleStartDepth + maxVisibleDepth - 1`.
- When `visibleStartDepth > 0`, a synthetic root is created so the visible range remains a valid tree for layout.

## Layout and Rendering

- X layout is computed by `layoutSubtree`, spacing siblings by `NODE_GAP` and aligning a parent to its last child X.
- Each node renders:
  - Name box (height depends on name/spouse length)
  - Gender dot (blue/pink)
  - Death marker if `isAlive === false`
  - Hidden-children stub `▼` when `hasHiddenChildren` is true
- Links are vertical-horizontal-vertical paths between parent and child boxes.
- If `visibleStartDepth > 0`, AA/AB stub lines are drawn to show parent connections above the window.
- Rendering uses keyed joins, so existing nodes/links move instead of full re-creation.

## Node Definition

- A node represents a `FamilyNode` with fields used in rendering: `id`, `name`, `gender`, `isAlive`, `spouses`, `children`, and `parentRels`.
- The box height is derived from the maximum name length of the person and the first spouse, using a fixed per-character height.
- The box width is a narrow card for single person, and a wider card when a spouse is present.
- The node's visual zones are anchored around `_y`:
  - `BOX_Y_OFFSET` is the top of the name box relative to `_y`.
  - A stub line above (`AA`) and below (`AC`) is used to connect to the sibling connector.
- Hidden-children stub `▼` appears only when `hasHiddenChildren` is true (children exist but not currently visible).

## Generation Strip Definition

- The strip is a UI overlay on the right side that labels each visible generation.
- Each strip cell corresponds to one depth in the visible window and displays `第{rootGen + visibleStartDepth + depth}世`.
- Strip cell top/bottom is calculated from the tree coordinate system:
  - Cell top is the AB sibling line of that generation.
  - Cell bottom is the midpoint between this generation's box bottom and the next generation's box top.
- Screen positions (`screenY`, `cellHeight`) are derived by applying the current zoom transform to the tree-coordinate top/bottom values.
- The strip has its own up/down arrow controls; these shift the visible window but should not re-center the view.

## View / Camera Behavior

- The view is anchored to the right edge using `alignViewRight()`.
- `lastTransformRef` stores the current zoom transform and is reused after redraws.
- Drag/zoom pan constraints keep the tree inside horizontal and vertical bounds.
- The generation strip updates on drag end to avoid heavy React redraws during panning.
- Programmatic moves (e.g., shift up/down) update the strip immediately.

## Click: Up / Down (Generation Strip)

- Up/down changes `visibleStartDepth` by +/- 1.
- Direction is stored with `setShiftDirection()`.
- If there is a focused/selected person, they are stored as a pending highlight and re-centered after redraw.
- The view remains right-anchored; the strip must not jump to top-right.

## Click: Person Node

- Selecting a node highlights its ancestor chain and descendants.
- The person detail panel opens/updates.
- The view position does not change automatically.

## Click: Down Arrow Under a Person (Hidden Children)

- Appears only if `hasHiddenChildren` is true.
- Expands depth around that person and shifts the visible window to keep them visible.
- Sets a pending highlight for the person and re-centers after redraw.
- This is a depth expansion, not a global generation shift.

## Highlighting Rules

- Highlight includes the full ancestor path and all descendants of the selected node.
- Non-highlighted nodes and links are dimmed using `COLORS.dimOpacity`.
- Nodes should not appear gray unless they are intentionally dimmed by this highlight state.

## Expected UX Summary

- Initial view starts at the rightmost content.
- Strip up/down shifts the generation window without re-centering left.
- Person expand reveals descendants within the current view window.
- Dragging is smooth; strip catches up on drag end.
- Nodes should not randomly disappear or gray out.
