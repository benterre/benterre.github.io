/* ============================================================================
 * DimerDatabase webapp
 * - name search with typeahead (keyboard + mouse)
 * - property search (config-driven criteria)
 * - toric-diagram drawing search (canonical polygon matching, identical
 *   algorithm to generate_db.py)
 * - theory page: common data + toric canvas, 3D Seiberg graph with phase
 *   selection, per-phase quiver / superpotential / tiling.
 * ========================================================================= */

"use strict";

const INDEX = window.DIMER_DB_INDEX || [];
const theoryCache = {};          // id -> full theory json
let currentTheory = null;
let currentPhase = 0;
let seibergGraph = null;

/* ============================= utilities ================================ */

function gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { [a, b] = [b, a % b]; } return a; }

function egcdPair(a, b) {
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

function convexHull(pts) {
    const P = [...new Map(pts.map(p => [`${p[0]},${p[1]}`, [p[0], p[1]]])).values()]
        .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    if (P.length <= 2) return P;
    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
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
    return lower.concat(upper);
}

// canonical polygon key — must match generate_db.canonical_frame exactly
function canonicalPolygonKey(points) {
    const hull = convexHull(points);
    if (hull.length < 3) return null;
    let best = null;
    for (const refl of [false, true]) {
        const V = refl ? hull.map(p => [p[0], -p[1]]).reverse() : hull.map(p => [p[0], p[1]]);
        const n = V.length;
        for (let i = 0; i < n; i++) {
            const A = V[i], B = V[(i + 1) % n];
            const ex = B[0] - A[0], ey = B[1] - A[1];
            const g = gcd(ex, ey);
            const dx = ex / g, dy = ey / g;
            const { x: aa, y: bb } = egcdPair(dx, dy);
            const pts = [];
            for (let k = 0; k < n; k++) {
                const p = V[(i + k) % n];
                const px = p[0] - A[0], py = p[1] - A[1];
                pts.push([aa * px + bb * py, -dy * px + dx * py]);
            }
            const C = pts[n - 1];
            const t = -Math.floor(C[0] / C[1]);
            const key = pts.map(p => `${p[0] + t * p[1]},${p[1]}`).join(";");
            if (best === null || key < best) best = key;
        }
    }
    return best;
}

// normalized string for name matching: "Y^{2,1}" -> "y21", "C/Z2 x Z2" -> "cz2xz2"
function normName(s) {
    return String(s).toLowerCase()
        .replace(/×/g, "x")
        .replace(/[\^{}_\s(),\[\]\/\\-]+/g, "")
        .replace(/\*/g, "x");
}

// TeX for theory names: dP3 -> \mathrm{dP}_3, C3/Z6 -> \mathbb{C}^3/\mathbb{Z}_6 ...
function nameToTeX(name) {
    let t = name;
    if (t === "C") return "\\mathcal{C}";  // conifold shorthand
    if (/^[A-Za-z0-9_ .\-]+$/.test(t) && !/\d/.test(t)) return null;  // plain word
    // raw package ids -> pretty forms (before underscore escaping)
    t = t.replace(/^L(\d+),(\d+),(\d+)_/, "L^{$1,$2,$3}/");
    t = t.replace(/^L(\d+),(\d+),(\d+)$/, "L^{$1,$2,$3}");
    t = t.replace(/^Y(\d+)(\d)$/, "Y^{$1,$2}");
    t = t.replace(/^X(\d+)(\d)$/, "X^{$1,$2}");
    t = t.replace(/^Z(\d)(\d)$/, "Z^{$1,$2}");
    t = t.replace(/^PP?2$/, "\\mathbb{P}^2");
    t = t.replace(/^C\^3$/, "\\mathbb{C}^3");
    t = t.replace(/ cover \[/, "\\text{ cover }[");
    t = t.replace(/\[HNF /, "[\\text{HNF}\\;");
    t = t.replace(/_/g, "\\_");   // raw underscores in ids/aliases must not subscript
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

// ---- MathJax queue: v3 typesetting is NOT re-entrant, so every typeset in
// the app is serialized through one promise chain.  Retries once when the
// library is still loading; falls back to plain text on real errors.
let _mjChain = Promise.resolve();

function _typesetQueued(el, fallbackText) {
    _mjChain = _mjChain.then(() => {
        const mj = window.MathJax;
        if (!(mj && mj.typesetPromise)) throw new Error("mathjax-not-ready");
        mj.typesetClear && mj.typesetClear([el]);
        return mj.typesetPromise([el]);
    }).catch(err => {
        const mj = window.MathJax;
        if (String(err && err.message) === "mathjax-not-ready" &&
            mj && mj.startup && mj.startup.promise && !el.__mjRetried) {
            el.__mjRetried = true;
            mj.startup.promise.then(() => _typesetQueued(el, fallbackText));
        } else if (fallbackText != null) {
            el.textContent = fallbackText;
        }
    });
}

function typeset(el, texOrText) {
    const tex = nameToTeX(texOrText);
    if (!tex) { el.textContent = texOrText; return; }
    el.innerHTML = "\\(" + tex + "\\)";
    _typesetQueued(el, texOrText);
}

function typesetRawTeX(el, tex, fallback) {
    el.innerHTML = "\\(" + tex + "\\)";
    _typesetQueued(el, fallback);
}

/* ======================= index preparation ============================== */

for (const e of INDEX) {
    e._norms = e.names.map(normName);
    e._key = canonicalPolygonKey(e.points);
    e._area2 = (() => {
        const h = e.hull;
        let s = 0;
        for (let i = 0; i < h.length; i++) {
            const a = h[i], b = h[(i + 1) % h.length];
            s += a[0] * b[1] - b[0] * a[1];
        }
        return Math.abs(s);
    })();
}
document.getElementById("dbCount").textContent = `${INDEX.length} theories`;

const KEY_LOOKUP = new Map();
for (const e of INDEX) if (e._key) KEY_LOOKUP.set(e._key, e.id);

/* ========================== name search ================================= */

function scoreName(entry, q) {
    let best = -1;
    for (const n of entry._norms) {
        let s = -1;
        if (n === q) s = 100;
        else if (n.startsWith(q)) s = 80 - (n.length - q.length);
        else if (n.includes(q)) s = 50 - n.indexOf(q);
        if (s > best) best = s;
    }
    return best;
}

function nameMatches(q) {
    const nq = normName(q);
    if (!nq) return [];
    return INDEX.map(e => [scoreName(e, nq), e])
        .filter(([s]) => s >= 0)
        .sort((a, b) => b[0] - a[0] || a[1].n_gauge - b[1].n_gauge)
        .map(([, e]) => e);
}

const searchInput = document.getElementById("nameSearch");
const suggBox = document.getElementById("suggestions");
let suggEntries = [];
let suggActive = -1;

function typesetContainer(el) {
    _typesetQueued(el, null);
}

// first `max` names that RENDER distinctly (raw ids like "L1,3,1_Z2 (0,0,1,1)"
// render identically to their pretty twins and must not repeat)
function displayNames(names, max) {
    const seen = new Set();
    const out = [];
    for (const n of names) {
        const key = nameToTeX(n) || n;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(n);
        if (out.length >= max) break;
    }
    return out;
}

function renderSuggestions() {
    if (!suggEntries.length) { suggBox.style.display = "none"; return; }
    suggBox.innerHTML = "";
    suggEntries.forEach((e, i) => {
        const div = document.createElement("div");
        div.className = "sugg" + (i === suggActive ? " active" : "");
        const nm = document.createElement("span");
        // render each name in LaTeX where possible
        displayNames(e.names, 3).forEach((n, k) => {
            if (k) nm.appendChild(document.createTextNode("  =  "));
            const s = document.createElement("span");
            const tex = nameToTeX(n);
            if (tex) s.innerHTML = "\\(" + tex + "\\)";
            else s.textContent = n;
            nm.appendChild(s);
        });
        const meta = document.createElement("span");
        meta.className = "meta";
        meta.textContent = `${e.n_gauge} gauge · ${e.n_phases} phase${e.n_phases > 1 ? "s" : ""}`;
        div.append(nm, meta);
        div.addEventListener("mousedown", ev => { ev.preventDefault(); openTheory(e.id); });
        div.addEventListener("mousemove", () => {
            if (suggActive !== i) {
                suggActive = i;
                [...suggBox.children].forEach((c, k) =>
                    c.classList.toggle("active", k === i));
            }
        });
        suggBox.appendChild(div);
    });
    suggBox.style.display = "block";
    typesetContainer(suggBox);
}

searchInput.addEventListener("input", () => {
    suggEntries = nameMatches(searchInput.value).slice(0, 8);
    // do NOT auto-highlight the first suggestion: plain Enter should show ALL
    // results (or open the theory only when there is a single match); the user
    // opts into a specific suggestion with the arrow keys or the mouse
    suggActive = -1;
    renderSuggestions();
});

searchInput.addEventListener("keydown", ev => {
    if (ev.key === "ArrowDown") {
        ev.preventDefault();
        if (suggEntries.length) { suggActive = (suggActive + 1) % suggEntries.length; renderSuggestions(); }
    } else if (ev.key === "ArrowUp") {
        ev.preventDefault();
        if (suggEntries.length) { suggActive = (suggActive - 1 + suggEntries.length) % suggEntries.length; renderSuggestions(); }
    } else if (ev.key === "Escape") {
        suggEntries = []; renderSuggestions();
    } else if (ev.key === "Enter") {
        ev.preventDefault();
        const dropdownChosen = suggActive >= 0 && suggBox.style.display === "block";
        suggBox.style.display = "none";
        if (dropdownChosen && suggEntries.length) {
            openTheory(suggEntries[suggActive].id);
            return;
        }
        if (!searchInput.value.trim()) {
            showResults(INDEX, `All ${INDEX.length} theories`);
            return;
        }
        const matches = nameMatches(searchInput.value);
        if (matches.length === 1) openTheory(matches[0].id);
        else showResults(matches,
            matches.length ? `${matches.length} matches for “${searchInput.value}”`
                : `No theory matches “${searchInput.value}”.`);
    }
});

searchInput.addEventListener("blur", () => setTimeout(() => { suggBox.style.display = "none"; }, 150));

/* ======================= property search ================================ */
// Config-driven criteria: add entries here (and matching fields in the index)
// to extend the search form.

// Family ids are internal; the user always sees a friendly label.
// text: for <option>/plain contexts, tex: for MathJax-rendered contexts.
const FAMILY_LABELS = {
    c3: { text: "ℂ³", tex: "\\mathbb{C}^3" },
    conifold: { text: "Conifold", tex: "\\text{Conifold}" },
    labc: { text: "L^{a,b,c}", tex: "L^{a,b,c}" },
    ypq: { text: "Y^{p,q}", tex: "Y^{p,q}" },
    xpq: { text: "X^{p,q}", tex: "X^{p,q}" },
    zpq: { text: "Z^{p,q}", tex: "Z^{p,q}" },
    habcd: { text: "H^{a,b,c,d}", tex: "H^{a,b,c,d}" },
    kabcd: { text: "K^{a,b,c,d}", tex: "K^{a,b,c,d}" },
    delpezzo: { text: "del Pezzo", tex: "\\text{del Pezzo}" },
    pseudo_delpezzo: { text: "pseudo del Pezzo", tex: "\\text{pseudo del Pezzo}" },
    reflexive: { text: "reflexive polygon", tex: "\\text{reflexive polygon}" },
    c3_orbifold: { text: "Orbifolds of ℂ³", tex: "\\text{Orbifolds of } \\mathbb{C}^3" },
    conifold_orbifold: { text: "Orbifolds of the conifold", tex: "\\text{Orbifolds of the conifold}" },
    labc_orbifold: { text: "Orbifolds of L^{a,b,c}", tex: "\\text{Orbifolds of } L^{a,b,c}" },
    ypq_orbifold: { text: "Orbifolds of Y^{p,q}", tex: "\\text{Orbifolds of } Y^{p,q}" },
    xpq_orbifold: { text: "Orbifolds of X^{p,q}", tex: "\\text{Orbifolds of } X^{p,q}" },
    zpq_orbifold: { text: "Orbifolds of Z^{p,q}", tex: "\\text{Orbifolds of } Z^{p,q}" },
    habcd_orbifold: { text: "Orbifolds of H^{a,b,c,d}", tex: "\\text{Orbifolds of } H^{a,b,c,d}" },
    kabcd_orbifold: { text: "Orbifolds of K^{a,b,c,d}", tex: "\\text{Orbifolds of } K^{a,b,c,d}" },
};
function famText(id) { return (FAMILY_LABELS[id] || { text: id }).text; }
function famTeX(id) { return (FAMILY_LABELS[id] || { tex: `\\text{${id}}` }).tex; }
function familiesOf(e) { return e.families || (e.family ? [e.family] : []); }

// which of a theory's names belong to a given family id (mirrors the
// name-based family derivation in generate_db.derive_families) — used to show
// the relevant name first when the results were filtered by that family
const FAMILY_NAME_TESTS = {
    c3: n => n === "C3",
    conifold: n => n === "Conifold",
    labc: n => /^L\^\{\d+,\d+,\d+\}$/.test(n),
    ypq: n => /^Y\^\{\d+,\d+\}$/.test(n),
    xpq: n => /^X\^\{\d+,\d+\}$/.test(n),
    zpq: n => /^Z\^\{\d+,\d+\}$/.test(n),
    habcd: n => /^H\^\{\d+,\d+,\d+,\d+\}$/.test(n),
    kabcd: n => /^K\^\{\d+,\d+,\d+,\d+\}$/.test(n),
    delpezzo: n => /^dP\d+$/.test(n),
    pseudo_delpezzo: n => /^PdP/.test(n),
    c3_orbifold: n => /^C3\//.test(n),
    conifold_orbifold: n => /^(C|Conifold|L\^\{1,1,1\})\//.test(n),
    labc_orbifold: n => /^L\^\{\d+,\d+,\d+\}\//.test(n),
    ypq_orbifold: n => /^Y\^\{\d+,\d+\}\//.test(n),
    xpq_orbifold: n => /^X\^\{\d+,\d+\}\//.test(n),
    zpq_orbifold: n => /^Z\^\{\d+,\d+\}\//.test(n),
    habcd_orbifold: n => /^H\^\{\d+,\d+,\d+,\d+\}\//.test(n),
    kabcd_orbifold: n => /^K\^\{\d+,\d+,\d+,\d+\}\//.test(n),
};

// reorder names so those belonging to `famId` come first (stable otherwise)
function namesFamilyFirst(names, famId) {
    const test = famId && FAMILY_NAME_TESTS[famId];
    if (!test) return names;
    const match = names.filter(test), rest = names.filter(n => !test(n));
    return match.length ? [...match, ...rest] : names;
}

// toric point classification (index carries precomputed counts; fall back to
// hull/points for any older index that predates them)
function vertexPoints(e) { return e.n_vertices != null ? e.n_vertices : e.hull.length; }
function edgePoints(e) {
    if (e.n_edge != null) return e.n_edge;
    return e.n_points - e.n_internal - e.hull.length;
}

const CRITERIA = [
    { key: "n_gauge", label: "gauge groups", type: "range", get: e => [e.n_gauge] },
    { key: "n_chirals", label: "chiral multiplets (any phase)", type: "range", get: e => e.n_chirals },
    { key: "n_W_terms", label: "superpotential terms (any phase)", type: "range", get: e => e.n_W_terms },
    { key: "n_phases", label: "toric phases", type: "range", get: e => [e.n_phases] },
    { key: "n_internal", label: "internal toric points", type: "range", get: e => [e.n_internal] },
    { key: "n_edge", label: "edge toric points", type: "range", get: e => [edgePoints(e)] },
    { key: "n_vertices", label: "external toric points", type: "range", get: e => [vertexPoints(e)] },
    {
        key: "a_charge", label: "a-central charge (±2%)", type: "value",
        get: e => e.a_charge != null ? [e.a_charge] : [],
        match: (vals, x) => vals.some(v => Math.abs(v - x) <= 0.02 * Math.max(1e-9, Math.abs(x)))
    },
    {
        key: "family", label: "family", type: "select", mathjax: true,
        options: () => [...new Set(INDEX.flatMap(familiesOf))]
            .sort((a, b) => famText(a).localeCompare(famText(b))),
        optionLabel: famText,
        optionTeX: famTeX,
        get: e => familiesOf(e)
    },
];

function buildPropForm() {
    const grid = document.getElementById("propGrid");
    grid.innerHTML = "";
    for (const c of CRITERIA) {
        const div = document.createElement("div");
        div.className = "prop";
        const lab = document.createElement("label");
        lab.textContent = c.label;
        div.appendChild(lab);
        if (c.type === "range") {
            const row = document.createElement("div");
            row.className = "range";
            const lo = document.createElement("input");
            lo.type = "number"; lo.placeholder = "min"; lo.id = `prop_${c.key}_lo`;
            const hi = document.createElement("input");
            hi.type = "number"; hi.placeholder = "max"; hi.id = `prop_${c.key}_hi`;
            row.append(lo, hi);
            div.appendChild(row);
        } else if (c.type === "value") {
            const inp = document.createElement("input");
            inp.type = "number"; inp.step = "any"; inp.placeholder = "value"; inp.id = `prop_${c.key}`;
            div.appendChild(inp);
        } else if (c.type === "select" && c.mathjax) {
            div.appendChild(buildMathSelect(c));
        } else if (c.type === "select") {
            const sel = document.createElement("select");
            sel.id = `prop_${c.key}`;
            const opt0 = document.createElement("option");
            opt0.value = ""; opt0.textContent = "any";
            sel.appendChild(opt0);
            for (const o of c.options()) {
                const opt = document.createElement("option");
                opt.value = o;
                opt.textContent = c.optionLabel ? c.optionLabel(o) : o;
                sel.appendChild(opt);
            }
            div.appendChild(sel);
        }
        grid.appendChild(div);
    }
}

// A lightweight custom dropdown whose options render through MathJax (native
// <option> elements cannot show typeset math).  A hidden <input id=prop_KEY>
// holds the value so runPropSearch reads it exactly like a native <select>.
function buildMathSelect(c) {
    const wrap = document.createElement("div");
    wrap.className = "mathselect";
    const val = document.createElement("input");
    val.type = "hidden"; val.id = `prop_${c.key}`; val.value = "";
    const btn = document.createElement("div");
    btn.className = "ms-btn"; btn.tabIndex = 0; btn.textContent = "any";
    const panel = document.createElement("div");
    panel.className = "ms-panel hidden";

    const items = [["", "any", "\\text{any}"]];
    for (const o of c.options())
        items.push([o, c.optionLabel(o), c.optionTeX ? c.optionTeX(o) : null]);

    for (const [value, text, tex] of items) {
        const opt = document.createElement("div");
        opt.className = "ms-opt";
        if (tex) typesetRawTeX(opt, tex, text); else opt.textContent = text;
        opt.addEventListener("mousedown", (ev) => {
            ev.preventDefault();
            val.value = value;
            btn.innerHTML = "";
            if (tex && value) typesetRawTeX(btn, tex, text);
            else btn.textContent = text;
            panel.classList.add("hidden");
        });
        panel.appendChild(opt);
    }
    btn.addEventListener("click", () => panel.classList.toggle("hidden"));
    btn.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); panel.classList.toggle("hidden"); }
        if (e.key === "Escape") panel.classList.add("hidden");
    });
    document.addEventListener("click", (e) => {
        if (!wrap.contains(e.target)) panel.classList.add("hidden");
    });
    wrap.append(val, btn, panel);
    return wrap;
}

