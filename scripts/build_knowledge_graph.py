"""Build + visualize the PaperQuest knowledge graph (concepts + careers)
from scripts/export-knowledge-graph.js output, using graphify's own engine.
Communities are SEMANTIC (branch / career hubs), not Louvain — they mirror
the app's own branch vocabulary so colors mean something. Tiny branches
(<4 nodes) merge into 'other' so the legend stays readable."""
import json
from collections import Counter
from pathlib import Path
from graphify.build import build_from_json
from graphify.export import to_json, to_html

out = Path('graphify-out/knowledge')
raw = json.loads((out / 'extract.json').read_text(encoding='utf-8'))
branch_of = raw.pop('x_branches', {})

G = build_from_json(raw, root='.', directed=False)
if G.number_of_nodes() == 0:
    raise SystemExit('ERROR: empty knowledge graph — add/analyze a paper or career first.')

# build_from_json prefixes some ids with the relativized source-file stem
# (e.g. project_x -> data_projects_<id>_project_x); resolve by suffix.
def branch_lookup(nid):
    if nid in branch_of:
        return branch_of[nid]
    for k, v in branch_of.items():
        if nid.endswith(k):
            return v
    return 'other'
resolved = {nid: branch_lookup(nid) for nid in G.nodes()}
counts = Counter(resolved.values())
MIN = 4
def bucket(nid):
    b = resolved[nid]
    return b if counts[b] >= MIN or b == 'projects & careers' else 'other'

by_bucket = {}
for nid in G.nodes():
    by_bucket.setdefault(bucket(nid), []).append(nid)
# biggest branches first so they get the strongest palette colors; 'other' last
ordered = sorted(by_bucket, key=lambda b: (b == 'other', -len(by_bucket[b])))
communities = {i: by_bucket[b] for i, b in enumerate(ordered)}
labels = {i: b.title() for i, b in enumerate(ordered)}

to_json(G, communities, str(out / 'graph.json'), community_labels=labels, force=True)
to_html(G, communities, str(out / 'graph.html'), community_labels=labels)
sizes = ', '.join(f"{labels[i]}:{len(communities[i])}" for i in sorted(communities))
print(f'Knowledge graph: {G.number_of_nodes()} nodes, {G.number_of_edges()} edges, {len(communities)} communities -> {out}/graph.html')
print('communities:', sizes)
