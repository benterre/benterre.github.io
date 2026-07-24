/* ================== GLOBAL SETTINGS ================== */
const HEX = 35;
const HEX_COLORS = {
    plain: "rgb(254,128,129)",
    vertical: "#fff",
    diagNE: "rgb(122,200,239)",
    diagNW: "rgb(131,195,160)",
    hoverQuad: "rgba(255,200,0,0.35)",
    hoverEdge: "#f39c12"
};

/* ================== SVG & LAYERS ================== */
let WIDTH = window.innerWidth;
let HEIGHT = window.innerHeight;
let mode = "drag";   // "drag" | "place" | "dual"
let selectedTile = null;
const minXY = -1000;
const maxXY = 2000;

const svg = d3.select("#svg").attr("width", WIDTH).attr("height", HEIGHT);

const zoomGroup = svg.append("g");
const backgroundLayer = zoomGroup.append("g");
const faceLayer = zoomGroup.append("g");
const edgeLayer = zoomGroup.append("g");
const bwVertexLayer = zoomGroup.append("g");
const labelLayer = zoomGroup.append("g");   // face_id labels
const ghostLayer = zoomGroup.append("g");
const fdLayer = zoomGroup.append("g");

/* ================== ZOOM FEATURE ================== */
const zoom = d3.zoom()
    .scaleExtent([0.2, 6])
    .filter(event => {
        if (event.type === "wheel") return true;
        if (event.type === "mousedown") return mode === "drag";
        return false;
    })
    .on("zoom", (event) => {
        zoomGroup.attr("transform", event.transform);
    });

svg.call(zoom);

d3.select("#zoomIn").on("click", () => { svg.transition().call(zoom.scaleBy, 1.3); });
d3.select("#zoomOut").on("click", () => { svg.transition().call(zoom.scaleBy, 0.75); });
d3.select("#zoomHome").on("click", () => {
    svg.transition().call(zoom.transform, d3.zoomIdentity);
});

d3.select("#ui")
    .on("mouseenter", () => svg.on(".zoom", null))
    .on("mouseleave", () => svg.call(zoom));

function wrapToFundamentalDomain(pt) {

    const O = fdOriginPx;

    // Basis vectors
    const a1 = {
        x: fdTip1.x - O.x,
        y: fdTip1.y - O.y
    };

    const a2 = {
        x: fdTip2.x - O.x,
        y: fdTip2.y - O.y
    };

    // Translate point so O is origin
    const px = pt[0] - O.x;
    const py = pt[1] - O.y;

    // Solve:
    // px = u*a1 + v*a2

    const det = a1.x * a2.y - a1.y * a2.x;

    if (Math.abs(det) < 1e-10) return pt; // degenerate case

    const u = ( px * a2.y - py * a2.x) / det;
    const v = (-px * a1.y + py * a1.x) / det;

    // Wrap into [0,1)
    const uWrapped = u - Math.floor(u);
    const vWrapped = v - Math.floor(v);

    // Convert back to world coordinates
    return [
        O.x + uWrapped * a1.x + vWrapped * a2.x,
        O.y + uWrapped * a1.y + vWrapped * a2.y
    ];
}

svg.on("click", e => {

    if (mode !== "place" || !selectedTile) return;

    const [sx, sy] = d3.pointer(e);

    // Screen → world
    const world = d3.zoomTransform(svg.node()).invert([sx, sy]);

    // Wrap into fundamental domain
    const wrapped = wrapToFundamentalDomain(world);

    // Snap to hex lattice
    const h = pixelToHex(wrapped[0], wrapped[1]);

    placeTile(h.q, h.r, selectedTile);
    render();
});

svg.on("mousemove", (event) => {
    if (mode !== "place" || !selectedTile) {
        ghost.style("display", "none");
        return;
    }
    const [sx, sy] = d3.pointer(event);
    const pt = d3.zoomTransform(svg.node()).invert([sx, sy]);
    const h = pixelToHex(pt[0], pt[1]);
    const pts = hexVertices(h.q, h.r).map(p => `${p.x},${p.y}`).join(" ");
    ghost.attr("points", pts)
        .attr("fill", HEX_COLORS[selectedTile])
        .style("display", "block");
});

svg.on("mouseleave", () => ghost.style("display", "none"));

/* ================== GHOST ================= */
const ghost = ghostLayer.append("polygon").attr("fill", "rgba(0,0,0,0.15)").attr("stroke", "#000");

/* ================== MENU ITEMS ================== */
function miniHexSVG(type) {
    const size = 32;
    const center = { x: 45, y: 45 };
    const verts = [];
    for (let i = 0; i < 6; i++) {
        const a = 2 * Math.PI / 6 * i - Math.PI / 6 + ROT;
        verts.push({ x: center.x + size * Math.cos(a), y: center.y + size * Math.sin(a) });
    }
    let lines = "";
    if (type !== "plain") {
        let i = type === "vertical" ? 0 : type === "diagNE" ? 2 : 1;
        const a = verts[i], b = verts[(i + 3) % 6];
        lines = `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="#000" stroke-width="2"/>`;
    }
    const poly = verts.map(v => `${v.x},${v.y}`).join(" ");
    return `<svg viewBox="0 0 90 90" width="90" height="90">
        <polygon points="${poly}" fill="${HEX_COLORS[type]}" stroke="#000" stroke-width="2"/>
        ${lines}
    </svg>`;
}

function buildTilePalette() {
    const tiles = ["plain", "vertical", "diagNE", "diagNW"];
    const palette = d3.select("#tilePalette");
    palette.selectAll("*").remove();
    tiles.forEach(t => {
        palette.append("div")
            .attr("class", "tile-button" + (selectedTile === t ? " selected" : ""))
            .html(miniHexSVG(t))
            .style("cursor", "pointer")
            .on("click", () => { selectTile(t); });
    });
}

/* ================== HEX GRID HELPERS ================== */
const ROT = Math.PI / 6; // 30° rotation

function rotateCW({ x, y }) {
    return { x: x * Math.cos(ROT) - y * Math.sin(ROT), y: x * Math.sin(ROT) + y * Math.cos(ROT) };
}
function rotateCCW({ x, y }) {
    return { x: x * Math.cos(-ROT) - y * Math.sin(-ROT), y: x * Math.sin(-ROT) + y * Math.cos(-ROT) };
}
function hexToPixel(q, r) {
    const p = { x: HEX * (Math.sqrt(3) * q + Math.sqrt(3) / 2 * r), y: HEX * (3 / 2 * r) };
    return rotateCW(p);
}
function pixelToHex(x, y) {
    const p = rotateCCW({ x, y });
    const q = (Math.sqrt(3) / 3 * p.x - 1 / 3 * p.y) / HEX;
    const r = (2 / 3 * p.y) / HEX;
    return hexRound(q, r);
}
function hexRound(q, r) {
    let x = q, z = r, y = -x - z;
    let rx = Math.round(x), ry = Math.round(y), rz = Math.round(z);
    const dx = Math.abs(rx - x), dy = Math.abs(ry - y), dz = Math.abs(rz - z);
    if (dx > dy && dx > dz) rx = -ry - rz;
    else if (dy > dz) ry = -rx - rz;
    else rz = -rx - ry;
    return { q: rx, r: rz };
}
function hexVertices(q, r) {
    const { x, y } = hexToPixel(q, r);
    const out = [];
    for (let i = 0; i < 6; i++) {
        const a = Math.PI / 3 * i - Math.PI / 6 + ROT;
        out.push({ x: x + HEX * Math.cos(a), y: y + HEX * Math.sin(a) });
    }
    return out;
}

/* ================== GRAPH DATA ================== */
const Graph = { vertices: new Map(), edges: new Map(), faces: new Map() };

function vKey(x, y) { return `${x.toFixed(3)},${y.toFixed(3)}`; }
function getVertex(x, y) {
    const k = vKey(x, y);
    if (!Graph.vertices.has(k)) Graph.vertices.set(k, { id: k, x, y });
    return Graph.vertices.get(k);
}
function getEdge(a, b) {
    const id = [a.id, b.id].sort().join("--");
    if (!Graph.edges.has(id)) Graph.edges.set(id, { id, a: a.id, b: b.id });
    return Graph.edges.get(id);
}

/* ================== TILE PLACEMENT ================== */
function placePlainHex(q, r) {
    const v = hexVertices(q, r).map(p => getVertex(p.x, p.y));
    for (let i = 0; i < 6; i++) getEdge(v[i], v[(i + 1) % 6]);
    Graph.faces.set(crypto.randomUUID(), {
        id: crypto.randomUUID(), verts: v.map(x => x.id), quad: false,
        color: HEX_COLORS.plain, hex_q: q, hex_r: r, kind: "plain"
    });
}
function placeCrossedHex(q, r, kind) {
    const v = hexVertices(q, r).map(p => getVertex(p.x, p.y));
    let i = kind === "vertical" ? 0 : kind === "diagNE" ? 2 : 1;
    for (let k = 0; k < 6; k++) getEdge(v[k], v[(k + 1) % 6]);
    getEdge(v[i], v[(i + 3) % 6]);
    const f1 = [v[i], v[(i + 1) % 6], v[(i + 2) % 6], v[(i + 3) % 6]];
    const f2 = [v[(i + 3) % 6], v[(i + 4) % 6], v[(i + 5) % 6], v[i]];
    const color = kind === "diagNE" ? HEX_COLORS.diagNE : kind === "diagNW" ? HEX_COLORS.diagNW : HEX_COLORS.vertical;
    // hex_sub distinguishes the two quads (same hex centre, different canonical key → different face_id)
    Graph.faces.set(crypto.randomUUID(), { id: crypto.randomUUID(), verts: f1.map(x => x.id), quad: true, color, hex_q: q, hex_r: r, hex_sub: 0, kind });
    Graph.faces.set(crypto.randomUUID(), { id: crypto.randomUUID(), verts: f2.map(x => x.id), quad: true, color, hex_q: q, hex_r: r, hex_sub: 1, kind });
}
// Remove every face equivalent to hex (q, r) on the torus — the tile may have
// been placed at a different periodic copy of this hex (the click handler
// wraps into the FD, so a click near the boundary can snap to a copy).
// Edges shared with a neighbouring face are kept; only truly unused ones are pruned.
function removeTileAt(q, r) {
    const targetKey = canonicalHexKey(q, r);
    const hexVertIds = new Set(hexVertices(q, r).map(p => vKey(p.x, p.y)));

    // 1. Delete every face at a hex equivalent to (q, r) mod the FD lattice.
    //    Faces without a parent hex (urban renewal) match by exact corners.
    const removedVertIds = new Set();
    const faceKeysToRemove = [];
    Graph.faces.forEach((face, key) => {
        const match = face.hex_q != null
            ? canonicalHexKey(face.hex_q, face.hex_r) === targetKey
            : face.verts.every(id => hexVertIds.has(id));
        if (match) {
            faceKeysToRemove.push(key);
            face.verts.forEach(id => removedVertIds.add(id));
        }
    });
    faceKeysToRemove.forEach(key => Graph.faces.delete(key));
    pruneOrphans(removedVertIds);
}