function runPropSearch() {
    let entries = INDEX;
    const parts = [];
    let famFilter = null;
    for (const c of CRITERIA) {
        if (c.type === "range") {
            const lo = parseFloat(document.getElementById(`prop_${c.key}_lo`).value);
            const hi = parseFloat(document.getElementById(`prop_${c.key}_hi`).value);
            if (!isNaN(lo) || !isNaN(hi)) {
                parts.push(c.label);
                entries = entries.filter(e => c.get(e).some(v =>
                    (isNaN(lo) || v >= lo) && (isNaN(hi) || v <= hi)));
            }
        } else if (c.type === "value") {
            const x = parseFloat(document.getElementById(`prop_${c.key}`).value);
            if (!isNaN(x)) {
                parts.push(c.label);
                entries = entries.filter(e => c.match(c.get(e), x));
            }
        } else if (c.type === "select") {
            const v = document.getElementById(`prop_${c.key}`).value;
            if (v) {
                parts.push(c.label);
                entries = entries.filter(e => c.get(e).includes(v));
                if (c.key === "family") famFilter = v;
            }
        }
    }
    if (!parts.length) { showResults([], "Set at least one criterion."); return; }
    if (entries.length === 1) { openTheory(entries[0].id); return; }
    showResults(entries, entries.length
        ? `${entries.length} theories match (${parts.join(", ")})`
        : "No theory matches those criteria.", famFilter);
}

