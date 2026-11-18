# Graph Report - GIOCO F1  (2026-11-17)

## Corpus Check
- Corpus is ~260 words - fits in a single context window. You may not need a graph.

## Summary
- 10 nodes · 11 edges · 3 communities
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Agent Inspection Rules
- Query & Index Maintenance
- Knowledge Graph Artifacts

## God Nodes (most connected - your core abstractions)
1. `Graphify Knowledge Graph Rules` - 6 edges
2. `graphify-out/` - 4 edges
3. `graphify-out/graph.json` - 3 edges
4. `graphify query` - 2 edges
5. `graphify update` - 2 edges
6. `graphify-out/wiki/index.md` - 1 edges
7. `graphify-out/GRAPH_REPORT.md` - 1 edges
8. `graphify path` - 1 edges
9. `graphify explain` - 1 edges
10. `graphify section` - 1 edges

## Surprising Connections (you probably didn't know these)
- `Graphify Knowledge Graph Rules` --references--> `graphify-out/`  [EXTRACTED]
  CLAUDE.md → CLAUDE.md  _Bridges community 0 → community 2_
- `Graphify Knowledge Graph Rules` --references--> `graphify query`  [EXTRACTED]
  CLAUDE.md → CLAUDE.md  _Bridges community 0 → community 1_
- `graphify-out/` --references--> `graphify-out/graph.json`  [EXTRACTED]
  CLAUDE.md → CLAUDE.md  _Bridges community 2 → community 1_

## Hyperedges (group relationships)
- **Graphify Query CLI Commands** — claude_graphify_query, claude_graphify_path, claude_graphify_explain, claude_graphify_section [EXTRACTED 1.00]

## Communities (3 total, 0 thin omitted)

### Community 0 - "Agent Inspection Rules"
Cohesion: 0.50
Nodes (4): Graphify Knowledge Graph Rules, graphify explain, graphify path, graphify section

### Community 1 - "Query & Index Maintenance"
Cohesion: 0.67
Nodes (3): graphify-out/graph.json, graphify query, graphify update

### Community 2 - "Knowledge Graph Artifacts"
Cohesion: 0.67
Nodes (3): graphify-out/GRAPH_REPORT.md, graphify-out/, graphify-out/wiki/index.md

## Knowledge Gaps
- **5 isolated node(s):** `graphify-out/wiki/index.md`, `graphify-out/GRAPH_REPORT.md`, `graphify path`, `graphify explain`, `graphify section`
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 5 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Graphify Knowledge Graph Rules` connect `Agent Inspection Rules` to `Query & Index Maintenance`, `Knowledge Graph Artifacts`?**
  _High betweenness centrality (0.681) - this node is a cross-community bridge._
- **What connects `graphify-out/wiki/index.md`, `graphify-out/GRAPH_REPORT.md`, `graphify path` to the rest of the system?**
  _5 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Why does `graphify-out/` connect `Knowledge Graph Artifacts` to `Agent Inspection Rules`, `Query & Index Maintenance`?**
  _High betweenness centrality (0.454) - this node is a cross-community bridge._
- **Why does `graphify-out/graph.json` connect `Query & Index Maintenance` to `Knowledge Graph Artifacts`?**
  _High betweenness centrality (0.097) - this node is a cross-community bridge._