// After faces have been deleted, drop edges that connected only removed faces
// and are no longer referenced, then drop vertices left with no edge.
function pruneOrphans(removedVertIds) {
    const usedEdgeIds = new Set();
    Graph.faces.forEach(face => {
        for (let i = 0; i < face.verts.length; i++) {
            const a = face.verts[i], b = face.verts[(i + 1) % face.verts.length];
            usedEdgeIds.add([a, b].sort().join("--"));
        }
    });

    const edgeKeysToRemove = [];
    Graph.edges.forEach((edge, key) => {
        if (removedVertIds.has(edge.a) && removedVertIds.has(edge.b) && !usedEdgeIds.has(key))
            edgeKeysToRemove.push(key);
    });
    edgeKeysToRemove.forEach(key => Graph.edges.delete(key));

    const usedVertIds = new Set();
    Graph.edges.forEach(e => { usedVertIds.add(e.a); usedVertIds.add(e.b); });
    removedVertIds.forEach(id => { if (!usedVertIds.has(id)) Graph.vertices.delete(id); });
}

// is hex (q, r) the canonical representative, i.e. inside the FD parallelogram?
function hexInsideFD(q, r) {
    const O = fdOriginPx;
    const a1x = fdTip1.x - O.x, a1y = fdTip1.y - O.y;
    const a2x = fdTip2.x - O.x, a2y = fdTip2.y - O.y;
    const det = a1x * a2y - a1y * a2x;
    if (Math.abs(det) < 1e-10) return false;
    const p = hexToPixel(q, r);
    const dx = p.x - O.x, dy = p.y - O.y;
    const s = (dx * a2y - dy * a2x) / det;
    const t = (a1x * dy - a1y * dx) / det;
    const eps = 1e-6;
    return s >= -eps && s < 1 - eps && t >= -eps && t < 1 - eps;
}

// After the FD is reshaped, tiles placed at previously distinct hexes may have
// become equivalent mod the new lattice (they overlap on the torus).  Keep a
// single tile per torus position — preferring the copy inside the new FD —
// and remove the others.  Returns true if anything was removed.
function dedupeTiles() {
    // canonical torus key → (plane hex "q,r" → [face map keys])
    const groups = new Map();
    Graph.faces.forEach((face, key) => {
        if (face.hex_q == null) return;
        const ck = canonicalHexKey(face.hex_q, face.hex_r);
        if (!groups.has(ck)) groups.set(ck, new Map());
        const g = groups.get(ck);
        const pk = `${face.hex_q},${face.hex_r}`;
        if (!g.has(pk)) g.set(pk, []);
        g.get(pk).push(key);
    });

    const faceKeysToRemove = [];
    const removedVertIds = new Set();
    groups.forEach(g => {
        if (g.size <= 1) return;
        let keepKey = null;
        for (const pk of g.keys()) {
            const [q, r] = pk.split(",").map(Number);
            if (hexInsideFD(q, r)) { keepKey = pk; break; }
        }
        if (keepKey == null) keepKey = g.keys().next().value;
        g.forEach((faceKeys, pk) => {
            if (pk === keepKey) return;
            faceKeys.forEach(fk => {
                Graph.faces.get(fk).verts.forEach(id => removedVertIds.add(id));
                faceKeysToRemove.push(fk);
            });
        });
    });
    if (faceKeysToRemove.length === 0) return false;

    faceKeysToRemove.forEach(key => Graph.faces.delete(key));
    pruneOrphans(removedVertIds);
    return true;
}

function placeTile(q, r, type) {
    removeTileAt(q, r);
    if (type === "plain") placePlainHex(q, r);
    else placeCrossedHex(q, r, type);

    updateAnalysis();
}

/* ================== URBAN RENEWAL ================== */
function deepCopyGraph() {
    const v = new Map(), e = new Map(), f = new Map();
    Graph.vertices.forEach((val, k) => v.set(k, { ...val }));
    Graph.edges.forEach((val, k) => e.set(k, { ...val }));
    Graph.faces.forEach((val, k) => f.set(k, { ...val, verts: [...val.verts] }));
    return { vertices: v, edges: e, faces: f };
}
function restoreGraph(g) { Graph.vertices = g.vertices; Graph.edges = g.edges; Graph.faces = g.faces; }
function collapseVertex(id) {
    const inc = [...Graph.edges.values()].filter(e => e.a === id || e.b === id);
    if (inc.length !== 2) return;
    const a = inc[0].a === id ? inc[0].b : inc[0].a;
    const b = inc[1].a === id ? inc[1].b : inc[1].a;
    Graph.faces.forEach(face => { face.verts = face.verts.map(v => v === id ? a : v); });
    Graph.edges.delete(inc[0].id);
    Graph.edges.delete(inc[1].id);
    getEdge(Graph.vertices.get(a), Graph.vertices.get(b));
    Graph.vertices.delete(id);
}
function hasBigon() { for (let f of Graph.faces.values()) { if (f.verts.length < 3) return true; } return false; }
function urbanRenewal(face) {
    if (!face.quad) return;
    const backup = deepCopyGraph();
    const vs = face.verts.map(id => Graph.vertices.get(id));
    for (let i = 0; i < 4; i++) Graph.edges.delete([vs[i].id, vs[(i + 1) % 4].id].sort().join("--"));
    const mid = vs.reduce((s, v) => ({ x: s.x + v.x / 4, y: s.y + v.y / 4 }), { x: 0, y: 0 });
    const newVerts = vs.map(v => getVertex((v.x + mid.x) / 2, (v.y + mid.y) / 2));
    Graph.faces.delete(face.id);
    const f0 = [vs[0], newVerts[0], newVerts[3], vs[3]];
    const f1 = [vs[1], newVerts[1], newVerts[0], vs[0]];
    const f2 = [vs[2], newVerts[2], newVerts[1], vs[1]];
    const f3 = [vs[3], newVerts[3], newVerts[2], vs[2]];
    [f0, f1, f2, f3].forEach(f => {
        Graph.faces.set(crypto.randomUUID(), { id: crypto.randomUUID(), verts: f.map(v => v.id), quad: true, color: face.color });
    });
    newVerts.forEach(v => collapseVertex(v.id));
    if (hasBigon()) { restoreGraph(backup); return; }

    updateAnalysis();
}

/* ================== FUNDAMENTAL DOMAIN ================== */

// screen-space (SVG viewport) → world, snapped to nearest hex lattice node
function snapToHex(sx, sy) {
    const pt = d3.zoomTransform(svg.node()).invert([sx, sy]);
    const h = pixelToHex(pt[0], pt[1]);
    return hexToPixel(h.q, h.r);
}

// The FD parallelogram:  corners = O, O+a1, O+a1+a2, O+a2
//   a1 = fdTip1 - O,   a2 = fdTip2 - O
const fdOriginPx = hexToPixel(10, 0);   // fixed origin on lattice
let fdTip1 = hexToPixel(15, -3);
let fdTip2 = hexToPixel(10, 3);

function cross2D(ax, ay, bx, by) { return ax * by - ay * bx; }
function isCollinear(t1, t2) {
    return Math.abs(cross2D(
        t1.x - fdOriginPx.x, t1.y - fdOriginPx.y,
        t2.x - fdOriginPx.x, t2.y - fdOriginPx.y
    )) < 1e-6;
}
function isZero(tip) {
    return Math.abs(tip.x - fdOriginPx.x) < 1e-6 && Math.abs(tip.y - fdOriginPx.y) < 1e-6;
}

function drawFD() {
    fdLayer.selectAll("*").remove();

    // Arrowhead marker (created once in SVG <defs>)
    let defs = svg.select("defs");
    if (defs.empty()) defs = svg.insert("defs", ":first-child");
    if (defs.select("#fd-arrowhead").empty()) {
        defs.append("marker")
            .attr("id", "fd-arrowhead")
            .attr("markerWidth", 8).attr("markerHeight", 8)
            .attr("refX", 6).attr("refY", 3)
            .attr("orient", "auto")
            .append("path")
            .attr("d", "M0,0 L0,6 L8,3 z")
            .attr("fill", "rgb(232,77,5)");
    }

    const O = fdOriginPx, T1 = fdTip1, T2 = fdTip2;
    const P3 = { x: T1.x + (T2.x - O.x), y: T1.y + (T2.y - O.y) };

    // Shaded parallelogram
    fdLayer.append("polygon")
        .attr("points", `${O.x},${O.y} ${T1.x},${T1.y} ${P3.x},${P3.y} ${T2.x},${T2.y}`)
        .attr("class", "fd-region");

    // Arrow 1
    fdLayer.append("line")
        .attr("x1", O.x).attr("y1", O.y).attr("x2", T1.x).attr("y2", T1.y)
        .attr("class", "fd-arrow").attr("marker-end", "url(#fd-arrowhead)");

    // Arrow 2
    fdLayer.append("line")
        .attr("x1", O.x).attr("y1", O.y).attr("x2", T2.x).attr("y2", T2.y)
        .attr("class", "fd-arrow").attr("marker-end", "url(#fd-arrowhead)");

    // Fixed origin dot
    fdLayer.append("circle").attr("cx", O.x).attr("cy", O.y).attr("r", 6).attr("class", "fd-origin");

    // On release of a tip drag, tiles that became equivalent under the new
    // lattice overlap on the torus — keep a single copy of each.
    function onTipDragEnd() {
        d3.select(this).attr("r", 7);
        if (dedupeTiles()) { render(); updateAnalysis(); }
    }

    // Draggable tip 1
    fdLayer.append("circle").attr("cx", T1.x).attr("cy", T1.y).attr("r", 7).attr("class", "fd-tip")
        .call(d3.drag()
            .on("start", function () { d3.select(this).attr("r", 9); })
            .on("drag", function (event) {
                const [sx, sy] = d3.pointer(event.sourceEvent, svg.node());
                const snapped = snapToHex(sx, sy);
                if (isZero(snapped) || isCollinear(snapped, fdTip2)) return;
                fdTip1 = snapped;
                drawFD(); render();
            })
            .on("end", onTipDragEnd)
        );

    // Draggable tip 2
    fdLayer.append("circle").attr("cx", T2.x).attr("cy", T2.y).attr("r", 7).attr("class", "fd-tip")
        .call(d3.drag()
            .on("start", function () { d3.select(this).attr("r", 9); })
            .on("drag", function (event) {
                const [sx, sy] = d3.pointer(event.sourceEvent, svg.node());
                const snapped = snapToHex(sx, sy);
                if (isZero(snapped) || isCollinear(fdTip1, snapped)) return;
                fdTip2 = snapped;
                drawFD(); render();
            })
            .on("end", onTipDragEnd)
        );

    updateAnalysis();
}