/* ===================== toric drawing search ============================= */

const drawState = { points: new Set(), N: 8 };
const drawCanvas = document.getElementById("drawCanvas");

function drawCellGeometry() {
    const N = drawState.N, w = drawCanvas.width;
    const step = w / N;
    return { N, step, off: step / 2 };
}

function renderDrawCanvas() {
    const ctx = drawCanvas.getContext("2d");
    const { N, step, off } = drawCellGeometry();
    ctx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
    ctx.fillStyle = "#20283e";
    for (let i = 0; i < N; i++)
        for (let j = 0; j < N; j++) {
            ctx.beginPath();
            ctx.arc(off + i * step, drawCanvas.height - (off + j * step), 2.4, 0, 7);
            ctx.fill();
        }
    const pts = [...drawState.points].map(s => s.split(",").map(Number));
    if (pts.length >= 3) {
        const hull = convexHull(pts);
        ctx.beginPath();
        hull.forEach((p, i) => {
            const X = off + p[0] * step, Y = drawCanvas.height - (off + p[1] * step);
            i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y);
        });
        ctx.closePath();
        ctx.fillStyle = "rgba(94,234,212,0.10)";
        ctx.strokeStyle = "#5eead4";
        ctx.lineWidth = 1.5;
        ctx.fill();
        ctx.stroke();
    }
    ctx.fillStyle = "#5eead4";
    for (const p of pts) {
        ctx.beginPath();
        ctx.arc(off + p[0] * step, drawCanvas.height - (off + p[1] * step), 6, 0, 7);
        ctx.fill();
    }
}

function updateDrawMatch() {
    const box = document.getElementById("drawMatch");
    const pts = [...drawState.points].map(s => s.split(",").map(Number));
    drawState.matchId = null;
    if (pts.length < 3) {
        box.innerHTML = '<span class="none">— draw at least 3 points —</span>';
        return;
    }
    const key = canonicalPolygonKey(pts);
    const id = key && KEY_LOOKUP.get(key);
    if (id) {
        drawState.matchId = id;
        const e = INDEX.find(x => x.id === id);
        box.innerHTML = "";
        const disp = displayNames(e.names, 3);
        const span = document.createElement("span");
        box.appendChild(span);
        typeset(span, disp[0]);
        if (disp.length > 1) {
            const rest = document.createElement("span");
            rest.style.cssText = "color:var(--muted);font-size:13px;margin-left:10px;";
            disp.slice(1).forEach((n, i) => {
                if (i) rest.appendChild(document.createTextNode("  =  "));
                const s = document.createElement("span");
                typeset(s, n);
                rest.appendChild(s);
            });
            box.appendChild(rest);
        }
    } else {
        box.innerHTML = '<span class="none">no match in the database</span>';
    }
}

drawCanvas.addEventListener("pointerdown", ev => {
    const r = drawCanvas.getBoundingClientRect();
    const { N, step, off } = drawCellGeometry();
    const x = (ev.clientX - r.left) * (drawCanvas.width / r.width);
    const y = (ev.clientY - r.top) * (drawCanvas.height / r.height);
    const i = Math.round((x - off) / step);
    const j = Math.round((drawCanvas.height - y - off) / step);
    if (i < 0 || i >= N || j < 0 || j >= N) return;
    const k = `${i},${j}`;
    drawState.points.has(k) ? drawState.points.delete(k) : drawState.points.add(k);
    renderDrawCanvas();
    updateDrawMatch();
});

document.getElementById("drawClearBtn").addEventListener("click", () => {
    drawState.points.clear();
    renderDrawCanvas();
    updateDrawMatch();
});

document.getElementById("drawSearchBtn").addEventListener("click", () => {
    if (drawState.matchId) openTheory(drawState.matchId);
    else showResults([], "The drawn toric diagram matches no database entry.");
});

/* ========================== results grid ================================ */

