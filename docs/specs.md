## Core workflows and plugin logic

### 1. Plugin initialization workflow
- On load: detect OS theme, load user preferences, initialize UI, render initial preview
- State: starts in create mode with preview expanded
- Key actions: theme detection, preference loading, initial render

### 2. Create mode workflow
Purpose: Create a new math expression and place it on the Figma canvas

Flow:
1. User enters TeX → auto-render preview
2. User adjusts styling (colors, font size, display mode) → preview updates
3. User adds sub-expression styles → preview updates with colors
4. User clicks "Place" → creates new Figma node with SVG

State transitions:
- `mode: 'create'`
- `hasNodeLoaded: false`
- `currentNodeId: null`
- Preview expanded by default
- "Place" button visible

### 3. Edit mode workflow
Purpose: Edit an existing math expression node in Figma

Flow:
1. User selects node with plugin data → switch to edit mode
2. Plugin loads node data → populate UI with saved render options
3. User edits → real-time debounced updates to Figma node
4. User can click "Locate" → scrolls viewport to node

State transitions:
- `mode: 'edit'`
- `hasNodeLoaded: true`
- `currentNodeId: <node-id>`
- Edit mode indicator visible
- Preview collapsed by default
- "Place" button hidden
- Draft state saved before switching

### 4. Mode switching workflow
Purpose: Preserve work when switching between create/edit modes

Flow:
- Create → Edit: Save current state as draft, load node data, switch UI
- Edit → Create: Clear node tracking, restore draft state, switch UI

State management:
- `draftState` preserves unplaced work
- Prevents data loss when switching modes

### 5. Rendering workflow
Purpose: Render TeX to SVG with optimization

Two render paths:

A. Full render (`renderMath()`)
- Trigger: TeX content changes OR display mode changes
- Process: Clear output → MathJax typeset → Apply styling → Update Figma (if in edit mode)
- State tracking: Updates `lastRenderedTex`, `lastRenderedDisplay`

B. Styling-only update (`updateStyling()`)
- Trigger: Only styling changes (colors, font size, sub-expressions)
- Process: Update existing SVG DOM without re-typesetting
- Optimization: Avoids expensive MathJax re-render

Smart dispatcher (`convert()`):
- Compares current state to `lastRenderedTex`/`lastRenderedDisplay`
- Routes to full render or styling update

### 6. Real-time update workflow
Purpose: Sync changes to Figma in edit mode

Flow:
1. User makes change → `convert()` or `updateStyling()` called
2. Check `isLoadingNodeData` flag → skip if loading
3. Debounce (300ms) → `debouncedUpdate()`
4. Prepare message data → extract SVG, normalize colors, calculate scale
5. Send to Figma → update existing node

Debouncing:
- Prevents excessive updates during rapid input
- Uses `updateTimer` to coalesce updates

### 7. Sub-expression styling workflow
Purpose: Style specific parts of a math expression

Flow:
1. User adds sub-expression row → enter TeX expression
2. User selects color → preview updates
3. User optionally specifies occurrences → style specific matches
4. Validation: Check if expression exists in rendered math
5. Error handling: Show errors for invalid expressions/occurrences

Technical details:
- Uses MathJax to render sub-expression and match against main render
- Tree matching algorithm finds occurrences
- Applies colors via SVG DOM manipulation
- Supports occurrence filtering (e.g., "1,3" for first and third match)

### 8. Preference persistence workflow
Purpose: Save and restore user preferences

Flow:
- Save: On any change → `saveUserPreferences()` → send to backend → store in `clientStorage`
- Load: On initialization → backend loads → send to UI → apply to form

Data stored:
- TeX source
- Display mode
- Font size
- Colors (background, font)
- Sub-expression styles

### 9. Node data loading workflow
Purpose: Load plugin data when selecting a node

Flow:
1. Backend detects selection → checks for plugin data (walks up parent tree)
2. If found → send `loadNodeData` message with `texSource` and `renderOptions`
3. Frontend receives → set `isLoadingNodeData: true` → apply to UI → render → reset flag

Critical timing:
- `isLoadingNodeData` flag prevents update loops
- Uses `setTimeout` hack (fragile) to reset flag after render completes
- This is a key refactoring target

### 10. Theme management workflow
Purpose: Support dark/light themes

Flow:
- Initial: Detect OS preference → apply theme → set default colors
- Runtime: Backend sends theme change → update UI → re-render with new colors

Theme application:
- Updates color inputs to theme defaults
- Syncs color pickers with text inputs
- Maintains `currentTheme` state

### 11. Color management workflow
Purpose: Normalize and validate colors

Flow:
- User input → expand shorthand (e.g., "F" → "FFFFFF") → normalize to 6-digit hex
- Sync between color picker (# prefix) and text input (no prefix)
- Validation: Ensure valid hex format
- Backend conversion: Hex → RGB for Figma API

### 12. Error handling workflow
Purpose: Validate sub-expression styling

Flow:
- Expression not found → show error in UI row
- Invalid occurrence number → show range error
- Clear errors when valid

Error callbacks:
- `showError(rowIndex, field, message)`
- `clearError(rowIndex, field)`
- `clearAllErrors()`

## State dependencies and constraints

Critical state variables:
- `currentTheme` — affects default colors
- `lastRenderedTex` / `lastRenderedDisplay` — render optimization
- `currentSVGWrapper` — DOM reference for styling updates
- `hasNodeLoaded` / `currentNodeId` — edit mode tracking
- `isLoadingNodeData` — prevents update loops (fragile)
- `draftState` — preserves work during mode switches
- `updateTimer` — debouncing

Constraints:
- DOM as source of truth (fragile)
- Two-way sync between DOM and state managers
- Flag-based async loading (race conditions)
- Multiple state locations (module vars, manager, DOM)

## Key specifications summary

1. Dual-mode operation: Create (new nodes) vs Edit (existing nodes)
2. Optimized rendering: Full render vs styling-only updates
3. Real-time sync: Debounced updates to Figma in edit mode
4. Sub-expression styling: Match and color specific parts
5. State preservation: Draft state during mode switches
6. Preference persistence: Save/load user defaults
7. Theme support: Dark/light with OS detection
8. Color normalization: Hex expansion and validation