/* ================== FACE ID ================== */
// Each face stores hex_q/hex_r (the parent hex lattice position).
// We compute parallelogram coords (s,t) of that hex centre relative to fdOriginPx,
// then fold with modular arithmetic so tiles placed anywhere on the canvas still
// map to a unique id in [1..N].
// Both quads of a crossed hex share the same hex_q/hex_r, so they always get the same id.

// Fold a pixel point into the FD parallelogram and return a canonical string
// key.  Rounding to 6 decimals happens BEFORE the final mod so that values
// like 0.9999997 and 0.0000002 (the same lattice point seen from two periodic
// copies) both give "0.000000".
function fdFoldKey(px, py) {
    const O = fdOriginPx;
    const a1x = fdTip1.x - O.x, a1y = fdTip1.y - O.y;
    const a2x = fdTip2.x - O.x, a2y = fdTip2.y - O.y;
    const det = a1x * a2y - a1y * a2x;
    const dx = px - O.x, dy = py - O.y;
    const s = (dx * a2y - dy * a2x) / det;
    const t = (a1x * dy - a1y * dx) / det;
    const fold = v => (Math.round((((v % 1) + 1) % 1) * 1e6) / 1e6) % 1;
    return `${fold(s).toFixed(6)},${fold(t).toFixed(6)}`;
}

// canonical torus position of hex (q, r)
function canonicalHexKey(q, r) {
    const p = hexToPixel(q, r);
    return fdFoldKey(p.x, p.y);
}

function computeFaceIds() {
    // canonical key → face_id integer
    const canonicalMap = new Map();
    let counter = 1;

    Graph.faces.forEach(face => {
        // Reference point: parent hex centre if stored, else face centroid (fallback for
        // urban-renewed faces that don't carry hex_q/hex_r).
        let rx, ry;
        if (face.hex_q != null) {
            const p = hexToPixel(face.hex_q, face.hex_r);
            rx = p.x; ry = p.y;
        } else {
            rx = face.verts.reduce((s, id) => s + Graph.vertices.get(id).x, 0) / face.verts.length;
            ry = face.verts.reduce((s, id) => s + Graph.vertices.get(id).y, 0) / face.verts.length;
        }

        // Include hex_sub (0 or 1) so the two quads of a crossed hex get different ids,
        // while still sharing the same hex-centre reference point (boundary fix).
        const sub = face.hex_sub ?? 0;
        const key = `${fdFoldKey(rx, ry)},${sub}`;
        if (!canonicalMap.has(key)) canonicalMap.set(key, counter++);
        face.face_id = canonicalMap.get(key);
    });
}

/* ================== BACKGROUND GRID DOTS ================= */
function drawGridDots() {
    backgroundLayer.selectAll("*").remove();
    const cols = Math.ceil(6000 / (HEX * Math.sqrt(3))) + 5;
    const rows = Math.ceil(6000 / (HEX * 3 / 2)) + 5;

    for (let r = -35; r < rows; r++) {
        for (let q = -35; q < cols; q++) {
            const { x, y } = hexToPixel(q, r);
            if (x > minXY && x < maxXY && y > minXY && y < maxXY) {
                backgroundLayer.append("circle").attr("cx", x).attr("cy", y).attr("r", 1.5).attr("fill", "#ccc");
            }
        }
    }
}

/* ================== RENDER ================= */
let showFaceIds = false;

function render() {
    faceLayer.selectAll("*").remove();
    edgeLayer.selectAll("*").remove();
    labelLayer.selectAll("*").remove();

    computeFaceIds();

    const u1 = { x: fdTip1.x - fdOriginPx.x, y: fdTip1.y - fdOriginPx.y };
    const u2 = { x: fdTip2.x - fdOriginPx.x, y: fdTip2.y - fdOriginPx.y };
    const nRepeat = 4;

    function faceCentroid(face, xOff, yOff) {
        let cx = 0, cy = 0;
        face.verts.forEach(id => { const v = Graph.vertices.get(id); cx += v.x; cy += v.y; });
        return { x: cx / face.verts.length + xOff, y: cy / face.verts.length + yOff };
    }

    function drawFace(face, xOffset = 0, yOffset = 0) {
        const pts = face.verts.map(id => {
            const v = Graph.vertices.get(id);
            return `${v.x + xOffset},${v.y + yOffset}`;
        }).join(" ");
        faceLayer.append("polygon")
            .attr("points", pts)
            .attr("fill", face.color)
            .attr("stroke", "#333")
            .on("mouseenter", function () { if (mode === "dual" && face.quad) d3.select(this).classed("quad-hover", true); })
            .on("mouseleave", function () { if (mode === "dual") d3.select(this).classed("quad-hover", false); })
            .on("click", () => { if (mode === "dual" && face.quad) { urbanRenewal(face); render(); } });

        // Draw label if enabled and this face has a face_id
        if (showFaceIds && face.face_id != null) {
            const c = faceCentroid(face, xOffset, yOffset);
            labelLayer.append("text")
                .attr("x", c.x).attr("y", c.y)
                .attr("text-anchor", "middle")
                .attr("dominant-baseline", "central")
                .attr("font-size", "11px")
                .attr("font-weight", "bold")
                .attr("fill", "#111")
                .attr("pointer-events", "none")
                .text(face.face_id);
        }
    }

    for (let i = -nRepeat; i <= nRepeat; i++) {
        for (let j = -nRepeat; j <= nRepeat; j++) {
            const dx = i * u1.x + j * u2.x, dy = i * u1.y + j * u2.y;
            Graph.faces.forEach(face => {
                let rx, ry;
                if (face.hex_q != null) {
                    const p = hexToPixel(face.hex_q, face.hex_r);
                    rx = p.x; ry = p.y;
                } else {
                    const c = faceCentroid(face, 0, 0);
                    rx = c.x; ry = c.y;
                }
                if (rx+dx > minXY && rx+dx < maxXY && ry+dy > minXY && ry+dy < maxXY) {
                    drawFace(face, dx, dy);
                }
            })
        }
    }

    Graph.edges.forEach(e => {
        const a = Graph.vertices.get(e.a), b = Graph.vertices.get(e.b);
        edgeLayer.append("line")
            .attr("x1", a.x).attr("y1", a.y).attr("x2", b.x).attr("y2", b.y)
            .attr("stroke", "#000");
    });
}

/* ================== B/W VERTEX LAYER ================= */
let showBWVertices = false;
function renderBWVertices() {
    bwVertexLayer.selectAll("*").remove();
    if (!showBWVertices) return;
    Graph.vertices.forEach(v => {
        const lc = latticeCoords(v.x, v.y);
        const color = lc.onLattice ? vertexColor(lc.Q, lc.R) : null;
        bwVertexLayer.append("circle")
            .attr("cx", v.x).attr("cy", v.y).attr("r", 4)
            .attr("fill", color === "w" ? "#fff" : "#000")
            .attr("stroke", "#000").attr("stroke-width", 1);
    });
}
d3.select("#toggleNodesBtn").on("click", () => { showBWVertices = !showBWVertices; renderBWVertices(); });
d3.select("#toggleFaceIdsBtn").on("click", () => { showFaceIds = !showFaceIds; render(); });

/* ================== UI ================= */
function selectTile(t) {
    if (selectedTile === t) { selectedTile = null; mode = "drag"; }
    else { selectedTile = t; mode = "place"; }
    buildTilePalette();
}

/* ================== QUIVER COMPUTATION ================== */

// Step 1 – enumerate canonical hex positions strictly inside the FD
function getExpectedFDHexKeys() {
    const O = fdOriginPx;
    const a1x = fdTip1.x - O.x, a1y = fdTip1.y - O.y;
    const a2x = fdTip2.x - O.x, a2y = fdTip2.y - O.y;
    const det = a1x * a2y - a1y * a2x;
    const seen = new Set();
    const eps = 1e-6;
    for (let q = -50; q <= 50; q++) {
        for (let r = -50; r <= 50; r++) {
            const p = hexToPixel(q, r);
            const dx = p.x - O.x, dy = p.y - O.y;
            const s = (dx * a2y - dy * a2x) / det;
            const t = (a1x * dy - a1y * dx) / det;
            if (s >= -eps && s < 1 - eps && t >= -eps && t < 1 - eps) {
                seen.add(fdFoldKey(p.x, p.y));
            }
        }
    }
    return seen;
}

// Step 1 – check if every expected canonical hex position has a placed face
function allTilesFilled() {
    const expected = getExpectedFDHexKeys();
    if (expected.size === 0) return false;
    const covered = new Set();
    Graph.faces.forEach(face => {
        let rx, ry;
        if (face.hex_q != null) { const p = hexToPixel(face.hex_q, face.hex_r); rx = p.x; ry = p.y; }
        else {
            rx = face.verts.reduce((s, id) => s + Graph.vertices.get(id).x, 0) / face.verts.length;
            ry = face.verts.reduce((s, id) => s + Graph.vertices.get(id).y, 0) / face.verts.length;
        }
        covered.add(fdFoldKey(rx, ry));
    });
    for (const k of expected) { if (!covered.has(k)) return false; }
    return true;
}

/* ================== TORUS QUOTIENT (exact lattice arithmetic) ================== */
// The placed tiles in `Graph` are one fundamental domain of a doubly periodic
// bipartite graph.  Honeycomb vertices live on the "tripled axial" integer
// lattice (Q,R) = 3 × (axial coords): hex centres have Q+R ≡ 0 (mod 3), the
// two dimer sublattices have Q+R ≡ 1 (white) and Q+R ≡ 2 (black).  All
// canonicalisation and winding numbers are computed with integers, so there
// is no floating-point ambiguity on the FD boundary.