function miniToric(canvas, entry, size = 86) {
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext("2d");
    const xs = entry.points.map(p => p[0]), ys = entry.points.map(p => p[1]);
    const maxX = Math.max(...xs, 1), maxY = Math.max(...ys, 1);
    const pad = 12, cell = Math.min((size - 2 * pad) / Math.max(maxX, 1), (size - 2 * pad) / Math.max(maxY, 1));
    const ox = (size - cell * maxX) / 2, oy = (size + cell * maxY) / 2;
    const P = p => [ox + p[0] * cell, oy - p[1] * cell];
    ctx.beginPath();
    entry.hull.forEach((p, i) => { const [X, Y] = P(p); i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); });
    ctx.closePath();
    ctx.fillStyle = "rgba(167,139,250,0.14)";
    ctx.strokeStyle = "#a78bfa";
    ctx.lineWidth = 1.2;
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#e8ecf5";
    for (const p of entry.points) {
        const [X, Y] = P(p);
        ctx.beginPath();
        ctx.arc(X, Y, 2.6, 0, 7);
        ctx.fill();
    }
}

function showResults(entries, msg, highlightFamily = null) {
    const box = document.getElementById("results");
    const m = document.getElementById("resultsMsg");
    m.textContent = msg || "";
    m.className = entries.length ? "" : "error";
    box.innerHTML = "";
    for (const e of entries.slice(0, 120)) {
        const card = document.createElement("div");
        card.className = "card rcard";
        const info = document.createElement("div");
        info.className = "tinfo";
        const chips = document.createElement("div");
        chips.className = "chips";
        for (const f of familiesOf(e)) {
            const chip = document.createElement("span");
            chip.className = "chip";
            typesetRawTeX(chip, famTeX(f), famText(f));
            chips.appendChild(chip);
        }
        const h = document.createElement("h3");
        // when filtered by a family, show that family's name first so the card
        // reveals which member of the family the theory is
        displayNames(namesFamilyFirst(e.names, highlightFamily), 2).forEach((n, i) => {
            if (i) h.appendChild(document.createTextNode("  =  "));
            const sp = document.createElement("span");
            typeset(sp, n);
            h.appendChild(sp);
        });
        const stats = document.createElement("div");
        stats.className = "stats";
        stats.innerHTML =
            `${e.n_gauge} gauge groups · ${e.n_phases} phase${e.n_phases > 1 ? "s" : ""}<br>` +
            (e.a_charge != null ? `a = ${(+e.a_charge).toFixed(5)}<br>` : "") +
            `${e.n_internal} internal · ${edgePoints(e)} edge · ${vertexPoints(e)} external`;
        info.append(chips, h, stats);
        const cv = document.createElement("canvas");
        cv.className = "rtoric";
        miniToric(cv, e);
        card.append(info, cv);
        card.addEventListener("click", () => openTheory(e.id));
        box.appendChild(card);
    }
}

/* ====================== theory page: loading ============================ */

window.__DIMER_DB_LOAD__ = function (t) { theoryCache[t.id] = t; };

function loadTheory(id) {
    return new Promise((resolve, reject) => {
        if (theoryCache[id]) return resolve(theoryCache[id]);
        const s = document.createElement("script");
        s.src = `db/theories/${id}.js`;
        s.onload = () => theoryCache[id] ? resolve(theoryCache[id]) : reject(new Error("bad theory file"));
        s.onerror = () => reject(new Error("theory not found: " + id));
        document.head.appendChild(s);
    });
}

function openTheory(id, phase = 0) {
    location.hash = `#/theory/${encodeURIComponent(id)}`;
}

/* ====================== theory page: rendering ========================== */

function renderTheory(t) {
    currentTheory = t;
    currentPhase = 0;
    document.getElementById("homePage").classList.add("hidden");
    document.getElementById("theoryPage").classList.remove("hidden");

    typeset(document.getElementById("tTitle"), t.names[0]);
    // aliases: MathJax-rendered, deduplicated by rendered form (raw ids like
    // "Y10" / "L1,1,1" collapse onto their pretty twins instead of showing)
    const alBox = document.getElementById("tAliases");
    alBox.innerHTML = "";
    const seen = new Set([nameToTeX(t.names[0]) || t.names[0]]);
    const aliases = [];
    for (const nm of t.names.slice(1)) {
        const tex = nameToTeX(nm);
        const key = tex || nm;
        if (seen.has(key)) continue;
        seen.add(key);
        aliases.push({ nm, tex });
    }
    if (aliases.length) {
        alBox.appendChild(document.createTextNode("also known as:  "));
        aliases.forEach((a, i) => {
            if (i) alBox.appendChild(document.createTextNode("   ·   "));
            const sp = document.createElement("span");
            if (a.tex) typesetRawTeX(sp, a.tex, a.nm);
            else sp.textContent = a.nm;
            alBox.appendChild(sp);
        });
    }

    const kv = document.getElementById("tCommon");
    kv.innerHTML = "";
    const rows = [
        ["families", familiesOf(t).length ? {
            tex: familiesOf(t).map(famTeX).join(",\\;\\; "),
            text: familiesOf(t).map(famText).join(", ")
        } : "—"],
        ["gauge groups", t.n_gauge],
        ["toric phases", t.n_phases + (t.phases_truncated ? "  (truncated)" : "")],
        ["a-central charge", t.a_charge != null ? (+t.a_charge).toFixed(8) : "—"],
        ["toric points", toricPointBreakdown(t)],
        ["chirals (phase 1)", t.phases[0].n_chirals, "kvChirals"],
        ["W terms (phase 1)", t.phases[0].n_W_terms, "kvWterms"],
    ];
    for (const [k, v, id] of rows) {
        const dk = document.createElement("div"); dk.className = "k"; dk.textContent = k;
        const dv = document.createElement("div"); dv.className = "v";
        if (v && typeof v === "object" && v.tex) typesetRawTeX(dv, v.tex, v.text);
        else dv.textContent = v;
        if (id) { dk.id = id + "K"; dv.id = id + "V"; }
        kv.append(dk, dv);
    }
    const gl = document.getElementById("glsmDetails");
    if (t.glsm_R && t.glsm_R.length) {
        gl.classList.remove("hidden");
        const gb = document.getElementById("glsmBox");
        const tbl = document.createElement("table");
        tbl.className = "rt";
        tbl.innerHTML = "<tr><th>GLSM field</th><th>U(1)<sub>R</sub></th></tr>" +
            t.glsm_R.map((r, i) =>
                `<tr><td>\\(p_{${i + 1}}\\)</td><td class="num">${r}</td></tr>`).join("");
        gb.innerHTML = "";
        gb.appendChild(tbl);
        typesetContainer(gb);
        const lbl = glsmToricLabels(t);
        document.getElementById("glsmNote").textContent = lbl
            ? "labels drawn on the toric diagram while this panel is open (corner order follows the package's GLSM ordering)"
            : "GLSM count does not match the polygon corners — labels shown in the table only";
        gl.ontoggle = () => drawToricDiagram(
            document.getElementById("toricCanvas"), phaseToric(t, currentPhase),
            gl.open ? glsmToricLabels(t) : null);
    } else {
        gl.classList.add("hidden");
        gl.ontoggle = null;
    }

    buildSeibergGraph(t);
    buildPhasePills(t);
    renderPhase(0);
    window.scrollTo(0, 0);
}

// internal / edge / external (vertex) breakdown of a theory's toric diagram
function toricPointBreakdown(t) {
    const hull = t.toric.hull, n = hull.length;
    const interior = p => {
        for (let i = 0; i < n; i++) {
            const a = hull[i], b = hull[(i + 1) % n];
            if ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]) <= 0)
                return false;
        }
        return true;
    };
    const internal = t.toric.points.filter(interior).length;
    const edge = t.toric.points.length - internal - n;
    return `${internal} internal · ${edge} edge · ${n} external`;
}

// toric block with the SELECTED phase's GLSM multiplicities (perfect-matching
// counts are phase-dependent); points without per-phase data show as plain
// dots rather than inheriting another phase's numbers
function phaseToric(t, i) {
    const p = t.phases[i];
    const mult = p && p.glsm_mult;
    return {
        hull: t.toric.hull,
        points: t.toric.points.map(([x, y]) => {
            const m = mult ? mult[`${x},${y}`] : null;
            return [x, y, m != null ? m : null];
        }),
    };
}

function area2(hull) {
    let s = 0;
    for (let i = 0; i < hull.length; i++) {
        const a = hull[i], b = hull[(i + 1) % hull.length];
        s += a[0] * b[1] - b[0] * a[1];
    }
    return Math.abs(s);
}

