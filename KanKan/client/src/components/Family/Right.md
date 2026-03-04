# Family Tree Animation — Correct Behavior Specification

## Overview

When clicking the ▼ (next generation) button on the gen strip, the tree animates to reveal the next generation. The animation should feel like the tree is being "drawn" in real-time, one node at a time, expanding from right to left.

## Visual Behavior

### 1. View Position
- **Before click**: The screen shows whatever the user is currently looking at. The view position (pan/zoom) should NOT change when clicking ▼.
- **During animation**: The view stays exactly where it was. New nodes appear at their correct positions in tree coordinates. If the new nodes are off-screen (to the right), the user can manually scroll to see them.
- **After animation**: The view stays where it was. The user can freely pan/zoom.

### 2. Gen Strip (世代条带)
- The strip is on the right side of the screen, showing generation labels (第X世).
- **Before click**: Strip shows N generations (e.g., 第3世, 第4世 for MAX_VISIBLE_DEPTH=2).
- **Immediately on click**: Strip should update to show the NEW generation count (one more generation added at bottom, one removed from top). This must happen BEFORE any node animation starts.
- **During animation**: Strip position and content must NOT move or flicker. It stays exactly where it was after the initial update.
- **After animation**: Strip remains in place. When the user pans/zooms, strip updates to track the tree position.
- **Key rule**: The strip's screen position is determined by the zoom transform. If the zoom transform doesn't change, the strip doesn't move.

### 3. Node Animation Sequence (Shift Down)

#### Step 0: Shift existing nodes up
- The top row (L0) fades out (these nodes are no longer in the visible window).
- Remaining nodes shift up one level: L1→L0, L2→L1, etc.
- Nodes that were at the bottom (old L_max) now have `hasHiddenChildren=true` and show the ▼ expand stub.
- **Right-alignment**: All nodes are right-aligned to `fullMaxX` (the rightmost position in the final full tree). This means the rightmost node stays fixed, and the tree grows to the LEFT as new nodes appear.

#### Steps 1..N: Reveal new nodes one by one
- New nodes appear globally from RIGHT to LEFT (sorted by descending `_x` in the full tree layout).
- Each new node:
  - Appears at its correct (x, y) position
  - Fades in (opacity 0→1)
  - Its parent-child link appears simultaneously
- Existing nodes that need to shift left (to make room) slide smoothly to their new positions.
- When a parent's children start appearing, the parent's ▼ expand stub is removed.

#### Timing
- `NODE_STEP_MS`: Delay between each new node (currently 50ms for fast animation).
- `FADE_MS`: Opacity transition duration (currently 120ms).
- `MOVE_MS`: Position slide transition duration (currently 220ms).
- `FADE_MS` and `MOVE_MS` should be <= `NODE_STEP_MS` to avoid transition conflicts.
- Named transitions (`'move'` and `'fade'`) prevent D3 transition conflicts.

### 4. Node Animation Sequence (Shift Up)
- Bottom row fades out.
- Remaining nodes shift down one level.
- New top-row nodes appear one by one, right to left.

## Layout & Coordinate System

### Tree Layout
- `layoutSubtree(node, leftEdge)`: Recursive layout starting from leftEdge=0, growing rightward.
- Parent node positioned at its RIGHTMOST child's x (Chinese genealogy convention: eldest on right).
- `NODE_GAP = 55`: Horizontal spacing between siblings.
- `LEVEL_HEIGHT = 150`: Vertical spacing between generations.

### Right Alignment (`alignRight`)
- During incremental animation, each step builds a partial tree (only revealed nodes).
- The partial tree is narrower than the full tree.
- `alignRight` shifts ALL nodes so the partial tree's rightmost node = `fullMaxX` (full tree's rightmost x).
- This ensures the right side of the tree stays fixed while new nodes expand to the left.
- **Critical**: Without `alignRight`, the tree would "jump right" each step as new nodes are added.

### Coordinate Mismatch Warning
- `fullNodes` (from `layoutSubtree(fullRoot, 0)`) has coordinates [0, fullMaxX].
- Incremental step trees (after `alignRight`) have coordinates [fullMaxX - stepWidth, fullMaxX].
- These coordinate systems are DIFFERENT for the same node IDs.
- `prevPosRef` stores the ALIGNED coordinates, so D3 data join transitions work correctly.
- **Never mix unaligned `fullNodes` coordinates with aligned step coordinates in the same render.**

## Pan/Zoom Constraints

### `panBoundsRef`
- Stores `{minX, maxX}` of the currently rendered nodes.
- Updated by `renderLayout` after each step.
- Used by zoom handler to constrain horizontal panning.
- Must always match the actual rendered node coordinates (aligned, not original).

### Zoom Handler Behavior
- **Not animating**: Apply pan constraints using `panBoundsRef`.
  - If tree wider than viewport: clamp `cx` to keep tree visible.
  - If tree fits in viewport: center tree horizontally.
  - Y-axis: similar clamping/centering based on `maxDepthRef`.
- **Animating**: Skip constraints entirely — let the view stay where it was.

### `updateGenStrip`
- Called from zoom handler to recompute strip cell positions.
- **Not animating**: Update strip on every zoom event.
- **Animating**: Do NOT update strip (to prevent flicker/jumping).
- After animation ends: Update strip once with the correct transform.

## D3 Data Join Details

### Node Elements (`.node`)
- Keyed by `d.data.id` (person UUID).
- **Enter**: Create `<g>` with opacity 0 (if animated), render content via `renderNodeContent`.
- **Update**: Only remove `.expand-stub` if `hasHiddenChildren` changed to false. Do NOT rebuild entire content.
- **Exit**: Fade out + remove.

### Link Elements (`.link`)
- Keyed by `linkKey(d)` = `"sourceId->targetId"`.
- **Enter**: Create `<path>` with opacity 0 (if animated).
- **Update**: Transition path `d` attribute to new positions.
- **Exit**: Remove immediately.

### Stub Lines (`.stub-line`)
- For AA (ancestor) and AB (sibling) connectors above the top row.
- Keyed by string key.

### Named Transitions
- `'move'`: Position changes (transform, path d).
- `'fade'`: Opacity changes (enter/exit).
- Using named transitions prevents D3 from replacing one transition with another on the same element.

## Error-Prone Areas

1. **`maxDepthRef`**: Must be set from full tree at start of `drawTree`, NOT by `renderLayout`. Otherwise incremental steps with fewer depth levels would shrink the strip.

2. **Final render step**: Do NOT render `fullNodes` at the end — their coordinates are unaligned. The last incremental step already contains all nodes with correct aligned coordinates.

3. **`applyHighlight`**: Must NOT run during animation — it uses unnamed transitions that conflict with named `'fade'` transitions, and `attr('opacity')` vs `style('opacity')` CSS precedence issues cause nodes to disappear.

4. **Transform resets**: The redraw useEffect must NOT call `svg.call(zoom.transform, oldTransform)` during animation — this would override the animation's view position.

5. **`buildVisibleTreeWithReveal`**: Traverses from `visibleStartDepth`. Nodes above that depth are not included even if they're in `revealSet`. Parent nodes at `visibleStartDepth` must be in `revealSet` for their children to be reachable.