function latticeCoords(x, y) {
    const p = rotateCCW({ x, y });
    const qa = 3 * (Math.sqrt(3) / 3 * p.x - p.y / 3) / HEX;
    const ra = 3 * (2 / 3 * p.y) / HEX;
    const Q = Math.round(qa), R = Math.round(ra);
    return { Q, R, onLattice: Math.abs(qa - Q) < 0.01 && Math.abs(ra - R) < 0.01 };
}

function vertexColor(Q, R) {          // "w" | "b" | null (hex centre)
    const c = ((Q + R) % 3 + 3) % 3;
    return c === 1 ? "w" : c === 2 ? "b" : null;
}

// Fold Graph onto the torus:
//  - nodes   : Map canonical "Q,R" → {key, color, Q, R}
//  - edges   : Map key → {w, b, wx, wy, angleW, angleB, faceLeft, faceRight}
//              oriented white → black, winding (wx,wy) ∈ Z², with the quiver
//              faces on each side of the edge
//  - nFaces  : number of gauge groups (distinct face_ids)
function buildQuotientDimer() {
    computeFaceIds();

    const O = latticeCoords(fdOriginPx.x, fdOriginPx.y);
    const T1 = latticeCoords(fdTip1.x, fdTip1.y);
    const T2 = latticeCoords(fdTip2.x, fdTip2.y);
    const A1 = { Q: T1.Q - O.Q, R: T1.R - O.R };
    const A2 = { Q: T2.Q - O.Q, R: T2.R - O.R };
    const D = A1.Q * A2.R - A1.R * A2.Q;
    if (D === 0) return { ok: false, reason: "degenerate fundamental domain" };

    // canonical representative + unit-cell index (m,n) of a lattice point
    function canon(Q, R) {
        const dQ = Q - O.Q, dR = R - O.R;
        const m = Math.floor((dQ * A2.R - dR * A2.Q) / D);
        const n = Math.floor((A1.Q * dR - A1.R * dQ) / D);
        return { Q: Q - m * A1.Q - n * A2.Q, R: R - m * A1.R - n * A2.R, m, n };
    }

    // ---- vertices → quotient nodes
    const nodes = new Map();
    const vertInfo = new Map();   // plane-vertex id → {key, m, n, color}
    for (const [vid, v] of Graph.vertices) {
        const lc = latticeCoords(v.x, v.y);
        if (!lc.onLattice) return { ok: false, reason: "vertex off the hex lattice" };
        const color = vertexColor(lc.Q, lc.R);
        if (!color) return { ok: false, reason: "vertex at a hex centre" };
        const c = canon(lc.Q, lc.R);
        const key = `${c.Q},${c.R}`;
        if (!nodes.has(key)) nodes.set(key, { key, color, Q: c.Q, R: c.R });
        vertInfo.set(vid, { key, m: c.m, n: c.n, color });
    }

    // ---- edges → quotient edges (periodic copies are exact translates, so
    //      they produce identical keys and angles and dedupe cleanly)
    const edges = new Map();
    for (const e of Graph.edges.values()) {
        const ia = vertInfo.get(e.a), ib = vertInfo.get(e.b);
        if (!ia || !ib) continue;
        if (ia.color === ib.color) return { ok: false, reason: "edge joins two vertices of the same colour" };
        const va = Graph.vertices.get(e.a), vb = Graph.vertices.get(e.b);
        const [iw, ibk, vw, vbk] = ia.color === "w" ? [ia, ib, va, vb] : [ib, ia, vb, va];
        const wx = ibk.m - iw.m, wy = ibk.n - iw.n;
        const key = `${iw.key}|${ibk.key}|${wx},${wy}`;
        if (!edges.has(key)) edges.set(key, {
            key, w: iw.key, b: ibk.key, wx, wy,
            angleW: Math.atan2(vbk.y - vw.y, vbk.x - vw.x),
            angleB: Math.atan2(vw.y - vbk.y, vw.x - vbk.x),
            faceLeft: null, faceRight: null    // faces left/right of white → black
        });
    }

    // ---- faces: one representative per face_id; walk its boundary (vertex
    //      lists are CCW in raw coords, so the face lies LEFT of each
    //      directed boundary edge) and record edge ↔ face adjacency.
    const repFaces = new Map();
    Graph.faces.forEach(f => { if (f.face_id != null && !repFaces.has(f.face_id)) repFaces.set(f.face_id, f); });
    if (repFaces.size === 0) return { ok: false, reason: "no faces" };

    for (const [fid, face] of repFaces) {
        const n = face.verts.length;
        for (let k = 0; k < n; k++) {
            const ia = vertInfo.get(face.verts[k]);
            const ib = vertInfo.get(face.verts[(k + 1) % n]);
            if (!ia || !ib || ia.color === ib.color) return { ok: false, reason: "invalid face boundary" };
            const [iw, ibk] = ia.color === "w" ? [ia, ib] : [ib, ia];
            const key = `${iw.key}|${ibk.key}|${ibk.m - iw.m},${ibk.n - iw.n}`;
            const qe = edges.get(key);
            if (!qe) return { ok: false, reason: "face references a missing edge" };
            // traversal white→black: face on the left of the dimer edge
            const side = ia.color === "w" ? "faceLeft" : "faceRight";
            if (qe[side] != null) return { ok: false, reason: "overlapping tiles (edge side claimed twice)" };
            qe[side] = fid;
        }
    }
    for (const qe of edges.values())
        if (qe.faceLeft == null || qe.faceRight == null)
            return { ok: false, reason: "edge with a missing adjacent face" };

    return { ok: true, nodes, edges, nFaces: repFaces.size };
}

/* ================== QUIVER, SUPERPOTENTIAL, KASTELEYN, TORIC ================== */

// One quiver arrow per dimer edge: leftFace(w→b) → rightFace(w→b).  With this
// convention arrows circulate clockwise around white vertices and
// counter-clockwise around black ones, so superpotential terms close.
function computeArrows(dimer) {
    const arrowByEdge = new Map();
    const arrows = [];
    dimer.edges.forEach(qe => {
        const a = { from: qe.faceLeft, to: qe.faceRight, edge: qe };
        arrows.push(a);
        arrowByEdge.set(qe.key, a);
    });
    arrows.sort((a, b) => a.from - b.from || a.to - b.to);
    // multiple arrows between the same ordered pair get successive letters:
    // X[i,j], Y[i,j], Z[i,j], ...
    const ARROW_LETTERS = ["X", "Y", "Z", "W", "V", "U", "T", "S"];
    const seen = new Map();
    arrows.forEach(a => {
        const p = `${a.from},${a.to}`;
        const k = (seen.get(p) || 0) + 1; seen.set(p, k);
        const letter = k <= ARROW_LETTERS.length ? ARROW_LETTERS[k - 1] : `X${k}`;
        a.name = `${letter}[${a.from},${a.to}]`;
    });
    return { arrows, arrowByEdge };
}

// W = Σ_white +Tr(cycle) − Σ_black Tr(cycle); the cyclic order of the arrows
// around each dimer vertex is the angular order of its incident edges.
function computeSuperpotential(dimer, arrowByEdge) {
    const byW = new Map(), byB = new Map();
    dimer.edges.forEach(qe => {
        if (!byW.has(qe.w)) byW.set(qe.w, []);
        byW.get(qe.w).push(qe);
        if (!byB.has(qe.b)) byB.set(qe.b, []);
        byB.get(qe.b).push(qe);
    });

    const terms = [];
    function mkTerm(list, sign) {
        const arrs = list.map(qe => arrowByEdge.get(qe.key));
        for (let i = 0; i < arrs.length; i++)
            if (arrs[i].to !== arrs[(i + 1) % arrs.length].from)
                console.warn("superpotential term does not close:", arrs.map(a => a.name));
        // start the cycle at the smallest arrow name for stable output
        let s = 0;
        for (let i = 1; i < arrs.length; i++) if (arrs[i].name < arrs[s].name) s = i;
        terms.push({ sign, names: arrs.slice(s).concat(arrs.slice(0, s)).map(a => a.name) });
    }
    [...byW.entries()].sort().forEach(([, list]) => { list.sort((a, b) => b.angleW - a.angleW); mkTerm(list, +1); });
    [...byB.entries()].sort().forEach(([, list]) => { list.sort((a, b) => a.angleB - b.angleB); mkTerm(list, -1); });
    return terms;
}

function mono(c, wx, wy) {
    const f = [];
    if (wx !== 0) f.push(wx === 1 ? "x" : `x^${wx}`);
    if (wy !== 0) f.push(wy === 1 ? "y" : `y^${wy}`);
    if (c !== 1 || f.length === 0) f.unshift(String(c));
    return f.join("*");
}

// K(x,y): rows = white nodes, columns = black nodes, entry = Σ_edges x^wx y^wy.
// Its permanent generates the perfect matchings; the Newton polygon is the
// toric diagram (physics convention, no Kasteleyn signs — they do not affect
// the polygon or the multiplicities).
function computeKasteleyn(dimer) {
    const byQR = (a, b) => a.Q - b.Q || a.R - b.R;
    const whites = [...dimer.nodes.values()].filter(n => n.color === "w").sort(byQR);
    const blacks = [...dimer.nodes.values()].filter(n => n.color === "b").sort(byQR);
    const wIdx = new Map(whites.map((n, i) => [n.key, i]));
    const bIdx = new Map(blacks.map((n, i) => [n.key, i]));
    const cells = whites.map(() => blacks.map(() => new Map()));   // "wx,wy" → count
    dimer.edges.forEach(qe => {
        const cell = cells[wIdx.get(qe.w)][bIdx.get(qe.b)];
        const k = `${qe.wx},${qe.wy}`;
        cell.set(k, (cell.get(k) || 0) + 1);
    });
    const entry = cell => cell.size === 0 ? "0" :
        [...cell.entries()]
            .map(([k, c]) => { const [wx, wy] = k.split(",").map(Number); return { wx, wy, c }; })
            .sort((a, b) => a.wx - b.wx || a.wy - b.wy)
            .map(t => mono(t.c, t.wx, t.wy)).join(" + ");
    return { whites, blacks, wIdx, bIdx, strMatrix: cells.map(row => row.map(entry)) };
}