// heuristic p_i placement: the nonzero GLSM R-charges correspond to the
// extremal (corner) perfect matchings; when the counts agree, corners are
// labelled in the package's GLSM order
function glsmToricLabels(t) {
    if (!t.glsm_R) return null;
    const nz = t.glsm_R.map((r, i) => [r, i]).filter(([r]) => Math.abs(r) > 1e-6);
    const hull = t.toric.hull;
    if (nz.length !== hull.length) return null;
    return hull.map((p, k) => ({ x: p[0], y: p[1], label: `p${nz[k][1] + 1}` }));
}

function drawToricDiagram(canvas, toric, glsmLabels = null) {
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const pts = toric.points;
    const maxX = Math.max(...pts.map(p => p[0]), 1);
    const maxY = Math.max(...pts.map(p => p[1]), 1);
    const pad = 30;
    const cell = Math.min((canvas.width - 2 * pad) / Math.max(maxX, 1),
        (canvas.height - 2 * pad) / Math.max(maxY, 1), 60);
    const ox = (canvas.width - cell * maxX) / 2;
    const oy = (canvas.height + cell * maxY) / 2;
    const P = p => [ox + p[0] * cell, oy - p[1] * cell];
    // ambient lattice
    ctx.fillStyle = "#273049";
    for (let x = 0; x <= maxX; x++)
        for (let y = 0; y <= maxY; y++) {
            const [X, Y] = P([x, y]);
            ctx.beginPath(); ctx.arc(X, Y, 2, 0, 7); ctx.fill();
        }
    ctx.beginPath();
    toric.hull.forEach((p, i) => { const [X, Y] = P(p); i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); });
    ctx.closePath();
    ctx.fillStyle = "rgba(94,234,212,0.08)";
    ctx.strokeStyle = "#5eead4";
    ctx.lineWidth = 1.6;
    ctx.fill(); ctx.stroke();
    for (const p of pts) {
        const [X, Y] = P(p);
        ctx.beginPath();
        ctx.arc(X, Y, 5.5, 0, 7);
        ctx.fillStyle = "#e8ecf5";
        ctx.fill();
        if (p[2] != null && p[2] !== 1) {
            ctx.fillStyle = "#f9a8d4";
            ctx.font = "bold 12px sans-serif";
            ctx.fillText(String(p[2]), X + 8, Y - 7);
        }
    }
    if (glsmLabels) {
        ctx.font = "italic bold 12px serif";
        ctx.fillStyle = "#5eead4";
        for (const g of glsmLabels) {
            const [X, Y] = P([g.x, g.y]);
            ctx.fillText(g.label, X + 8, Y + 14);
        }
    }
}

/* -------------------- Seiberg duality 3D graph -------------------------- */

function buildSeibergGraph(t) {
    const el = document.getElementById("seibergGraph");
    el.innerHTML = "";
    document.getElementById("seibergHint").textContent =
        t.n_phases === 1 ? "single toric phase" :
            `${t.n_phases} toric phases — edge label = dualized gauge node`;
    if (typeof ForceGraph3D === "undefined") {
        el.innerHTML = '<div style="padding:20px;color:var(--muted)">3d-force-graph unavailable (offline?) — use the phase pills below.</div>';
        seibergGraph = null;
        return;
    }
    const nodes = t.seiberg.nodes.map(i => ({ id: i }));
    const links = t.seiberg.links
        .filter(l => l.source !== l.target)
        .map(l => ({ source: l.source, target: l.target, face: l.face }));

    // large graphs (hundreds-thousands of phases): per-node meshes/sprites and
    // the incremental build-up animation would freeze the page — render once
    // with plain nodes and a bounded simulation instead.
    const big = nodes.length > 250;
    const hasTHREE = typeof THREE !== "undefined" && !big;
    const wrap = document.getElementById("seibergWrap");
    seibergGraph = ForceGraph3D()(el)
        .width(el.clientWidth || wrap.clientWidth || 1100)
        .height(el.clientHeight || 378)
        .backgroundColor("rgba(0,0,0,0)")
        .showNavInfo(false)
        .nodeLabel(n => `phase ${n.id + 1}`)
        .linkColor(() => "#a78bfa")
        .linkOpacity(big ? 0.45 : 0.7)
        .linkWidth(big ? 0.6 : 1.2)
        .onNodeClick(node => selectPhase(node.id))
        .graphData({ nodes: [], links: [] });
    if (big)
        seibergGraph.cooldownTicks(200).warmupTicks(50)
            .nodeResolution(4).enableNodeDrag(false);
    seibergGraph.__big = big;

    if (hasTHREE) {
        seibergGraph
            .nodeThreeObject(node => {
                const group = new THREE.Group();
                const size = 9;
                const mat = new THREE.MeshLambertMaterial({
                    color: node.id === currentPhase ? 0x5eead4 : 0x8b93b5,
                    transparent: true, opacity: 0.95
                });
                const cube = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), mat);
                group.add(cube);
                const sprite = makeTextSprite(String(node.id + 1),
                    node.id === currentPhase ? "#031412" : "#0b0e17", 40);
                sprite.position.set(0, 0, size / 2 + 0.6);
                group.add(sprite);
                return group;
            });
    } else {
        seibergGraph.nodeColor(n => n.id === currentPhase ? "#5eead4" : "#8b93b5");
    }

    if (big) {
        // no build-up animation: one single graphData call
        seibergGraph.graphData({ nodes, links });
        return;
    }
    // build-up animation with a fixed total duration (~3 s) regardless of
    // graph size; batch node insertions for very large graphs
    const TOTAL_MS = 3000;
    const stepMs = Math.max(25, TOTAL_MS / nodes.length);
    const perTick = Math.max(1, Math.ceil(nodes.length * 25 / TOTAL_MS));
    let step = 0;
    const timer = setInterval(() => {
        step = Math.min(nodes.length, step + perTick);
        const ns = nodes.slice(0, step);
        const have = new Set(ns.map(n => n.id));
        const ls = links.filter(l => have.has(idOf(l.source)) && have.has(idOf(l.target)));
        seibergGraph.graphData({ nodes: ns, links: ls.map(l => ({ ...l })) });
        if (step >= nodes.length) clearInterval(timer);
    }, Math.max(25, stepMs));
}

function idOf(x) { return typeof x === "object" ? x.id : x; }

