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
        color: HEX_COLORS.plain, hex_q: q, hex_r: r
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
    Graph.faces.set(crypto.randomUUID(), { id: crypto.randomUUID(), verts: f1.map(x => x.id), quad: true, color, hex_q: q, hex_r: r, hex_sub: 0 });
    Graph.faces.set(crypto.randomUUID(), { id: crypto.randomUUID(), verts: f2.map(x => x.id), quad: true, color, hex_q: q, hex_r: r, hex_sub: 1 });
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
    const totals = new Map(), seen = new Map();
    arrows.forEach(a => { const p = `${a.from},${a.to}`; totals.set(p, (totals.get(p) || 0) + 1); });
    arrows.forEach(a => {
        const p = `${a.from},${a.to}`;
        const k = (seen.get(p) || 0) + 1; seen.set(p, k);
        a.name = totals.get(p) === 1 ? `X[${a.from},${a.to}]` : `X[${a.from},${a.to},${k}]`;
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

/* ================== ANALYSIS PANEL ================== */

const copyPayloads = { kasteleyn: "", quiver: "", superpotential: "", toric: "" };

function updateAnalysis() {
    if (!allTilesFilled()) { display_qw(false); return; }

    const dimer = buildQuotientDimer();
    if (!dimer.ok) { renderPanelError(dimer.reason); display_qw(true); return; }

    const { arrows, arrowByEdge } = computeArrows(dimer);
    const terms = computeSuperpotential(dimer, arrowByEdge);
    const kast = computeKasteleyn(dimer);
    const toric = computeToric(dimer, kast);

    renderKasteleyn(kast);
    renderQuiverSection(dimer, arrows);
    renderSuperpotential(terms);
    renderToricDiagram(toric);

    display_qw(true);
}

function renderKasteleyn(kast) {
    const n = kast.whites.length, m = kast.blacks.length;
    const rowHead = i => `w${i + 1}`;
    const colHead = j => `b${j + 1}`;
    const headW = Math.max(3, rowHead(n - 1).length + 1);
    const colW = kast.strMatrix.length
        ? kast.blacks.map((_, j) => Math.max(colHead(j).length, ...kast.strMatrix.map(r => r[j].length)) + 2)
        : [];
    const head = " ".repeat(headW) + kast.blacks.map((_, j) => colHead(j).padEnd(colW[j])).join("");
    const rows = kast.strMatrix.map((r, i) =>
        rowHead(i).padEnd(headW) + r.map((e, j) => e.padEnd(colW[j])).join(""));
    document.getElementById("kasteleyn").textContent = [head, ...rows].join("\n");
    document.getElementById("kasteleynNote").textContent =
        `${n}×${m} (white × black); x, y wind around the two torus cycles`;
    copyPayloads.kasteleyn =
        "K = {" + kast.strMatrix.map(r => "{" + r.join(", ") + "}").join(", ") + "}";
}

function renderQuiverSection(dimer, arrows) {
    const txt = `Q = [\n  [${arrows.map(a => a.from).join(", ")}],\n  [${arrows.map(a => a.to).join(", ")}]\n]`;
    document.getElementById("quiver").textContent = txt;
    document.getElementById("quiverNote").textContent =
        `${dimer.nFaces} gauge group(s), ${arrows.length} arrow(s) — [sources; targets]`;
    copyPayloads.quiver = txt;
}

function renderSuperpotential(terms) {
    const lines = terms.map(t => (t.sign > 0 ? "+ " : "- ") + t.names.join("*"));
    const txt = "W = " + lines.join("\n    ");
    document.getElementById("superpotential").textContent = txt;
    copyPayloads.superpotential = txt;
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
    ["kasteleyn", "quiver", "superpotential"].forEach(id => document.getElementById(id).textContent = "—");
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


/* ================== RESIZE ================= */
function resizeSVG() {

    const rect = svg.node().getBoundingClientRect();

    svg
        .attr("width", rect.width)
        .attr("height", rect.height);

    WIDTH = rect.width;
    HEIGHT = rect.height;

    renderBWVertices();
    buildTilePalette();
    drawGridDots();
    drawFD();
    render();
}

window.addEventListener("resize", resizeSVG);


/* ================== INIT ================= */
resizeSVG();
// renderBWVertices();
// buildTilePalette();
// drawGridDots();
// drawFD();
// render();