// Enumerate all perfect matchings, binned by total winding (i,j) — the
// multiplicity of lattice point (i,j) in the toric diagram.
function enumerateMatchings(dimer, kast) {
    const nW = kast.whites.length, nB = kast.blacks.length;
    if (nW !== nB || nW === 0) return null;
    const adj = kast.whites.map(() => []);
    dimer.edges.forEach(qe => adj[kast.wIdx.get(qe.w)].push({ b: kast.bIdx.get(qe.b), wx: qe.wx, wy: qe.wy }));
    const counts = new Map();
    const used = new Array(nB).fill(false);
    let steps = 0;
    function rec(i, sx, sy) {
        if (++steps > 2e6) throw new Error("matching enumeration limit exceeded");
        if (i === nW) {
            const k = `${sx},${sy}`;
            counts.set(k, (counts.get(k) || 0) + 1);
            return;
        }
        for (const e of adj[i]) {
            if (used[e.b]) continue;
            used[e.b] = true;
            rec(i + 1, sx + e.wx, sy + e.wy);
            used[e.b] = false;
        }
    }
    try { rec(0, 0, 0); } catch { return null; }
    return counts;
}

function convexHull(pts) {
    const P = [...pts].sort((a, b) => a.x - b.x || a.y - b.y);
    if (P.length <= 2) return P.map(p => ({ x: p.x, y: p.y }));
    const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
    const lower = [];
    for (const p of P) {
        while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
        lower.push(p);
    }
    const upper = [];
    for (let i = P.length - 1; i >= 0; i--) {
        const p = P[i];
        while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
        upper.push(p);
    }
    lower.pop(); upper.pop();
    return lower.concat(upper).map(p => ({ x: p.x, y: p.y }));
}

function polygonTwoArea(hull) {   // 2 × area — an integer for lattice polygons
    if (hull.length < 3) return 0;
    let s = 0;
    for (let i = 0; i < hull.length; i++) {
        const a = hull[i], b = hull[(i + 1) % hull.length];
        s += a.x * b.y - b.x * a.y;
    }
    return Math.abs(s);
}

function gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { [a, b] = [b, a % b]; } return a; }

function binomial(n, k) {
    let r = 1;
    for (let i = 1; i <= k; i++) r = r * (n - k + i) / i;
    return Math.round(r);
}

// Toric diagram + consistency.  For a consistent brane tiling:
//  - 2·Area of the Newton polygon = number of gauge groups (faces), and
//  - along each boundary edge of the polygon with k primitive segments the
//    matching multiplicities are binomial, C(k,0)…C(k,k) (the edge is locally
//    a C²/Z_k × C geometry); in particular corners are unique matchings.
function computeToric(dimer, kast) {
    const counts = enumerateMatchings(dimer, kast);
    if (!counts || counts.size === 0)
        return { points: [], hull: [], twoArea: 0, reasons: ["no perfect matchings"], consistent: false };

    let pts = [...counts.entries()].map(([k, c]) => {
        const [x, y] = k.split(",").map(Number);
        return { x, y, mult: c };
    });
    const minX = Math.min(...pts.map(p => p.x)), minY = Math.min(...pts.map(p => p.y));
    pts = pts.map(p => ({ x: p.x - minX, y: p.y - minY, mult: p.mult }));
    pts.sort((a, b) => a.x - b.x || a.y - b.y);

    const multOf = new Map(pts.map(p => [`${p.x},${p.y}`, p.mult]));
    const hull = convexHull(pts);
    const twoArea = polygonTwoArea(hull);

    const reasons = [];
    if (twoArea !== dimer.nFaces)
        reasons.push(`2·Area = ${twoArea} ≠ ${dimer.nFaces} gauge groups`);
    const hullEdges = hull.length > 2
        ? hull.map((p, i) => [p, hull[(i + 1) % hull.length]])
        : hull.length === 2 ? [[hull[0], hull[1]]] : [];
    const flagged = new Set();
    for (const [a, b] of hullEdges) {
        const g = gcd(b.x - a.x, b.y - a.y) || 1;
        for (let j = 0; j <= g; j++) {
            const x = a.x + j * (b.x - a.x) / g, y = a.y + j * (b.y - a.y) / g;
            const m = multOf.get(`${x},${y}`) || 0;
            const want = binomial(g, j);
            if (m !== want && !flagged.has(`${x},${y}`)) {
                flagged.add(`${x},${y}`);
                reasons.push(`boundary point (${x},${y}) has multiplicity ${m} (expected ${want})`);
            }
        }
    }
    return { points: pts, hull, twoArea, reasons, consistent: reasons.length === 0 };
}

/* ================== TORIC DIAGRAM RECOGNITION ================== */
// Two toric diagrams describe the same CY3 iff they are related by an affine
// unimodular map: SL(2,Z), reflections (det = -1) and translations.  No
// rescaling is possible in this group — a dilated polygon is a genuinely
// different geometry (an orbifold cover) and never matches its parent.
//
// canonicalPolygonKey() computes an exact canonical form under this group:
// for every hull edge (and for the reflected polygon), a unimodular map sends
// the edge's primitive vector to (1,0) and the base vertex to the origin; the
// residual x-shear freedom is fixed with the preceding vertex, and the
// lexicographically smallest serialization wins.

function egcdPair(a, b) {   // a*x + b*y = g = gcd(a,b) >= 0
    let or_ = a, r = b, os = 1, s = 0, ot = 0, t = 1;
    while (r !== 0) {
        const q = Math.trunc(or_ / r);
        [or_, r] = [r, or_ - q * r];
        [os, s] = [s, os - q * s];
        [ot, t] = [t, ot - q * t];
    }
    if (or_ < 0) { or_ = -or_; os = -os; ot = -ot; }
    return { g: or_, x: os, y: ot };
}

function canonicalPolygonKey(hullCCW) {
    if (hullCCW.length < 3) return null;
    const refl = hullCCW.map(p => ({ x: p.x, y: -p.y })).reverse();
    let best = null;
    for (const V of [hullCCW, refl]) {
        const n = V.length;
        for (let i = 0; i < n; i++) {
            const A = V[i], B = V[(i + 1) % n];
            const g = gcd(B.x - A.x, B.y - A.y);
            const dx = (B.x - A.x) / g, dy = (B.y - A.y) / g;
            const { x: a, y: b } = egcdPair(dx, dy);   // a*dx + b*dy = 1
            const pts = [];
            for (let k = 0; k < n; k++) {
                const p = V[(i + k) % n];
                const px = p.x - A.x, py = p.y - A.y;
                pts.push({ x: a * px + b * py, y: -dy * px + dx * py });
            }
            // last vertex (the one preceding A) has y > 0 on a strict hull
            const C = pts[n - 1];
            const t = -Math.floor(C.x / C.y);
            const key = pts.map(p => `${p.x + t * p.y},${p.y}`).join(";");
            if (best === null || key < best) best = key;
        }
    }
    return best;
}

function latticePolygonInvariants(hull) {
    const twoA = polygonTwoArea(hull);
    let B = 0;
    for (let i = 0; i < hull.length; i++) {
        const a = hull[i], b = hull[(i + 1) % hull.length];
        B += gcd(b.x - a.x, b.y - a.y);
    }
    return { twoA, B, I: (twoA - B + 2) / 2 };   // Pick's theorem
}

// ---- parametric recognizers -------------------------------------------------

// Any lattice triangle is an abelian orbifold of C^3; the group is
// Z^2/(edge lattice) and cyclic weights come from barycentric coordinates of
// a generator, canonicalized over generator rescalings.
function recognizeTriangle(hull) {
    const [v1, v2, v3] = hull;
    const u = { x: v2.x - v1.x, y: v2.y - v1.y };
    const w = { x: v3.x - v1.x, y: v3.y - v1.y };
    const D = u.x * w.y - u.y * w.x;
    const n = Math.abs(D);
    if (n === 1) return [{ name: "C³", rank: 0 }];
    const d1 = gcd(gcd(u.x, u.y), gcd(w.x, w.y));
    if (d1 > 1) return [{ name: `C³/(Z${d1}×Z${n / d1})`, rank: 2 }];
    // cyclic — find a generator of Z²/L
    let gen = null;
    for (let gx = 0; gx < n && !gen; gx++) {
        for (let gy = 0; gy < n; gy++) {
            const aN = gx * w.y - gy * w.x;
            const bN = u.x * gy - u.y * gx;
            if (n / gcd(gcd(Math.abs(aN), Math.abs(bN)), n) === n) {
                gen = { x: v1.x + gx, y: v1.y + gy };
                break;
            }
        }
    }
    if (!gen) return [{ name: `C³/Z${n}`, rank: 2 }];
    const cr = (p, q) => (p.x - gen.x) * (q.y - gen.y) - (p.y - gen.y) * (q.x - gen.x);
    const sgn = D > 0 ? 1 : -1;
    const raw = [cr(v2, v3), cr(v3, v1), cr(v1, v2)].map(v => ((sgn * v) % n + n) % n);
    let bestW = null;
    for (let k = 1; k < n; k++) {
        if (gcd(k, n) !== 1) continue;
        const s = raw.map(v => (v * k) % n).sort((A, B) => A - B).join(",");
        if (bestW === null || compareWeightStrings(s, bestW) < 0) bestW = s;
    }
    const wts = bestW.split(",").map(Number);
    const out = [{ name: `C³/Z${n} (${wts.join(",")})`, rank: 2 }];
    if (wts[0] === 0) out.unshift({ name: `C²/Z${n} × C`, rank: 1 });
    return out;
}
function compareWeightStrings(a, b) {
    const A = a.split(",").map(Number), B = b.split(",").map(Number);
    for (let i = 0; i < A.length; i++) if (A[i] !== B[i]) return A[i] - B[i];
    return 0;
}

// Any lattice parallelogram is an abelian orbifold of the conifold.
function recognizeParallelogram(hull) {
    if (hull.length !== 4) return [];
    const e1 = { x: hull[1].x - hull[0].x, y: hull[1].y - hull[0].y };
    const e2 = { x: hull[2].x - hull[1].x, y: hull[2].y - hull[1].y };
    const e3 = { x: hull[3].x - hull[2].x, y: hull[3].y - hull[2].y };
    if (e1.x + e3.x !== 0 || e1.y + e3.y !== 0) return [];
    const n = Math.abs(e1.x * e2.y - e1.y * e2.x);
    if (n === 1) return [{ name: "Conifold (T^{1,1})", rank: 0 }];
    const d1 = gcd(gcd(e1.x, e1.y), gcd(e2.x, e2.y));
    const gname = d1 === 1 ? `Z${n}` : `Z${d1}×Z${n / d1}`;
    return [{ name: `C/${gname} (conifold orbifold)`, rank: 2.5 }];
}