function makeTextSprite(text, color, px = 34) {
    const canvas = document.createElement("canvas");
    canvas.width = 128; canvas.height = 64;
    const ctx = canvas.getContext("2d");
    ctx.font = `bold ${px}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = color;
    ctx.fillText(text, 64, 32);
    const tex = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
    const sp = new THREE.Sprite(mat);
    sp.scale.set(16, 8, 1);
    return sp;
}

function refreshSeibergColors() {
    if (!seibergGraph) return;
    if (typeof THREE !== "undefined" && !seibergGraph.__big)
        seibergGraph.nodeThreeObject(seibergGraph.nodeThreeObject());
    else
        seibergGraph.nodeColor(seibergGraph.nodeColor());
}

/* ------------------------- phase rendering ------------------------------ */

function buildPhasePills(t) {
    const box = document.getElementById("phasePills");
    box.innerHTML = "";
    t.phases.forEach((p, i) => {
        const b = document.createElement("button");
        b.className = "pill" + (i === currentPhase ? " active" : "");
        b.textContent = `phase ${i + 1}`;
        b.addEventListener("click", () => selectPhase(i));
        box.appendChild(b);
    });
}

function selectPhase(i) {
    if (!currentTheory || i == null || i < 0 || i >= currentTheory.phases.length) return;
    currentPhase = i;
    [...document.getElementById("phasePills").children].forEach((b, k) =>
        b.classList.toggle("active", k === i));
    refreshSeibergColors();
    renderPhase(i);
}

function renderPhase(i) {
    const t = currentTheory;
    const p = t.phases[i];
    buildCopyPayloads(t, p);

    // phase-dependent common block: GLSM multiplicities on the toric diagram
    // and the chiral / W-term counts
    const gl = document.getElementById("glsmDetails");
    drawToricDiagram(document.getElementById("toricCanvas"), phaseToric(t, i),
        (gl && gl.open && !gl.classList.contains("hidden"))
            ? glsmToricLabels(t) : null);
    const ck = document.getElementById("kvChiralsK");
    if (ck) {
        ck.textContent = `chirals (phase ${i + 1})`;
        document.getElementById("kvChiralsV").textContent = p.n_chirals;
        document.getElementById("kvWtermsK").textContent = `W terms (phase ${i + 1})`;
        document.getElementById("kvWtermsV").textContent = p.n_W_terms;
    }

    drawQuiver(document.getElementById("quiverCanvas"), t.n_gauge, p);
    drawTiling(document.getElementById("tilingCanvas"), p.tiling);
    document.getElementById("tilingNote").textContent = p.tiling
        ? (p.tiling.source === "geom" ? "exact tiling geometry" : "harmonic torus embedding")
        : "tiling data unavailable for this phase";

    // superpotential
    const wBox = document.getElementById("wBox");
    if (p.W_latex) {
        const terms = wDisplayTerms(p);
        typesetRawTeX(wBox, "\\begin{aligned}W ={}& " + terms.join(" \\\\ & ") + "\\end{aligned}", p.W_latex);
    } else wBox.textContent = "—";

    document.getElementById("phaseStats").textContent =
        `${p.n_chirals} chiral multiplets · ${p.n_W_terms} superpotential terms` +
        (p.zigzags ? ` · ${p.zigzags.length} zigzag paths` : "") +
        (p.glsm_mult ? ` · ${Object.values(p.glsm_mult).reduce((a, b) => a + b, 0)} perfect matchings` : "");

    // R-charges table (LaTeX chiral labels, bordered cells)
    const rBox = document.getElementById("rBox");
    rBox.innerHTML = "";
    if (p.R) {
        const labels = chiralTeXLabels(p);
        const tbl = document.createElement("table");
        tbl.className = "rt";
        tbl.innerHTML = "<tr><th>chiral field</th><th>U(1)<sub>R</sub></th></tr>" +
            p.R.map((r, e) =>
                `<tr><td>\\(${labels[e]}\\)</td><td class="num">${r}</td></tr>`).join("");
        rBox.appendChild(tbl);
        typesetContainer(rBox);
        document.getElementById("rDetails").classList.remove("hidden");
    } else document.getElementById("rDetails").classList.add("hidden");

    // zigzag paths: table of chiral-field products in LaTeX
    if (p.zigzags) {
        const labels = chiralTeXLabels(p);
        const zzBox = document.getElementById("zzBox");
        const tbl = document.createElement("table");
        tbl.className = "rt";
        tbl.innerHTML = "<tr><th>path</th><th>chiral fields</th></tr>" +
            p.zigzags.map((z, k) =>
                `<tr><td>\\(z_{${k + 1}}\\)</td>` +
                `<td>\\(${z.map(e => labels[e]).join("\\,")}\\)</td></tr>`).join("");
        zzBox.innerHTML = "";
        zzBox.appendChild(tbl);
        typesetContainer(zzBox);
        document.getElementById("zzDetails").classList.remove("hidden");
    } else document.getElementById("zzDetails").classList.add("hidden");

    // PM matrix as a LaTeX matrix (array environment: no column limit)
    const pmBox = document.getElementById("pmBox");
    if (p.pm_matrix) {
        const rows = p.pm_matrix.length, cols = p.pm_matrix[0].length;
        if (cols <= 40) {
            const spec = "c".repeat(cols);
            const tex = "P = \\left(\\begin{array}{" + spec + "} " +
                p.pm_matrix.map(r => r.join(" & ")).join(" \\\\ ") +
                " \\end{array}\\right)";
            pmBox.innerHTML = "\\(" + tex + "\\)";
            typesetContainer(pmBox);
        } else {
            pmBox.innerHTML = "";
            const pre = document.createElement("pre");
            pre.className = "mono";
            pre.textContent = p.pm_matrix.map(r => r.join(" ")).join("\n");
            pmBox.appendChild(pre);
        }
        document.getElementById("pmDetails").classList.remove("hidden");
    } else document.getElementById("pmDetails").classList.add("hidden");
}

// LaTeX labels for the chiral fields of a phase: X_{i,j}, with a superscript
// copy index when several arrows share the same nodes
function chiralTeXLabels(phase) {
    const pairCount = {}, seen = {};
    const E = phase.n_chirals;
    for (let e = 0; e < E; e++) {
        const k = phase.Q[0][e] + "," + phase.Q[1][e];
        pairCount[k] = (pairCount[k] || 0) + 1;
    }
    const out = [];
    for (let e = 0; e < E; e++) {
        const i = phase.Q[0][e] + 1, j = phase.Q[1][e] + 1;
        const k = phase.Q[0][e] + "," + phase.Q[1][e];
        seen[k] = (seen[k] || 0) + 1;
        out.push(pairCount[k] === 1
            ? `X_{${i},${j}}`
            : `X^{(${seen[k]})}_{${i},${j}}`);
    }
    return out;
}

// Signed term strings for the superpotential, rebuilt from the quiver edges so
// the displayed field labels X_{i,j} start at 1 (matching the quiver, tiling
// and R-charge table) even though the stored data is 0-based.  Replicates the
// package's exact latex style: X_{ij} concatenated for <10 nodes, X_{i,j} with
// a comma once a label reaches 10, X^k_{i,j} for the k-th parallel edge.
function wDisplayTerms(p) {
    if (!p.W || !p.Q) return splitWLatex(p.W_latex || "");
    const Q = p.Q, E = Q[0].length;
    let maxNode = 0;
    for (const row of Q) for (const v of row) if (v > maxNode) maxNode = v;
    const sep = (maxNode + 1 >= 10) ? "," : "";     // labels run 1..maxNode+1
    const dic = {}, symbols = [];
    for (let e = 0; e < E; e++) {
        const i = Q[0][e] + 1, j = Q[1][e] + 1, key = i + "," + j;
        if (dic[key]) { dic[key]++; symbols.push(`X^{${dic[key]}}_{${i},${j}}`); }
        else { dic[key] = 1; symbols.push(`X_{${i}${sep}${j}}`); }
    }
    return p.W.map(([sign, edges]) =>
        (sign < 0 ? "-" : "+") + edges.map(e => symbols[e]).join(""));
}

// split the package's W latex "AB+CD-EF" into signed term strings
function splitWLatex(w) {
    const terms = [];
    let cur = "", depth = 0;
    for (const ch of w) {
        if (ch === "{") depth++;
        if (ch === "}") depth--;
        if ((ch === "+" || ch === "-") && depth === 0 && cur.trim()) {
            terms.push(cur);
            cur = ch;
        } else cur += ch;
    }
    if (cur.trim()) terms.push(cur);
    return terms.map((t, i) => (i === 0 && !t.startsWith("-") ? "+" : "") + t);
}

/* --------------------------- quiver drawing ----------------------------- */

function drawQuiver(canvas, nFaces, phase) {
    const ctx = canvas.getContext("2d");
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    const cx = W / 2, cy = H / 2;
    const R = Math.min(W, H) / 2 - 40;
    const NR = 15;
    const pos = [];
    for (let i = 0; i < nFaces; i++) {
        const a = -Math.PI / 2 + 2 * Math.PI * i / nFaces;
        pos.push(nFaces === 1 ? [cx, cy + 20] : [cx + R * Math.cos(a), cy + R * Math.sin(a)]);
    }
    const arrows = phase.Q[0].map((s, e) => ({ from: s, to: phase.Q[1][e], e }));
    const groups = new Map();
    for (const a of arrows) {
        const key = a.from <= a.to ? `${a.from},${a.to}` : `${a.to},${a.from}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(a);
    }
    ctx.strokeStyle = "#9aa7c7";
    ctx.fillStyle = "#9aa7c7";
    ctx.lineWidth = 1.3;

    function arrowHead(x, y, ang) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - 8 * Math.cos(ang - 0.42), y - 8 * Math.sin(ang - 0.42));
        ctx.lineTo(x - 8 * Math.cos(ang + 0.42), y - 8 * Math.sin(ang + 0.42));
        ctx.closePath();
        ctx.fill();
    }

    groups.forEach((list, key) => {
        const [i, j] = key.split(",").map(Number);
        if (i === j) {
            const p = pos[i];
            const out = nFaces === 1 ? -Math.PI / 2 : Math.atan2(p[1] - cy, p[0] - cx);
            list.forEach((a, k) => {
                const L = 38 + 17 * k, spread = 0.55;
                const a1 = out - spread, a2 = out + spread;
                const sx = p[0] + NR * Math.cos(a1), sy = p[1] + NR * Math.sin(a1);
                const exx = p[0] + NR * Math.cos(a2), exy = p[1] + NR * Math.sin(a2);
                const c1x = p[0] + L * Math.cos(a1), c1y = p[1] + L * Math.sin(a1);
                const c2x = p[0] + L * Math.cos(a2), c2y = p[1] + L * Math.sin(a2);
                ctx.beginPath();
                ctx.moveTo(sx, sy);
                ctx.bezierCurveTo(c1x, c1y, c2x, c2y, exx, exy);
                ctx.stroke();
                arrowHead(exx, exy, Math.atan2(exy - c2y, exx - c2x));
            });
        } else {
            const A = pos[i], B = pos[j];
            const pl = Math.hypot(B[0] - A[0], B[1] - A[1]);
            const nx = -(B[1] - A[1]) / pl, ny = (B[0] - A[0]) / pl;
            list.forEach((a, k) => {
                const bow = (k - (list.length - 1) / 2) * 20;
                const M = [(A[0] + B[0]) / 2 + nx * bow, (A[1] + B[1]) / 2 + ny * bow];
                const from = pos[a.from], to = pos[a.to];
                const trim = (P0, P1, r) => {
                    const d = Math.hypot(P1[0] - P0[0], P1[1] - P0[1]) || 1;
                    return [P0[0] + (P1[0] - P0[0]) / d * r, P0[1] + (P1[1] - P0[1]) / d * r];
                };
                const S = trim(from, M, NR), E = trim(to, M, NR + 4);
                ctx.beginPath();
                ctx.moveTo(S[0], S[1]);
                ctx.quadraticCurveTo(M[0], M[1], E[0], E[1]);
                ctx.stroke();
                arrowHead(E[0], E[1], Math.atan2(E[1] - M[1], E[0] - M[0]));
            });
        }
    });
    // nodes
    pos.forEach((p, i) => {
        ctx.beginPath();
        ctx.arc(p[0], p[1], NR, 0, 7);
        ctx.fillStyle = "#131a2e";
        ctx.fill();
        ctx.strokeStyle = "#5eead4";
        ctx.lineWidth = 1.6;
        ctx.stroke();
        ctx.fillStyle = "#5eead4";
        ctx.font = "bold 12px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(String(i + 1), p[0], p[1]);
        ctx.strokeStyle = "#9aa7c7";
        ctx.lineWidth = 1.3;
    });
}

