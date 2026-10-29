# Offline evidence graph display

`js/graph-view.js` exposes `PBGC.buildGraphViewModel(graph)` and `PBGC.renderEvidenceGraph(container, graph, {onSelect})`. CommonJS exports support development tests. There are no external runtime dependencies or network calls.

```js
const model = PBGC.renderEvidenceGraph(container, caseData.graph, {
  onSelect(nodeId) {
    // Resolve this ID only against the current case, then show exact evidence and locators.
    showCurrentCaseEvidence(nodeId);
  }
});
```

The optional callback is a trusted runtime function and receives only a string node ID. User data never supplies code. The renderer validates before replacing the supplied container; invalid graphs leave its existing content intact. It uses `createElementNS`, presentation attributes, and `textContent`, never HTML interpretation, `innerHTML`, `eval`, external images, or embedded documents.

The SVG includes focusable `role="button"` nodes with accessible labels, visible focus strokes, selected states, click/Enter/Space activation, directed links, recorded edge types, and source/record provenance in accessible edge names. Long visual labels are shortened with full labels retained in accessible names and SVG titles. Hostile labels remain literal text. Palette values use the shell's CSS variables through SVG presentation attributes; no inline style allowance is required. Empty graphs show explicit instructions.

Node order and grid positions are deterministic by exact code-unit ID ordering. The layout is a display convenience, not a hierarchy of evidence authority. Each node retains its ID, available source/record IDs, locators, type, status, and case metadata in the view model. Each link retains its ID, endpoints, recorded type, status, source/record IDs, and validity metadata. Missing node statuses display `unreviewed`; missing edge statuses display `proposed`. Existing status strings are recorded metadata, never authenticated approval or official acceptance.

## Caps and boundaries

The full graph is not mutated. At most 100 nodes and 200 edges are displayed. Nodes are sorted before selection; edges with undisplayed endpoints are omitted, then the selected edge set is capped. A status paragraph and returned `truncated`, `omittedNodes`, and `omittedEdges` counts make omissions explicit. `totalNodes` and `totalEdges` retain the full input counts. The capped drawing is not a query result and must not be treated as exhaustive evidence.

Input limits are 10,000 nodes, 50,000 edges, eight MiB of strings, one million JSON values, and depth 20. Unique nonempty bounded IDs, existing endpoints, edge type, source and record provenance, valid date intervals, and consistent optional case IDs are required. Plain JSON only: cycles, accessors, prototype keys, invalid values, and excessive arrays reject. Only graph structure is available here: source/record membership and hash integrity must be verified by the case validation/package modules before use. The graph drawing does not infer legal priority, activate rules, resolve contradictions, or validate official outputs.

The view model returns `{schemaVersion,caseId?,nodes,edges,totalNodes,totalEdges,omittedNodes,omittedEdges,truncated,width,height,interpretation}`. Node `x` and `y` are SVG layout coordinates; they are not document bounding boxes or source locators.

## Verification

- `node --test --test-isolation=none tests/graph-view.test.js`: detached deterministic model, provenance, caps, unsupported graphs, hostile trees/labels, date/case consistency, renderer guards.
- `PBGC_HTTP_CHECK=1 node tests/graph-browser.cjs`: real Chromium SVG DOM, keyboard/click selection, focus, dark/light palette, inert markup, cap/empty/error behavior, and zero external requests. It requires the browser's normal process/socket permissions outside the command sandbox.
- `node tests/graph-browser.cjs` defaults to actual `file://`. Managed cloud policy currently blocks file navigation. A secondary HTTP pass does not satisfy mandatory file-origin or Windows enterprise-browser acceptance. No policy bypass is performed.


### Text fit (0.4.2)

The browser measures node text after the SVG is attached. Labels use a maximum
width of 196 SVG units. Long labels end with an ellipsis. Clipping prevents text
from crossing the inner node bounds. Full labels remain in accessible text and
tooltips. Source records are unchanged. A scroll area keeps the graph text at its
normal size on small screens. Playwright checks actual text bounds and screenshots
at 1280, 640 and 375 pixel widths in both themes. This is not a browser-zoom test.