// ---- database of named diagrams --------------------------------------------
// Family conventions (verified in the tests):
//   Y^{p,q} = hull{(0,0),(1,0),(0,p),(-1,p+q)},      0 <= q <= p,   2A = 2p
//   X^{p,q} = Y^{p,q} + point (-1,p+q-1),             1 <= q <= p,   2A = 2p+1
//   L^{a,b,c} = hull{(0,0),(1,0),(ak,b),(-al,c)}, ck+bl = 1,         2A = a+b
//   (Y^{p,q} = L^{p-q,p+q,p};  SPP = L^{1,2,1} = X^{1,1};  dP1 = Y^{2,1};
//    F0 = Y^{2,0} = C/Z2 (1,1,1,1))
// Abelian orbifolds: the diagram of X/Γ is the image of X's diagram under an
// integer matrix of determinant |Γ| (row-Hermite forms enumerate all actions).

function yPoints(p, q) {
    return [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: p }, { x: -1, y: p + q }];
}
function xPoints(p, q) {
    return [...yPoints(p, q), { x: -1, y: p + q - 1 }];
}
// Z^{p,q} (Oota–Yasui, hep-th/0610092 eq. (3.1)): X^{p,q} plus the vertex
// (0, p-q+1) in their convention; 0 < q < p, 2A = 2p+2, Z^{2,1} = dP3.
function zPoints(p, q) {
    return [{ x: 1, y: p }, { x: 0, y: p - q + 1 }, { x: 0, y: p - q },
    { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 1 }];
}
function lPoints(a, b, c) {
    const { g, x: k, y: l } = egcdPair(c, b);
    if (g !== 1) return null;
    return [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: a * k, y: b }, { x: -a * l, y: c }];
}

const TORIC_AMAX = 32;   // largest 2·Area kept in the database
let TORIC_DB = null;

// Pseudo del Pezzo diagrams — coordinates fixed by enumerating ALL reflexive
// polygons (exactly 16 classes, matching arXiv:1201.2614) and assigning the
// remaining classes by elimination using their 2·Area and vertex counts:
// PdP2 (2A=5 quad, = X^{2,2} = L^{2,3,1}), PdP3b (2A=6 pentagon),
// PdP3c (2A=6 quad, = SPP/Z2), PdP4a (2A=7 pentagon), PdP4b (2A=7 quad,
// = L^{3,4,1}), PdP5 (2A=8 square, = C/Z2×Z2) — PdP5 sits in `specials`.
const PDP_COORDS = [
    ["PdP2", [{ x: -2, y: -1 }, { x: -1, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }]],
    ["PdP3b", [{ x: -2, y: -1 }, { x: -1, y: -1 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }]],
    ["PdP3c", [{ x: -2, y: -1 }, { x: -1, y: -1 }, { x: 2, y: 1 }, { x: 0, y: 1 }]],
    ["PdP4a", [{ x: -2, y: -1 }, { x: -1, y: -1 }, { x: 1, y: 0 }, { x: 2, y: 1 }, { x: 0, y: 1 }]],
    ["PdP4b", [{ x: -2, y: -1 }, { x: -1, y: -1 }, { x: 1, y: 0 }, { x: 1, y: 2 }]],
];

function dbAdd(db, pts, name, rank) {
    if (!pts) return;
    const h = convexHull(pts);
    if (h.length < 3 || polygonTwoArea(h) > TORIC_AMAX) return;
    const key = canonicalPolygonKey(h);
    if (!db.has(key)) db.set(key, []);
    const list = db.get(key);
    if (!list.some(e => e.name === name)) list.push({ name, rank });
}

function buildToricDB() {
    const db = new Map();

    // named diagrams (rank 0) — the 16 reflexive polygons are all covered:
    // 4 triangles + F0/PdP5 (parallelograms) are handled by the parametric
    // recognizers as well; PdP coordinates verified against the classification
    // of one-interior-point polygons (Hanany–Seong arXiv:1201.2614).
    const specials = [
        ["C³", [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }]],
        ["Conifold (T^{1,1})", [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }]],
        ["SPP", lPoints(1, 2, 1)],
        ["dP0", [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: -1 }]],
        ["dP1", yPoints(2, 1)],
        ["dP2", [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 1 }, { x: -1, y: 0 }, { x: 0, y: -1 }]],
        ["dP3", [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 1 }, { x: -1, y: 0 }, { x: 0, y: -1 }, { x: 1, y: -1 }]],
        ["F₀", yPoints(2, 0)],
        ["PdP3a", [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: -2, y: -3 }]],
        ["PdP5", [{ x: 1, y: 1 }, { x: -1, y: 1 }, { x: -1, y: -1 }, { x: 1, y: -1 }]],
        // PdP2 / PdP3b / PdP3c / PdP4a / PdP4b filled in below (see PDP_COORDS)
    ];
    specials.forEach(([n, p]) => dbAdd(db, p, n, 0));
    PDP_COORDS.forEach(([n, p]) => dbAdd(db, p, n, 0));

    // families
    for (let p = 1; 2 * p <= TORIC_AMAX; p++)
        for (let q = 0; q <= p; q++)
            dbAdd(db, yPoints(p, q), `Y^{${p},${q}}`, 1);
    for (let p = 1; 2 * p + 1 <= TORIC_AMAX; p++)
        for (let q = 1; q <= p; q++)
            dbAdd(db, xPoints(p, q), `X^{${p},${q}}`, 1);
    for (let p = 2; 2 * p + 2 <= TORIC_AMAX; p++)
        for (let q = 1; q < p; q++)
            dbAdd(db, zPoints(p, q), `Z^{${p},${q}}`, 1);
    for (let b = 1; b <= TORIC_AMAX; b++)
        for (let a = 1; a <= b && a + b <= TORIC_AMAX; a++)
            for (let c = 1; 2 * c <= a + b; c++)          // convention c <= d = a+b-c
                dbAdd(db, lPoints(a, b, c), `L^{${a},${b},${c}}`, 2);

    // abelian orbifolds of the named parents (C³ and conifold orbifolds are
    // already handled exactly by the triangle/parallelogram recognizers)
    const parents = [
        ["SPP", lPoints(1, 2, 1)],
        ["dP1", yPoints(2, 1)],
        ["dP2", specials[5][1]],
        ["dP3", specials[6][1]],
        ["F₀", yPoints(2, 0)],
        ["PdP5", specials[9][1]],
        ["L^{1,3,1}", lPoints(1, 3, 1)],
        ["L^{2,3,2}", lPoints(2, 3, 2)],
        ["L^{1,4,1}", lPoints(1, 4, 1)],
        ["L^{1,5,1}", lPoints(1, 5, 1)],
        ...PDP_COORDS,
    ];
    for (const [pname, pts] of parents) {
        if (!pts) continue;
        const base = polygonTwoArea(convexHull(pts));
        for (let k = 2; k * base <= TORIC_AMAX; k++) {
            for (let m = 1; m <= k; m++) {
                if (k % m) continue;
                const nn = k / m;
                for (let s = 0; s < nn; s++) {       // row-Hermite forms [[m,s],[0,nn]]
                    const img = pts.map(P => ({ x: m * P.x + s * P.y, y: nn * P.y }));
                    const d1 = gcd(gcd(m, s), nn);
                    const gname = d1 === 1 ? `Z${k}` : `Z${d1}×Z${k / d1}`;
                    dbAdd(db, img, `${pname}/${gname}`, 3);
                }
            }
        }
    }
    return db;
}

function recognizeToric(toric) {
    if (!toric || !toric.hull || toric.hull.length < 3) return null;
    if (!TORIC_DB) TORIC_DB = buildToricDB();
    const hull = toric.hull;
    const names = [...(TORIC_DB.get(canonicalPolygonKey(hull)) || [])];
    if (hull.length === 3) names.push(...recognizeTriangle(hull));
    if (hull.length === 4) names.push(...recognizeParallelogram(hull));
    if (!names.length) {
        const inv = latticePolygonInvariants(hull);
        let s = `Toric CY₃: ${hull.length}-gon, 2·Area = ${inv.twoA}, ${inv.I} interior pt${inv.I === 1 ? "" : "s"}`;
        if (inv.I === 2) s += " — cf. arXiv:2004.05295";
        return s;
    }
    names.sort((A, B) => A.rank - B.rank);
    const seen = new Set(), out = [];
    for (const e of names) {
        if (seen.has(e.name)) continue;
        seen.add(e.name);
        out.push(e.name);
        if (out.length === 3) break;
    }
    return out.join(" = ");
}

/* ================== DIMERDATABASE MATCH ================== */
// If window.DIMER_DB_INDEX is present (DimerDatabase/db/index.js), match the
// current toric diagram against it by canonical polygon key — the same
// SL(2,Z)+reflection+translation-invariant key the database is indexed by, so
// the display frame is irrelevant.  A hit reveals the "Open in Database" float.

let DB_KEY_LOOKUP = null;   // canonical key -> database entry

function buildDbKeyLookup() {
    const idx = window.DIMER_DB_INDEX;
    if (!Array.isArray(idx)) return new Map();
    const map = new Map();
    for (const e of idx) {
        const hull = (e.hull || e.points || []).map(p => ({ x: p[0], y: p[1] }));
        const key = canonicalPolygonKey(hull);
        if (key && !map.has(key)) map.set(key, e);
    }
    return map;
}