/* --------------------------- tiling drawing ----------------------------- */

function drawTiling(canvas, tiling) {
    // Mirrors QuiverGT.plot_dimer_torus: ONE fundamental cell (plus a small
    // margin), with every lattice-shifted copy of every edge/node that
    // intersects it (reach set by the edge windings), clipped to the cell.
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!tiling) {
        ctx.fillStyle = "#93a0b8";
        ctx.font = "13px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("no tiling data for this phase", canvas.width / 2, canvas.height / 2);
        return;
    }
    let L = tiling.lattice;
    let nodes = tiling.nodes;
    // strip-like fundamental domains (e.g. Y^{p,0} phases: p rows squashed
    // into the unit square) render unreadably — stretch the squashed axis
    // until edges are isotropic.  Only when the edge second-moment tensor is
    // axis-aligned: tilted lattices (F0 etc.) are genuinely square cells with
    // correlated components and must not be deformed.
    {
        let mxx = 0, myy = 0, mxy = 0;
        for (const [b, w, w1, w2] of tiling.edges) {
            const vx = nodes[w][0] + w1 * L[0][0] + w2 * L[1][0] - nodes[b][0];
            const vy = nodes[w][1] + w1 * L[0][1] + w2 * L[1][1] - nodes[b][1];
            mxx += vx * vx; myy += vy * vy; mxy += vx * vy;
        }
        if (mxx > 1e-12 && myy > 1e-12) {
            // q = anisotropy of the edge second moment; mildly tilted square
            // cells (F0: q = 1.4) look right untouched — only strong strips
            // (Y^{5,0}: 3.5, Y^{8,0}: 5.7) get corrected
            const q = Math.sqrt(myy / mxx);
            let sx = 1, sy = 1;
            if (q > 2) sx = Math.min(q, 24);
            else if (q < 0.5) sy = Math.min(1 / q, 24);
            if (sx !== 1 || sy !== 1) {
                nodes = nodes.map(n => [n[0] * sx, n[1] * sy, n[2]]);
                L = [[L[0][0] * sx, L[0][1] * sy], [L[1][0] * sx, L[1][1] * sy]];
            }
        }
    }
    const m = 0.06;                       // margin, in lattice units
    const frac2xy = (u, v) => [u * L[0][0] + v * L[1][0], u * L[0][1] + v * L[1][1]];
    const cell = [[0, 0], [1, 0], [1, 1], [0, 1]].map(([u, v]) => frac2xy(u, v));
    const view = [[-m, -m], [1 + m, -m], [1 + m, 1 + m], [-m, 1 + m]]
        .map(([u, v]) => frac2xy(u, v));
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const c of view) {
        minX = Math.min(minX, c[0]); maxX = Math.max(maxX, c[0]);
        minY = Math.min(minY, c[1]); maxY = Math.max(maxY, c[1]);
    }
    const pad = 12;
    const sc = Math.min((canvas.width - 2 * pad) / (maxX - minX),
        (canvas.height - 2 * pad) / (maxY - minY));
    const ox = (canvas.width - sc * (maxX - minX)) / 2 - sc * minX;
    const oy = (canvas.height + sc * (maxY - minY)) / 2 + sc * minY;
    const P = (x, y) => [ox + sc * x, oy - sc * y];

    // universal-cover displacement of each edge (black -> white lift)
    const segs = tiling.edges.map(([b, w, w1, w2]) => ({
        b,
        vx: nodes[w][0] + w1 * L[0][0] + w2 * L[1][0] - nodes[b][0],
        vy: nodes[w][1] + w1 * L[0][1] + w2 * L[1][1] - nodes[b][1],
    }));
    let reach = 1;
    for (const [b, w, w1, w2] of tiling.edges)
        reach = Math.max(reach, Math.abs(w1) + 1, Math.abs(w2) + 1);

    // clip to the (expanded) fundamental cell
    ctx.save();
    ctx.beginPath();
    view.forEach((c, i) => { const [X, Y] = P(c[0], c[1]); i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); });
    ctx.closePath();
    ctx.clip();

    ctx.strokeStyle = "#cbd5f0";
    ctx.lineWidth = 1.5;
    for (let si = -reach; si <= reach; si++)
        for (let sj = -reach; sj <= reach; sj++) {
            const S = frac2xy(si, sj);
            for (const s of segs) {
                const x1 = nodes[s.b][0] + S[0], y1 = nodes[s.b][1] + S[1];
                const [X1, Y1] = P(x1, y1), [X2, Y2] = P(x1 + s.vx, y1 + s.vy);
                if (Math.max(X1, X2) < 0 || Math.min(X1, X2) > canvas.width ||
                    Math.max(Y1, Y2) < 0 || Math.min(Y1, Y2) > canvas.height)
                    continue;
                ctx.beginPath();
                ctx.moveTo(X1, Y1);
                ctx.lineTo(X2, Y2);
                ctx.stroke();
            }
        }

    // nodes (all visible copies)
    for (let si = -reach; si <= reach; si++)
        for (let sj = -reach; sj <= reach; sj++) {
            const S = frac2xy(si, sj);
            for (const n of nodes) {
                const [X, Y] = P(n[0] + S[0], n[1] + S[1]);
                if (X < -10 || X > canvas.width + 10 || Y < -10 || Y > canvas.height + 10)
                    continue;
                ctx.beginPath();
                ctx.arc(X, Y, 5, 0, 7);
                ctx.fillStyle = n[2] === 1 ? "#0d1220" : "#e8ecf5";
                ctx.fill();
                ctx.strokeStyle = "#e8ecf5";
                ctx.lineWidth = 1.4;
                ctx.stroke();
            }
        }
    ctx.restore();

    // fundamental-domain outline
    ctx.strokeStyle = "#f9a8d4";
    ctx.setLineDash([6, 5]);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    cell.forEach((c, i) => { const [X, Y] = P(c[0], c[1]); i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); });
    ctx.closePath();
    ctx.stroke();
    ctx.setLineDash([]);

    // face labels: centroid of each face's boundary edges in ONE consistent
    // universal-cover lift (stored payload centroids can mix lattice frames),
    // then wrapped into the cell (like the package: cent - floor(cent)).
    const faceEdges = new Map();
    tiling.edges.forEach(([b, w, w1, w2, f1, f2], ei) => {
        for (const f of new Set([f1, f2])) {
            if (!faceEdges.has(f)) faceEdges.set(f, []);
            faceEdges.get(f).push(ei);
        }
    });
    function faceCentroid(f) {
        const eids = faceEdges.get(f);
        if (!eids || !eids.length) return null;
        const lift = new Map();            // node id -> lifted position
        const b0 = tiling.edges[eids[0]][0];
        lift.set(b0, [nodes[b0][0], nodes[b0][1]]);
        let changed = true;
        while (changed) {
            changed = false;
            for (const ei of eids) {
                const [b, w] = tiling.edges[ei];
                const s = segs[ei];
                if (lift.has(b) && !lift.has(w)) {
                    const pb = lift.get(b);
                    lift.set(w, [pb[0] + s.vx, pb[1] + s.vy]);
                    changed = true;
                } else if (lift.has(w) && !lift.has(b)) {
                    const pw = lift.get(w);
                    lift.set(b, [pw[0] - s.vx, pw[1] - s.vy]);
                    changed = true;
                }
            }
        }
        let cx = 0, cy = 0, n = 0;
        for (const ei of eids) {
            const [b] = tiling.edges[ei];
            const pb = lift.get(b);
            if (!pb) continue;
            const s = segs[ei];
            cx += pb[0] + s.vx / 2;
            cy += pb[1] + s.vy / 2;
            n++;
        }
        return n ? [cx / n, cy / n] : null;
    }
    const det = L[0][0] * L[1][1] - L[0][1] * L[1][0];
    ctx.font = "bold 12px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#5eead4";
    for (const [f, fx, fy] of tiling.faces) {
        const c = faceCentroid(f) || [fx, fy];
        let u = (c[0] * L[1][1] - c[1] * L[1][0]) / det;
        let v = (-c[0] * L[0][1] + c[1] * L[0][0]) / det;
        u -= Math.floor(u);
        v -= Math.floor(v);
        const [wx, wy] = frac2xy(u, v);
        const [X, Y] = P(wx, wy);
        ctx.fillText(String(f + 1), X, Y);
    }
}