// TeX for a database display name (ported from DimerDatabase/app.js nameToTeX
// so the float renders names exactly as the database does).
function dbNameToTeX(name) {
    let t = name;
    if (t === "C") return "\\mathcal{C}";
    if (/^[A-Za-z0-9_ .\-]+$/.test(t) && !/\d/.test(t)) return null;
    t = t.replace(/^L(\d+),(\d+),(\d+)_/, "L^{$1,$2,$3}/");
    t = t.replace(/^L(\d+),(\d+),(\d+)$/, "L^{$1,$2,$3}");
    t = t.replace(/^Y(\d+)(\d)$/, "Y^{$1,$2}");
    t = t.replace(/^X(\d+)(\d)$/, "X^{$1,$2}");
    t = t.replace(/^Z(\d)(\d)$/, "Z^{$1,$2}");
    t = t.replace(/^PP?2$/, "\\mathbb{P}^2");
    t = t.replace(/^C\^3$/, "\\mathbb{C}^3");
    t = t.replace(/ cover \[/, "\\text{ cover }[");
    t = t.replace(/\[HNF /, "[\\text{HNF}\\;");
    t = t.replace(/_/g, "\\_");
    t = t.replace(/PdP(\d[a-f]?)/g, "\\mathrm{PdP}_{$1}");
    t = t.replace(/\bdP(\d)/g, "\\mathrm{dP}_{$1}");
    t = t.replace(/\bpseudo /g, "\\text{pseudo }");
    t = t.replace(/SPP/g, "\\mathrm{SPP}");
    t = t.replace(/\bF0\b/g, "F_0");
    t = t.replace(/T11/g, "T^{1,1}");
    t = t.replace(/P1xP1/g, "\\mathbb{P}^1\\times\\mathbb{P}^1");
    t = t.replace(/C3/g, "\\mathbb{C}^3");
    t = t.replace(/^C\//, "\\mathcal{C}/");
    t = t.replace(/^C$/, "\\mathcal{C}");
    t = t.replace(/Conifold/g, "\\text{Conifold}");
    t = t.replace(/Z(\d+)/g, "\\mathbb{Z}_{$1}");
    t = t.replace(/x\\mathbb{Z}/g, "\\times \\mathbb{Z}");
    t = t.replace(/ \[/g, "\\ [");
    t = t.replace(/ \(/g, "\\ (");
    return t;
}

let dbMatchId = null;

function updateDbLink(toric) {
    const float = document.getElementById("dbLink");
    if (!float) return;
    dbMatchId = null;
    const ok = toric && toric.consistent && toric.hull && toric.hull.length >= 3
        && Array.isArray(window.DIMER_DB_INDEX);
    if (ok) {
        if (!DB_KEY_LOOKUP) DB_KEY_LOOKUP = buildDbKeyLookup();
        const entry = DB_KEY_LOOKUP.get(canonicalPolygonKey(toric.hull));
        if (entry) {
            dbMatchId = entry.id;
            const nameEl = document.getElementById("dbLinkName");
            const disp = entry.names && entry.names.length ? entry.names[0] : entry.id;
            const tex = dbNameToTeX(disp);
            if (tex) typesetMath(nameEl, tex, disp);
            else nameEl.textContent = disp;
        }
    }
    float.style.display = dbMatchId ? "flex" : "none";
}

document.getElementById("dbLinkBtn").addEventListener("click", () => {
    if (dbMatchId) window.open(
        "DimerDatabase/index.html#/theory/" + encodeURIComponent(dbMatchId), "_blank");
});

/* ================== PANEL TITLE (MathJax) ================== */

// Convert a plain recognition string (e.g. "dP1 = Y^{2,1} = L^{2,2,1}",
// "C³/Z6 (1,2,3)", "C/Z2×Z2 (conifold orbifold)") into TeX.
function titleToTeX(name) {
    return name.split(" = ").map(part => {
        let t = part;
        t = t.replace(/^Conifold \(T\^\{1,1\}\)$/, "\\text{Conifold}\\ (T^{1,1})");
        t = t.replace(/ \(conifold orbifold\)/, "\\ \\text{(conifold orbifold)}");
        t = t.replace(/PdP(\d[a-f]?)/g, "\\mathrm{PdP}_{$1}");
        t = t.replace(/dP(\d)/g, "\\mathrm{dP}_{$1}");
        t = t.replace(/SPP/g, "\\mathrm{SPP}");
        t = t.replace(/F₀/g, "F_0");
        t = t.replace(/C³/g, "\\mathbb{C}^3");
        t = t.replace(/C²/g, "\\mathbb{C}^2");
        t = t.replace(/^C\//, "\\mathcal{C}/");
        t = t.replace(/× C$/, "\\times \\mathbb{C}");
        t = t.replace(/Z(\d+)/g, "\\mathbb{Z}_{$1}");
        t = t.replace(/×/g, "\\times ");
        return t;
    }).join(" = ");
}

// Typeset TeX into an element with MathJax when available; fall back to
// plain text (offline or MathJax still loading — re-typesets once ready).
function typesetMath(el, tex, fallbackText) {
    const mj = window.MathJax;
    if (mj && mj.typesetPromise) {
        el.innerHTML = "\\(" + tex + "\\)";
        mj.typesetClear && mj.typesetClear([el]);
        mj.typesetPromise([el]).catch(() => { el.textContent = fallbackText; });
    } else {
        el.textContent = fallbackText;
        if (mj && mj.startup && mj.startup.promise)
            mj.startup.promise.then(() => typesetMath(el, tex, fallbackText));
    }
}

function setPanelTitle(plainName) {
    const el = document.getElementById("qwTitle");
    if (!plainName) { el.textContent = "Dimer model"; return; }
    if (plainName.startsWith("Toric CY")) { el.textContent = plainName; return; }
    typesetMath(el, titleToTeX(plainName), plainName);
}

// X[1,2] → X_{1,2}
function fieldToTeX(name) {
    return name.replace(/^([A-Z]\d*)\[(\d+),(\d+)\]$/, "$1_{$2,$3}");
}

/* ================== ANALYSIS PANEL ================== */

const copyPayloads = { kasteleyn: "", quiver: "", superpotential: "", toric: "" };

function updateAnalysis() {
    saveStateToURL();   // every editing event lands here — persist the state

    if (!allTilesFilled()) { display_qw(false); updateDbLink(null); return; }

    const dimer = buildQuotientDimer();
    if (!dimer.ok) { renderPanelError(dimer.reason); display_qw(true); updateDbLink(null); return; }

    const { arrows, arrowByEdge } = computeArrows(dimer);
    const terms = computeSuperpotential(dimer, arrowByEdge);
    const kast = computeKasteleyn(dimer);
    const toric = computeToric(dimer, kast);

    renderKasteleyn(kast);
    renderQuiverSection(dimer, arrows);
    renderSuperpotential(terms);
    renderToricDiagram(toric);

    setPanelTitle(toric.consistent ? recognizeToric(toric) : null);
    updateDbLink(toric);

    display_qw(true);
}

function renderKasteleyn(kast) {
    const n = kast.whites.length, m = kast.blacks.length;
    // plain-text fallback (also what pre-MathJax environments see)
    const rowHead = i => `w${i + 1}`;
    const colHead = j => `b${j + 1}`;
    const headW = Math.max(3, rowHead(n - 1).length + 1);
    const colW = kast.strMatrix.length
        ? kast.blacks.map((_, j) => Math.max(colHead(j).length, ...kast.strMatrix.map(r => r[j].length)) + 2)
        : [];
    const head = " ".repeat(headW) + kast.blacks.map((_, j) => colHead(j).padEnd(colW[j])).join("");
    const rows = kast.strMatrix.map((r, i) =>
        rowHead(i).padEnd(headW) + r.map((e, j) => e.padEnd(colW[j])).join(""));
    const fallback = [head, ...rows].join("\n");

    const entryTeX = e => e === "0" ? "0" :
        e.replace(/\^(-?\d+)/g, "^{$1}").replace(/\*/g, "\\,");
    const tex = "K = \\begin{pmatrix} " +
        kast.strMatrix.map(r => r.map(entryTeX).join(" & ")).join(" \\\\ ") +
        " \\end{pmatrix}";
    typesetMath(document.getElementById("kasteleyn"), tex, fallback);

    document.getElementById("kasteleynNote").textContent =
        `${n}×${m} (white × black); x, y wind around the two torus cycles`;
    copyPayloads.kasteleyn =
        "K = {" + kast.strMatrix.map(r => "{" + r.join(", ") + "}").join(", ") + "}";
}

function renderQuiverSection(dimer, arrows) {
    drawQuiverGraph(dimer.nFaces, arrows);
    document.getElementById("quiverNote").textContent =
        `${dimer.nFaces} gauge group(s), ${arrows.length} arrow(s) — copy gives [sources; targets]`;
    copyPayloads.quiver =
        `Q = [\n  [${arrows.map(a => a.from).join(", ")}],\n  [${arrows.map(a => a.to).join(", ")}]\n]`;
}

// Draw the quiver: gauge nodes on a circle, one arrow per bifundamental.
// Arrows between the same pair of nodes are spread by bowing the curves;
// adjoints are drawn as loops pointing away from the graph centre.
function drawQuiverGraph(nFaces, arrows) {
    const svgQ = d3.select("#quiverSvg");
    svgQ.selectAll("*").remove();
    const W = 260, H = 190, NR = 12;
    svgQ.attr("viewBox", `0 0 ${W} ${H}`);
    svgQ.append("defs").append("marker")
        .attr("id", "qv-arrow")
        .attr("markerWidth", 7).attr("markerHeight", 7)
        .attr("refX", 6).attr("refY", 2.5).attr("orient", "auto")
        .append("path").attr("d", "M0,0 L0,5 L6.5,2.5 z").attr("fill", "#ddd");

    const cx = W / 2, cy = H / 2;
    const R = Math.min(W, H) / 2 - 34;
    const pos = [];
    for (let i = 0; i < nFaces; i++) {
        const a = -Math.PI / 2 + 2 * Math.PI * i / nFaces;
        pos.push(nFaces === 1
            ? { x: cx, y: cy + 14 }
            : { x: cx + R * Math.cos(a), y: cy + R * Math.sin(a) });
    }

    const drawPath = d => svgQ.append("path")
        .attr("d", d).attr("fill", "none")
        .attr("stroke", "#ddd").attr("stroke-width", 1.3)
        .attr("marker-end", "url(#qv-arrow)");

    // group by unordered pair so opposite arrows bow apart
    const groups = new Map();
    arrows.forEach(a => {
        const key = a.from <= a.to ? `${a.from},${a.to}` : `${a.to},${a.from}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(a);
    });

    groups.forEach((list, key) => {
        const [i, j] = key.split(",").map(Number);
        if (i === j) {
            const p = pos[i - 1];
            const out = nFaces === 1 ? -Math.PI / 2 : Math.atan2(p.y - cy, p.x - cx);
            list.forEach((a, k) => {
                const spread = 0.55, L = 34 + 15 * k;
                const a1 = out - spread, a2 = out + spread;
                drawPath(`M ${p.x + NR * Math.cos(a1)} ${p.y + NR * Math.sin(a1)} ` +
                    `C ${p.x + L * Math.cos(a1)} ${p.y + L * Math.sin(a1)} ` +
                    `${p.x + L * Math.cos(a2)} ${p.y + L * Math.sin(a2)} ` +
                    `${p.x + NR * Math.cos(a2)} ${p.y + NR * Math.sin(a2)}`);
            });
        } else {
            const A = pos[i - 1], B = pos[j - 1];
            const pl = Math.hypot(B.x - A.x, B.y - A.y);
            const nx = -(B.y - A.y) / pl, ny = (B.x - A.x) / pl;
            const trim = (P, Q, r) => {
                const d = Math.hypot(Q.x - P.x, Q.y - P.y) || 1;
                return { x: P.x + (Q.x - P.x) / d * r, y: P.y + (Q.y - P.y) / d * r };
            };
            list.forEach((a, k) => {
                const bow = (k - (list.length - 1) / 2) * 18;
                const M = { x: (A.x + B.x) / 2 + nx * bow, y: (A.y + B.y) / 2 + ny * bow };
                const from = pos[a.from - 1], to = pos[a.to - 1];
                const S = trim(from, M, NR), E = trim(to, M, NR + 3);
                drawPath(`M ${S.x} ${S.y} Q ${M.x} ${M.y} ${E.x} ${E.y}`);
            });
        }
    });

    pos.forEach((p, i) => {
        svgQ.append("circle").attr("cx", p.x).attr("cy", p.y).attr("r", NR)
            .attr("fill", "#1c1c1c").attr("stroke", "#9f9").attr("stroke-width", 1.5);
        svgQ.append("text").attr("x", p.x).attr("y", p.y)
            .attr("text-anchor", "middle").attr("dominant-baseline", "central")
            .attr("font-size", "12px").attr("fill", "#9f9").text(i + 1);
    });
}

function renderSuperpotential(terms) {
    const raw = "W = " +
        terms.map(t => (t.sign > 0 ? "+ " : "- ") + t.names.join("*")).join("\n    ");
    const texLines = terms.map(t =>
        (t.sign > 0 ? "+" : "-") + t.names.map(fieldToTeX).join("\\,"));
    const tex = "\\begin{aligned} W ={}& " + texLines.join(" \\\\ & ") + " \\end{aligned}";
    typesetMath(document.getElementById("superpotential"), tex, raw);
    copyPayloads.superpotential = raw;
}

function renderToricDiagram(toric) {
    const box = document.getElementById("toricBox");
    const note = document.getElementById("toricNote");
    const svgT = d3.select("#toricSvg");
    svgT.selectAll("*").remove();

    box.classList.toggle("inconsistent", !toric.consistent);
    note.style.color = toric.consistent ? "#7bd88f" : "#e74c3c";

    if (!toric.points.length) {
        note.textContent = "inconsistent: " + toric.reasons.join("; ");
        copyPayloads.toric = "";
        return;
    }

    const W = 240, H = 200, pad = 28;
    const maxX = Math.max(...toric.points.map(p => p.x));
    const maxY = Math.max(...toric.points.map(p => p.y));
    const cell = Math.min((W - 2 * pad) / Math.max(maxX, 1), (H - 2 * pad) / Math.max(maxY, 1), 45);
    const ox = (W - cell * maxX) / 2, oy = (H + cell * maxY) / 2;
    const sx = x => ox + x * cell, sy = y => oy - y * cell;
    svgT.attr("viewBox", `0 0 ${W} ${H}`);

    // faint ambient lattice over the bounding box
    for (let x = 0; x <= maxX; x++)
        for (let y = 0; y <= maxY; y++)
            svgT.append("circle").attr("cx", sx(x)).attr("cy", sy(y)).attr("r", 1.5).attr("fill", "#bbb");

    if (toric.hull.length >= 2)
        svgT.append("polygon")
            .attr("points", toric.hull.map(p => `${sx(p.x)},${sy(p.y)}`).join(" "))
            .attr("fill", "rgba(232,77,5,0.08)")
            .attr("stroke", "#e84d05").attr("stroke-width", 1.5);

    toric.points.forEach(p => {
        svgT.append("circle").attr("cx", sx(p.x)).attr("cy", sy(p.y)).attr("r", 6).attr("fill", "#222");
        if (p.mult > 1)
            svgT.append("text")
                .attr("x", sx(p.x) + 8).attr("y", sy(p.y) - 7)
                .attr("font-size", "11px").attr("font-weight", "bold").attr("fill", "#c0392b")
                .text(p.mult);
    });

    note.textContent = toric.consistent
        ? `consistent ✓ (2·Area = ${toric.twoArea} = #gauge groups)`
        : "inconsistent: " + toric.reasons.join("; ");
    copyPayloads.toric =
        "points = {" + toric.points.map(p => `{${p.x}, ${p.y}, ${p.mult}}`).join(", ") + "}";
}

function renderPanelError(reason) {
    setPanelTitle(null);
    ["kasteleyn", "superpotential"].forEach(id => document.getElementById(id).textContent = "—");
    d3.select("#quiverSvg").selectAll("*").remove();
    document.getElementById("kasteleynNote").textContent = "";
    document.getElementById("quiverNote").textContent = "";
    d3.select("#toricSvg").selectAll("*").remove();
    document.getElementById("toricBox").classList.add("inconsistent");
    const note = document.getElementById("toricNote");
    note.textContent = "Inconsistent tiling: " + reason;
    note.style.color = "#e74c3c";
    Object.keys(copyPayloads).forEach(k => copyPayloads[k] = "");
}

function display_qw(dis = true) {
    d3.select("#qw").style("display", dis ? "flex" : "none");
}

/* ================== COPY BUTTONS ================= */
document.querySelectorAll(".copy-btn").forEach(btn => {
    btn.addEventListener("click", () => {
        const text = copyPayloads[btn.dataset.copy] || "";
        const done = () => {
            const t = btn.textContent;
            btn.textContent = "✓";
            setTimeout(() => { btn.textContent = t; }, 800);
        };
        if (navigator.clipboard && navigator.clipboard.writeText)
            navigator.clipboard.writeText(text).then(done, () => fallbackCopy(text, done));
        else fallbackCopy(text, done);
    });
});

function fallbackCopy(text, done) {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); } catch (e) { }
    ta.remove();
    done();
}


/* ================== URL PERSISTENCE ================== */
// The whole editor state is (FD tips) + (ordered tile list) — placement is
// deterministic, so replaying the list reproduces the identical Graph and
// face numbering.  Encoded as a compact token of URL-unreserved characters:
//   d = 1_<t1q>.<t1r>_<t2q>.<t2r>_<q>.<r><T>_<q>.<r><T>_...
// with version "1" and tile type T ∈ {p,v,n,w} (plain, vertical, diagNE,
// diagNW).  Saved with history.replaceState on every editing event; on
// file:// URLs where replaceState may be forbidden we fall back to the hash.

const TILE_CODES = { plain: "p", vertical: "v", diagNE: "n", diagNW: "w" };
const CODE_TILES = { p: "plain", v: "vertical", n: "diagNE", w: "diagNW" };
let restoringState = false;

function encodeState() {
    const t1 = pixelToHex(fdTip1.x, fdTip1.y);
    const t2 = pixelToHex(fdTip2.x, fdTip2.y);
    const parts = ["1", `${t1.q}.${t1.r}`, `${t2.q}.${t2.r}`];
    const seen = new Set();
    Graph.faces.forEach(face => {
        if (face.hex_q == null || !face.kind) return;
        const key = `${face.hex_q}.${face.hex_r}`;
        if (seen.has(key)) return;          // crossed hexes carry two faces
        seen.add(key);
        parts.push(key + TILE_CODES[face.kind]);
    });
    return parts.join("_");
}

function saveStateToURL() {
    if (restoringState) return;
    if (typeof window === "undefined" || !window.location || !window.location.href) return;
    const enc = encodeState();
    try {
        const url = new URL(window.location.href);
        if (url.searchParams.get("d") === enc) return;
        url.searchParams.set("d", enc);
        window.history.replaceState(null, "", url);
    } catch (e) {
        try { window.location.hash = "d=" + enc; } catch (e2) { }
    }
}

function readStateString() {
    if (typeof window === "undefined" || !window.location || !window.location.href) return null;
    try {
        const url = new URL(window.location.href);
        const q = url.searchParams.get("d");
        if (q) return q;
        const h = (url.hash || "").replace(/^#/, "");
        if (h.startsWith("d=")) return h.slice(2);
    } catch (e) { }
    return null;
}

function restoreStateFromURL() {
    const s = readStateString();
    if (!s) return false;
    const parts = s.split("_");
    if (parts[0] !== "1" || parts.length < 3) return false;
    const tipOf = tok => {
        const m = /^(-?\d+)\.(-?\d+)$/.exec(tok);
        return m ? hexToPixel(Number(m[1]), Number(m[2])) : null;
    };
    const p1 = tipOf(parts[1]), p2 = tipOf(parts[2]);
    if (!p1 || !p2) return false;
    if (Math.abs(cross2D(p1.x - fdOriginPx.x, p1.y - fdOriginPx.y,
        p2.x - fdOriginPx.x, p2.y - fdOriginPx.y)) < 1e-6) return false;
    const tiles = [];
    for (let i = 3; i < parts.length; i++) {
        const m = /^(-?\d+)\.(-?\d+)([pvnw])$/.exec(parts[i]);
        if (!m) return false;               // malformed token — reject the string
        tiles.push([Number(m[1]), Number(m[2]), CODE_TILES[m[3]]]);
    }
    restoringState = true;
    fdTip1 = p1;
    fdTip2 = p2;
    tiles.forEach(([q, r, k]) => placeTile(q, r, k));
    restoringState = false;
    return true;
}

/* ================== RESIZE ================= */
// The drawing lives in world coordinates inside zoomGroup, so nothing needs
// re-rendering on resize — the svg element just has to track the window.
function resizeSVG() {
    WIDTH = window.innerWidth;
    HEIGHT = window.innerHeight;
    svg.attr("width", WIDTH).attr("height", HEIGHT);
}

window.addEventListener("resize", resizeSVG);


/* ================== INIT ================= */
restoreStateFromURL();
resizeSVG();
buildTilePalette();
drawGridDots();
drawFD();
render();
renderBWVertices();
saveStateToURL();       // normalize the URL to the (possibly restored) state