/* ========================= copy buttons ================================= */
// Mathematica conventions follow the DimersWeb editor / DimerGNN package:
//   toric  : {{x, y, mult}, ...}          (mult Null when unknown)
//   quiver : {1 -> 2, 3 -> 1, ...}        (1-based node labels)
//   W      : products of Subscript[X, List[i, j]]  (1-based; multi-arrows get
//            Subsuperscript[X, List[i, j], k])
// Python formats are DimerGNN-native:
//   toric  : [(x, y, mult), ...],  quiver : Q = [[srcs], [tgts]] (0-based),
//   W      : [[sign, [edge indices]], ...]

const copyPayloads = {};

function chiralSymbolsM(phase) {
    const E = phase.n_chirals;
    const pairCount = {}, pairSeen = {};
    for (let e = 0; e < E; e++) {
        const key = `${phase.Q[0][e]},${phase.Q[1][e]}`;
        pairCount[key] = (pairCount[key] || 0) + 1;
    }
    const syms = [];
    for (let e = 0; e < E; e++) {
        const i = phase.Q[0][e] + 1, j = phase.Q[1][e] + 1;
        const key = `${phase.Q[0][e]},${phase.Q[1][e]}`;
        pairSeen[key] = (pairSeen[key] || 0) + 1;
        syms.push(pairCount[key] === 1
            ? `Subscript[X, List[${i}, ${j}]]`
            : `Subsuperscript[X, List[${i}, ${j}], ${pairSeen[key]}]`);
    }
    return syms;
}

function buildCopyPayloads(t, phase) {
    copyPayloads.toric_m = "{" + t.toric.points.map(p =>
        `{${p[0]}, ${p[1]}, ${p[2] == null ? "Null" : p[2]}}`).join(", ") + "}";
    copyPayloads.toric_py = "[" + t.toric.points.map(p =>
        `(${p[0]}, ${p[1]}, ${p[2] == null ? "None" : p[2]})`).join(", ") + "]";
    copyPayloads.quiver_m = "{" + phase.Q[0].map((s, e) =>
        `${s + 1} -> ${phase.Q[1][e] + 1}`).join(", ") + "}";
    copyPayloads.quiver_py =
        `Q = [[${phase.Q[0].join(", ")}], [${phase.Q[1].join(", ")}]]`;
    const syms = chiralSymbolsM(phase);
    copyPayloads.w_m = phase.W.map(([sign, term], i) => {
        const prod = term.map(e => syms[e]).join("*");
        return (sign > 0 ? (i ? " + " : "") : (i ? " - " : "-")) + prod;
    }).join("");
    copyPayloads.w_py = "W = [" + phase.W.map(([s, term]) =>
        `[${s}, [${term.join(", ")}]]`).join(", ") + "]";
    // zigzag paths
    if (phase.zigzags) {
        copyPayloads.zz_m = "{" + phase.zigzags.map(z =>
            "{" + z.map(e => syms[e]).join(", ") + "}").join(", ") + "}";
        copyPayloads.zz_py = "zigzags = [" + phase.zigzags.map(z =>
            `[${z.join(", ")}]`).join(", ") + "]";
    } else copyPayloads.zz_m = copyPayloads.zz_py = "";
    // perfect matching matrix
    if (phase.pm_matrix) {
        copyPayloads.pm_m = "{" + phase.pm_matrix.map(r =>
            "{" + r.join(", ") + "}").join(", ") + "}";
        copyPayloads.pm_py = "P = [" + phase.pm_matrix.map(r =>
            `[${r.join(", ")}]`).join(", ") + "]";
    } else copyPayloads.pm_m = copyPayloads.pm_py = "";
    // GLSM R-charges (common data)
    if (t.glsm_R) {
        copyPayloads.glsm_m = "{" + t.glsm_R.map((r, i) =>
            `Subscript[p, ${i + 1}] -> ${r}`).join(", ") + "}";
        copyPayloads.glsm_py = "glsm_R = [" + t.glsm_R.join(", ") + "]";
    } else copyPayloads.glsm_m = copyPayloads.glsm_py = "";
}

function fallbackCopy(text) {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); } catch (e) { }
    ta.remove();
}

document.querySelectorAll(".copy-mini").forEach(btn => {
    btn.addEventListener("click", ev => {
        ev.stopPropagation();
        ev.preventDefault();      // keep <details> from toggling
        const text = copyPayloads[btn.dataset.copy] || "";
        const done = () => {
            const old = btn.textContent;
            btn.textContent = "✓";
            setTimeout(() => { btn.textContent = old; }, 700);
        };
        if (navigator.clipboard && navigator.clipboard.writeText)
            navigator.clipboard.writeText(text).then(done, () => { fallbackCopy(text); done(); });
        else { fallbackCopy(text); done(); }
    });
});

/* ============================ routing ==================================== */

const MODES = ["name", "props", "draw"];
document.querySelectorAll(".mode-btn").forEach(btn => {
    btn.addEventListener("click", () => {
        document.querySelectorAll(".mode-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        const mode = btn.dataset.mode;
        document.querySelectorAll(".mode-panel").forEach(p => p.classList.remove("active"));
        if (mode === "props") document.getElementById("panel-props").classList.add("active");
        if (mode === "draw") {
            document.getElementById("panel-draw").classList.add("active");
            renderDrawCanvas();
        }
    });
});

document.getElementById("propSearchBtn").addEventListener("click", runPropSearch);
document.getElementById("propClearBtn").addEventListener("click", () => {
    buildPropForm();
    showResults([], "");
});

function route() {
    const h = location.hash;
    const m = /^#\/theory\/(.+)$/.exec(h);
    if (m) {
        const id = decodeURIComponent(m[1]);
        loadTheory(id).then(renderTheory).catch(err => {
            document.getElementById("theoryPage").classList.add("hidden");
            document.getElementById("homePage").classList.remove("hidden");
            showResults([], String(err.message || err));
        });
    } else {
        document.getElementById("theoryPage").classList.add("hidden");
        document.getElementById("homePage").classList.remove("hidden");
        if (seibergGraph) { seibergGraph._destructor && seibergGraph._destructor(); seibergGraph = null; }
    }
}

window.addEventListener("hashchange", route);

/* ============================== init ==================================== */

buildPropForm();
renderDrawCanvas();
route();
