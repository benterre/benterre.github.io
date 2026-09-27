/* ============================================================================
 * BraneTilingDatabase webapp
 * - name search with typeahead (keyboard + mouse)
 * - property search (config-driven criteria)
 * - toric-diagram drawing search (canonical polygon matching, identical
 *   algorithm to generate_db.py)
 * - theory page: common data + toric canvas, 3D Seiberg graph with phase
 *   selection, per-phase quiver / superpotential / tiling.
 * ========================================================================= */

"use strict";

if (typeof window.__DIMER_DB_INDEX_FINISH__ === "function")
    window.__DIMER_DB_INDEX_FINISH__();

const INDEX = window.DIMER_DB_INDEX || [];
const PARQUET_DATABASE = window.DIMER_DB_PARQUET || null;
const REMOTE_DATABASE = PARQUET_DATABASE?.remoteSearch ? PARQUET_DATABASE : null;
const DATABASE_METADATA = window.DIMER_DB_METADATA || null;
const RESOLVE_PHASE_TORIC_MULTIPLICITIES =
    typeof window.DIMER_DB_PHASE_TORIC_MULTIPLICITIES === "function"
        ? window.DIMER_DB_PHASE_TORIC_MULTIPLICITIES : null;
const THEORY_ID_ALIASES = new Map();
for (const entry of INDEX)
    for (const oldId of (entry.legacy_ids || []))
        THEORY_ID_ALIASES.set(oldId, entry.id);
const theoryCache = {};          // id -> full record or lazy split descriptor
const remoteTheoryOrder = [];
const theoryLoadPromises = {};
const phaseChunkPromises = {};
const seibergChunkPromises = {};
let currentTheory = null;
let currentPhase = 0;
let phaseSelectionSerial = 0;
let phaseInputTimer = null;
let routeSerial = 0;
let seibergGraph = null;
let seibergBuildTimer = null;
let seibergViewSerial = 0;

// Graphs at or below this boundary are still displayed automatically.  Above
// it, even loading the 3D libraries is deferred until the visitor opts in.
const SEIBERG_GRAPH_AUTO_LIMIT = 2000;
const SEARCH_ITEM_SEPARATOR = "\u001f";
const SEARCH_SECTION_SEPARATOR = "\u001e";

/* ============================= utilities ================================ */

function canonicalTheoryId(id) { return THEORY_ID_ALIASES.get(String(id)) || String(id); }

const toricSearch = window.DIMER_DB_TORIC_SEARCH;
if (!toricSearch) throw new Error("toric_search.js was not loaded");
const { canonicalPolygonKey, convexHull } = toricSearch;

// normalized string for name matching: "Y^{2,1}" -> "y21", "C/Z2 x Z2" -> "cz2xz2"
function normName(s) {
    return String(s).toLowerCase()
        .replace(/×/g, "x")
        .replace(/[\^{}_\s(),\[\]\/\\-]+/g, "")
        .replace(/\*/g, "x");
}

function namesOf(entry) {
    if (Array.isArray(entry.names)) return entry.names;
    if (typeof entry._names === "string") {
        const section = entry._names.indexOf(SEARCH_SECTION_SEPARATOR);
        const raw = section < 0 ? entry._names : entry._names.slice(0, section);
        return raw ? raw.split(SEARCH_ITEM_SEPARATOR) : [];
    }
    return [];
}

function unpackCoordinates(packed) {
    if (!packed) return [];
    return packed.split(";").map(pair => {
        const comma = pair.indexOf(",");
        return [Number(pair.slice(0, comma)), Number(pair.slice(comma + 1))];
    });
}

// Parquet search entries keep toric geometry in one compact string.  Decode it
// only for visible result cards; legacy index entries retain their old arrays.
function entryToricGeometry(entry) {
    if (Array.isArray(entry.hull) && Array.isArray(entry.points)) {
        return { hull: entry.hull, points: entry.points };
    }
    if (REMOTE_DATABASE) return REMOTE_DATABASE.searchEntryGeometry(entry);
    if (PARQUET_DATABASE
            && typeof PARQUET_DATABASE.searchToricGeometry === "function") {
        return PARQUET_DATABASE.searchToricGeometry(entry.id);
    }
    const packed = entry._toric;
    if (typeof packed !== "string") throw new Error(`${entry.id}: missing search toric geometry`);
    const nul = packed.indexOf("\0");
    const divider = packed.indexOf("|", nul + 1);
    if (nul < 0 || divider < 0) throw new Error(`${entry.id}: invalid search toric geometry`);
    return {
        hull: unpackCoordinates(packed.slice(nul + 1, divider)),
        points: unpackCoordinates(packed.slice(divider + 1)),
    };
}

// The compact search catalog reconstructs lattice points from the canonical
// GL(2,Z) identity key.  That frame is excellent for matching but may be a
// visibly sheared representative of the polygon.  Full theory rows are saved
// in generate_db.py's minimal-extent display frame, so apply the exact same
// bounded unimodular search before drawing a result-card preview.
let displayFrameMatrices = null;
function toricDisplayMatrices() {
    if (displayFrameMatrices) return displayFrameMatrices;
    const result = [];
    for (let a = -6; a <= 6; a++)
        for (let b = -6; b <= 6; b++)
            for (let c = -6; c <= 6; c++)
                for (let d = -6; d <= 6; d++)
                    if (Math.abs(a * d - b * c) === 1)
                        result.push([a, b, c, d]);
    displayFrameMatrices = result;
    return result;
}

function compareNumberLists(left, right) {
    for (let i = 0; i < left.length; i++) {
        if (left[i] < right[i]) return -1;
        if (left[i] > right[i]) return 1;
    }
    return 0;
}

function comparePointLists(left, right) {
    for (let i = 0; i < left.length; i++) {
        if (left[i][0] < right[i][0]) return -1;
        if (left[i][0] > right[i][0]) return 1;
        if (left[i][1] < right[i][1]) return -1;
        if (left[i][1] > right[i][1]) return 1;
    }
    return 0;
}

function displayFrameToric(toric) {
    const source = Array.isArray(toric?.points) ? toric.points : [];
    if (!source.length) return { hull: toric?.hull || [], points: source };
    const lattice = source.map(point => [Number(point[0]), Number(point[1])]);
    const n = lattice.length;
    let best = null;
    for (const [a, b, c, d] of toricDisplayMatrices()) {
        const transformed = new Array(n);
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        let sumX = 0, sumY = 0;
        for (let i = 0; i < n; i++) {
            const [x, y] = lattice[i];
            const qx = a * x + b * y, qy = c * x + d * y;
            transformed[i] = [qx, qy];
            minX = Math.min(minX, qx); maxX = Math.max(maxX, qx);
            minY = Math.min(minY, qy); maxY = Math.max(maxY, qy);
            sumX += qx; sumY += qy;
        }
        const width = maxX - minX, height = maxY - minY;
        let moment = 0;
        for (const [x, y] of transformed)
            moment += (n * x - sumX) ** 2 + (n * y - sumY) ** 2;
        const prefix = [Math.max(width, height), width + height, moment];
        const prefixOrder = best ? compareNumberLists(prefix, best.prefix) : -1;
        if (prefixOrder > 0) continue;
        const translated = transformed.map(([x, y]) => [x - minX, y - minY])
            .sort((left, right) => left[0] - right[0] || left[1] - right[1]);
        if (prefixOrder === 0 && comparePointLists(translated, best.points) >= 0)
            continue;
        best = { prefix, points: translated, a, b, c, d, tx: -minX, ty: -minY };
    }
    const transform = point => [
        best.a * Number(point[0]) + best.b * Number(point[1]) + best.tx,
        best.c * Number(point[0]) + best.d * Number(point[1]) + best.ty,
        ...point.slice(2),
    ];
    return {
        hull: (toric.hull || []).map(transform),
        points: source.map(transform),
    };
}

function entryToricKey(entry) {
    if (typeof entry._canon === "string") return entry._canon;
    if (typeof entry._toric === "string") {
        const end = entry._toric.indexOf("\0");
        return end < 0 ? null : entry._toric.slice(0, end);
    }
    if (entry._key) return entry._key;
    const geometry = entryToricGeometry(entry);
    return geometry.points.length ? canonicalPolygonKey(geometry.points) : null;
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
    t = t.replace(/ on torus characters$/, "\\;\\text{on torus characters}");
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

let storedPhaseCount = 0;
for (const e of INDEX) {
    // Legacy JS indexes retain their eager compatibility fields.  Parquet
    // entries are already compact and must not materialize geometry or a second
    // normalized-name array for every one of the million-plus theories.
    if (typeof e._toric !== "string" && typeof e._names !== "string") {
        e._norms = namesOf(e).concat(e.legacy_ids || []).map(normName);
        e._key = canonicalPolygonKey(e.points);
    }
    if (Number.isSafeInteger(e.n_phases) && e.n_phases > 0)
        storedPhaseCount += e.n_phases;
}
const databaseTheoryCount = DATABASE_METADATA?.theory_count ?? INDEX.length;
storedPhaseCount = DATABASE_METADATA?.phase_count ?? storedPhaseCount;
const theoryWord = databaseTheoryCount === 1 ? "theory" : "theories";
const phaseWord = storedPhaseCount === 1 ? "phase" : "phases";
const dbCount = document.getElementById("dbCount");
dbCount.textContent = `${databaseTheoryCount.toLocaleString("en-US")} ${theoryWord}`
    + ` · ${storedPhaseCount.toLocaleString("en-US")} stored ${phaseWord}`;
dbCount.title = "Sum of toric phases currently stored; some theories may not yet have complete phase enumeration.";

const KEY_LOOKUP = new Map();
for (const e of INDEX) if (e._key) KEY_LOOKUP.set(e._key, e.id);

function lookupToricId(key) {
    const legacy = KEY_LOOKUP.get(key);
    if (legacy) return legacy;
    if (PARQUET_DATABASE
            && typeof PARQUET_DATABASE.toricCandidates === "function") {
        let best = null;
        for (const entry of PARQUET_DATABASE.toricCandidates(key)) {
            if (entryToricKey(entry) === key
                    && (best === null || entry.id > best)) best = entry.id;
        }
        return best;
    }
    // Avoid a second million-entry Map in Parquet mode.  Drawing lookup is an
    // infrequent interactive operation, and the compact prefix scan allocates
    // nothing while preserving the legacy choice of the last sorted match.
    const prefix = key + "\0";
    for (let i = INDEX.length - 1; i >= 0; i--) {
        if (typeof INDEX[i]._toric === "string" && INDEX[i]._toric.startsWith(prefix))
            return INDEX[i].id;
    }
    return null;
}

/* ========================== name search ================================= */

function scoreName(entry, q) {
    if (typeof entry._names === "string") {
        let best = -1;
        let start = 0;
        while (start <= entry._names.length) {
            const itemEnd = entry._names.indexOf(SEARCH_ITEM_SEPARATOR, start);
            const sectionEnd = entry._names.indexOf(SEARCH_SECTION_SEPARATOR, start);
            let end = entry._names.length;
            if (itemEnd >= 0) end = Math.min(end, itemEnd);
            if (sectionEnd >= 0) end = Math.min(end, sectionEnd);
            const normalized = normName(entry._names.slice(start, end));
            let value = -1;
            if (normalized === q) value = 100;
            else if (normalized.startsWith(q)) value = 80 - (normalized.length - q.length);
            else if (normalized.includes(q)) value = 50 - normalized.indexOf(q);
            if (value > best) best = value;
            if (end === entry._names.length) break;
            start = end + 1;
        }
        return best;
    }
    let best = -1;
    const score = raw => {
        const n = entry._norms ? raw : normName(raw);
        let s = -1;
        if (n === q) s = 100;
        else if (n.startsWith(q)) s = 80 - (n.length - q.length);
        else if (n.includes(q)) s = 50 - n.indexOf(q);
        if (s > best) best = s;
    };
    if (entry._norms) {
        for (const n of entry._norms) score(n);
    } else {
        for (const n of namesOf(entry)) score(n);
        for (const n of (entry.legacy_ids || [])) score(n);
    }
    return best;
}

function nameMatches(q, limit = Infinity) {
    const nq = normName(q);
    if (!nq) return [];
    const ranked = [];
    const compare = (a, b) => b[0] - a[0] || a[1].n_gauge - b[1].n_gauge
        || (a[1].id < b[1].id ? -1 : a[1].id > b[1].id ? 1 : 0);
    for (const entry of INDEX) {
        const score = scoreName(entry, nq);
        if (score < 0) continue;
        const value = [score, entry];
        if (Number.isFinite(limit)) {
            let position = 0;
            while (position < ranked.length && compare(ranked[position], value) <= 0) position++;
            ranked.splice(position, 0, value);
            if (ranked.length > limit) ranked.pop();
        } else {
            ranked.push(value);
        }
    }
    if (!Number.isFinite(limit)) ranked.sort(compare);
    return ranked.map(([, entry]) => entry);
}

const searchInput = document.getElementById("nameSearch");
const suggBox = document.getElementById("suggestions");
let suggEntries = [];
let suggActive = -1;
let nameSearchSerial = 0;
let nameSearchTimer = null;

// The v3 bootstrap supplies a time-sliced exact-search engine.  Keep a tiny
// asynchronous fallback for isolated presentation tests, but production never
// performs a multi-million-row scan inside an input or keydown event handler.
const NAME_SEARCH = window.DIMER_DB_NAME_SEARCH || {
    cancel() {},
    async search(query, { limit = Infinity, onProgress = null } = {}) {
        await new Promise(resolve => setTimeout(resolve, 0));
        const entries = nameMatches(query, limit);
        const result = {
            cancelled: false, entries, matches: entries.length,
            scanned: INDEX.length, total: INDEX.length,
        };
        if (onProgress) onProgress({ ...result, done: true });
        return result;
    },
};

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
    if (!suggEntries.length) {
        suggBox.innerHTML = "";
        suggBox.style.display = "none";
        return;
    }
    suggBox.innerHTML = "";
    suggEntries.forEach((e, i) => {
        const div = document.createElement("div");
        div.className = "sugg" + (i === suggActive ? " active" : "");
        const nm = document.createElement("span");
        // render each name in LaTeX where possible
        displayNames(namesOf(e), 3).forEach((n, k) => {
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

function sameSuggestionEntries(left, right) {
    return left.length === right.length
        && left.every((entry, index) => entry.id === right[index].id);
}

function updateSuggestionEntries(entries) {
    if (sameSuggestionEntries(suggEntries, entries)) return;
    suggEntries = entries;
    // Do not auto-highlight the first suggestion: plain Enter should show all
    // exact matches.  Arrow keys or the mouse opt into one suggestion.
    suggActive = -1;
    renderSuggestions();
}

function beginSuggestionSearch() {
    const query = searchInput.value;
    const serial = ++nameSearchSerial;
    NAME_SEARCH.cancel();
    if (nameSearchTimer != null) clearTimeout(nameSearchTimer);
    if (!query.trim()) {
        suggEntries = [];
        suggActive = -1;
        renderSuggestions();
        return;
    }
    // A short debounce avoids scanning superseded one-character prefixes.
    // The engine itself yields every ~8 ms and reports progressively.
    nameSearchTimer = setTimeout(async () => {
        nameSearchTimer = null;
        try {
            const result = await NAME_SEARCH.search(query, {
                limit: 8,
                onProgress(progress) {
                    if (serial !== nameSearchSerial || progress.cancelled) return;
                    updateSuggestionEntries(progress.entries);
                },
            });
            if (serial !== nameSearchSerial || result.cancelled) return;
            updateSuggestionEntries(result.entries);
        } catch (error) {
            if (serial !== nameSearchSerial) return;
            updateSuggestionEntries([]);
            document.getElementById("resultsMsg").textContent = `Search unavailable: ${error.message}`;
        }
    }, 70);
}

async function submitNameSearch(query) {
    const serial = ++nameSearchSerial;
    NAME_SEARCH.cancel();
    if (nameSearchTimer != null) {
        clearTimeout(nameSearchTimer);
        nameSearchTimer = null;
    }
    suggBox.style.display = "none";
    if (REMOTE_DATABASE) {
        return showRemoteResults({ q: query }, count => query.trim()
            ? `${count.toLocaleString("en-US")} matches for “${query}”`
            : `All ${count.toLocaleString("en-US")} theories`, null, true);
    }
    const resultsBox = document.getElementById("results");
    const message = document.getElementById("resultsMsg");
    resultsBox.innerHTML = "";
    document.getElementById("resultsPager").innerHTML = "";
    message.className = "";
    message.textContent = `Searching for “${query}”…`;
    const result = await NAME_SEARCH.search(query, {
        onProgress(progress) {
            if (serial !== nameSearchSerial || progress.cancelled) return;
            const percent = progress.total
                ? Math.floor(100 * progress.scanned / progress.total) : 100;
            message.textContent = `Searching for “${query}”… ${percent}%`
                + ` · ${progress.matches.toLocaleString("en-US")} found`;
        },
    });
    if (serial !== nameSearchSerial || result.cancelled) return;
    const matches = result.entries;
    if (matches.length === 1) openTheory(matches[0].id);
    else showResults(matches,
        matches.length ? `${matches.length} matches for “${query}”`
            : `No theory matches “${query}”.`);
}

searchInput.addEventListener("input", beginSuggestionSearch);

searchInput.addEventListener("keydown", ev => {
    if (ev.key === "ArrowDown") {
        ev.preventDefault();
        if (suggEntries.length) { suggActive = (suggActive + 1) % suggEntries.length; renderSuggestions(); }
    } else if (ev.key === "ArrowUp") {
        ev.preventDefault();
        if (suggEntries.length) { suggActive = (suggActive - 1 + suggEntries.length) % suggEntries.length; renderSuggestions(); }
    } else if (ev.key === "Escape") {
        ++nameSearchSerial;
        NAME_SEARCH.cancel();
        if (nameSearchTimer != null) {
            clearTimeout(nameSearchTimer);
            nameSearchTimer = null;
        }
        suggEntries = [];
        suggActive = -1;
        renderSuggestions();
    } else if (ev.key === "Enter") {
        ev.preventDefault();
        const dropdownChosen = suggActive >= 0 && suggBox.style.display === "block";
        suggBox.style.display = "none";
        if (dropdownChosen && suggEntries.length) {
            ++nameSearchSerial;
            NAME_SEARCH.cancel();
            if (nameSearchTimer != null) {
                clearTimeout(nameSearchTimer);
                nameSearchTimer = null;
            }
            openTheory(suggEntries[suggActive].id);
            return;
        }
        if (!searchInput.value.trim()) {
            ++nameSearchSerial;
            NAME_SEARCH.cancel();
            if (REMOTE_DATABASE) void submitNameSearch("");
            else showResults(INDEX, `All ${INDEX.length} theories`);
            return;
        }
        void submitNameSearch(searchInput.value);
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
    orbifold: { text: "Orbifolds", tex: "\\text{Orbifolds}" },
    delpezzo_orbifold: { text: "Orbifolds of del Pezzo", tex: "\\text{Orbifolds of del Pezzo}" },
    pseudo_delpezzo_orbifold: { text: "Orbifolds of pseudo del Pezzo", tex: "\\text{Orbifolds of pseudo del Pezzo}" },
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
function familiesOf(e) {
    if (Array.isArray(e.families)) return e.families;
    if (typeof e.families === "string") {
        return e.families ? e.families.split(SEARCH_ITEM_SEPARATOR) : [];
    }
    return e.family ? [e.family] : [];
}

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
    orbifold: n => /\/Z\d+/.test(n),
    delpezzo_orbifold: n => /^dP\d+[a-z]?\//.test(n),
    pseudo_delpezzo_orbifold: n => /^PdP\d+[a-z]?\//.test(n),
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

// Phase-count caveat.  `phases_computed === false` marks a record imported
// with a single known phase and no Seiberg-duality enumeration at all (quiver
// catalogs); `phases_truncated` marks an enumeration that was cut short.  In
// both cases the stored count is a lower bound, not the number of phases.
function phasesComputed(t) { return t.phases_computed !== false && !t.phases_truncated; }
function phasesNote(t) { return phasesComputed(t) ? "" : "  (not computed)"; }

// toric point classification (index carries precomputed counts; fall back to
// hull/points for any older index that predates them)
function vertexPoints(e) {
    return e.n_vertices != null ? e.n_vertices : entryToricGeometry(e).hull.length;
}
function edgePoints(e) {
    if (e.n_edge != null) return e.n_edge;
    return e.n_points - e.n_internal - entryToricGeometry(e).hull.length;
}

function packedIntegerRangeMatch(packed, part, lo, hi) {
    const divider = packed.indexOf("|");
    if (divider < 0) return false;
    const start = part === 0 ? 0 : divider + 1;
    const end = part === 0 ? divider : packed.length;
    let value = 0, sign = 1, haveDigits = false;
    for (let i = start; i <= end; i++) {
        const code = packed.charCodeAt(i);
        if (code >= 48 && code <= 57) {
            value = value * 10 + code - 48;
            haveDigits = true;
        } else if (code === 45 && !haveDigits) {
            sign = -1;
        } else {
            if (haveDigits) {
                const number = sign * value;
                if ((isNaN(lo) || number >= lo) && (isNaN(hi) || number <= hi)) return true;
            }
            value = 0;
            sign = 1;
            haveDigits = false;
        }
    }
    return false;
}

function criterionRangeMatch(entry, criterion, lo, hi) {
    if (criterion.packedPart != null && typeof entry._phaseCounts === "string") {
        return packedIntegerRangeMatch(entry._phaseCounts, criterion.packedPart, lo, hi);
    }
    if (criterion.packedPart != null && PARQUET_DATABASE
            && typeof PARQUET_DATABASE.searchPhaseRange === "function"
            && entry.n_chirals == null && entry.n_W_terms == null) {
        return PARQUET_DATABASE.searchPhaseRange(
            entry, criterion.packedPart, lo, hi,
        );
    }
    return criterion.get(entry).some(value =>
        (isNaN(lo) || value >= lo) && (isNaN(hi) || value <= hi));
}

const CRITERIA = [
    { key: "n_gauge", label: "gauge groups", type: "range", get: e => [e.n_gauge] },
    { key: "n_chirals", label: "chiral multiplets (any phase)", type: "range",
        packedPart: 0, get: e => e.n_chirals || [] },
    { key: "n_W_terms", label: "superpotential terms (any phase)", type: "range",
        packedPart: 1, get: e => e.n_W_terms || [] },
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
        options: () => {
            const values = new Set(DATABASE_METADATA?.families || []);
            for (const entry of INDEX) for (const family of familiesOf(entry)) values.add(family);
            return [...values].sort((a, b) => famText(a).localeCompare(famText(b)));
        },
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
    const remoteFilters = {};
    for (const c of CRITERIA) {
        if (c.type === "range") {
            const lo = parseFloat(document.getElementById(`prop_${c.key}_lo`).value);
            const hi = parseFloat(document.getElementById(`prop_${c.key}_hi`).value);
            if (!isNaN(lo) || !isNaN(hi)) {
                parts.push(c.label);
                if (!isNaN(lo)) remoteFilters[`${c.key}_min`] = lo;
                if (!isNaN(hi)) remoteFilters[`${c.key}_max`] = hi;
                if (!REMOTE_DATABASE) entries = entries.filter(e => criterionRangeMatch(e, c, lo, hi));
            }
        } else if (c.type === "value") {
            const x = parseFloat(document.getElementById(`prop_${c.key}`).value);
            if (!isNaN(x)) {
                parts.push(c.label);
                remoteFilters[c.key] = x;
                if (!REMOTE_DATABASE) entries = entries.filter(e => c.match(c.get(e), x));
            }
        } else if (c.type === "select") {
            const v = document.getElementById(`prop_${c.key}`).value;
            if (v) {
                parts.push(c.label);
                remoteFilters[c.key] = v;
                if (!REMOTE_DATABASE) entries = entries.filter(e => c.get(e).includes(v));
                if (c.key === "family") famFilter = v;
            }
        }
    }
    if (!parts.length) { showResults([], "Set at least one criterion."); return; }
    if (REMOTE_DATABASE) {
        void showRemoteResults(remoteFilters, count => count
            ? `${count.toLocaleString("en-US")} theories match (${parts.join(", ")})`
            : "No theory matches those criteria.", famFilter, true);
        return;
    }
    if (entries.length === 1) { openTheory(entries[0].id); return; }
    showResults(entries, entries.length
        ? `${entries.length} theories match (${parts.join(", ")})`
        : "No theory matches those criteria.", famFilter);
}

/* ===================== toric drawing search ============================= */

const drawState = { points: new Set(), N: 8 };
let drawingSearchSerial = 0;
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
    const serial = ++drawingSearchSerial;
    const box = document.getElementById("drawMatch");
    const pts = [...drawState.points].map(s => s.split(",").map(Number));
    drawState.matchId = null;
    REMOTE_DATABASE?.cancelSearch("drawing");
    document.getElementById("drawSearchBtn").disabled = false;
    if (pts.length < 3) {
        box.innerHTML = '<span class="none">— draw at least 3 points —</span>';
        return;
    }
    const key = canonicalPolygonKey(pts);
    if (REMOTE_DATABASE && key) {
        box.textContent = "Looking up this toric diagram…";
        document.getElementById("drawSearchBtn").disabled = true;
        REMOTE_DATABASE.lookupToric(key).then(entry => {
            if (serial !== drawingSearchSerial) return;
            displayDrawMatch(entry);
        }).catch(error => {
            if (serial !== drawingSearchSerial || error.name === "AbortError") return;
            box.textContent = `Diagram lookup unavailable: ${error.message}`;
        }).finally(() => {
            if (serial === drawingSearchSerial)
                document.getElementById("drawSearchBtn").disabled = false;
        });
        return;
    }
    const id = key && lookupToricId(key);
    displayDrawMatch(id ? INDEX.find(x => x.id === id) : null);
}

function displayDrawMatch(e) {
    const box = document.getElementById("drawMatch");
    if (e) {
        drawState.matchId = e.id;
        box.innerHTML = "";
        const disp = displayNames(namesOf(e), 3);
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

// Uniform lattice-to-canvas projection shared by previews and the full theory
// view.  Keeping one scale for both axes is essential: independent x/y fits
// would introduce a second, purely visual deformation of the polygon.
function toricCanvasProjection(canvas, points, pad, maxCell = Infinity) {
    const xs = points.map(point => point[0]);
    const ys = points.map(point => point[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const width = Math.max(maxX - minX, 1);
    const height = Math.max(maxY - minY, 1);
    const cell = Math.min(
        (canvas.width - 2 * pad) / width,
        (canvas.height - 2 * pad) / height,
        maxCell,
    );
    const ox = (canvas.width - cell * (minX + maxX)) / 2;
    const oy = (canvas.height + cell * (minY + maxY)) / 2;
    return {
        minX, maxX, minY, maxY, cell,
        point: point => [ox + point[0] * cell, oy - point[1] * cell],
    };
}

function miniToric(canvas, entry, size = 86) {
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext("2d");
    const { hull, points } = displayFrameToric(entryToricGeometry(entry));
    const { point: P } = toricCanvasProjection(canvas, points, 12);
    ctx.beginPath();
    hull.forEach((p, i) => { const [X, Y] = P(p); i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); });
    ctx.closePath();
    ctx.fillStyle = "rgba(167,139,250,0.14)";
    ctx.strokeStyle = "#a78bfa";
    ctx.lineWidth = 1.2;
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#e8ecf5";
    for (const p of points) {
        const [X, Y] = P(p);
        ctx.beginPath();
        ctx.arc(X, Y, 2.6, 0, 7);
        ctx.fill();
    }
}

/* results are paged: the database has tens of thousands of theories, so a
   broad query can match thousands — show a page at a time with a pager */
const RESULTS_PER_PAGE = 60;
let resultState = { entries: [], msg: "", fam: null, page: 0 };
let resultSearchSerial = 0;

async function showRemoteResults(params, describe, fam = null, openSingle = false, page = 0) {
    const serial = ++resultSearchSerial;
    const message = document.getElementById("resultsMsg");
    message.textContent = "Searching the database…";
    message.className = "";
    document.getElementById("resultsPager").innerHTML = "";
    try {
        const data = await REMOTE_DATABASE.search({ ...params,
            offset: page * RESULTS_PER_PAGE, limit: RESULTS_PER_PAGE });
        if (serial !== resultSearchSerial) return;
        if (openSingle && data.total === 1 && data.items.length === 1) {
            openTheory(data.items[0].id);
            return;
        }
        resultState = { entries: data.items, msg: describe(data.total), fam, page,
            remote: { params, describe, total: data.total } };
        renderResultsPage();
    } catch (error) {
        if (serial !== resultSearchSerial || error.name === "AbortError") return;
        message.textContent = `Search unavailable: ${error.message}`;
        message.className = "error";
    }
}

function showResults(entries, msg, highlightFamily = null) {
    ++resultSearchSerial;
    REMOTE_DATABASE?.cancelSearch("results");
    resultState = { entries, msg: msg || "", fam: highlightFamily, page: 0 };
    renderResultsPage();
}

function gotoResultsPage(p) {
    const remote = resultState.remote;
    const count = remote ? remote.total : resultState.entries.length;
    const pages = Math.max(1, Math.ceil(count / RESULTS_PER_PAGE));
    if (remote) {
        void showRemoteResults(remote.params, remote.describe, resultState.fam, false,
            Math.min(Math.max(0, p), pages - 1));
        return;
    }
    resultState.page = Math.min(Math.max(0, p), pages - 1);
    renderResultsPage();
    const box = document.getElementById("results");
    if (box.scrollIntoView) box.scrollIntoView({ block: "start" });
}

function renderResultsPage() {
    const { entries, msg, fam, page } = resultState;
    const box = document.getElementById("results");
    const m = document.getElementById("resultsMsg");
    const count = resultState.remote ? resultState.remote.total : entries.length;
    const pages = Math.max(1, Math.ceil(count / RESULTS_PER_PAGE));
    const from = page * RESULTS_PER_PAGE;
    const shown = resultState.remote ? entries : entries.slice(from, from + RESULTS_PER_PAGE);
    m.textContent = (msg || "") + (count > RESULTS_PER_PAGE
        ? `  —  showing ${from + 1}–${from + shown.length} of ${count}`
        : "");
    m.className = entries.length ? "" : "error";
    box.innerHTML = "";
    const highlightFamily = fam;
    for (const e of shown) {
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
        displayNames(namesFamilyFirst(namesOf(e), highlightFamily), 2).forEach((n, i) => {
            if (i) h.appendChild(document.createTextNode("  =  "));
            const sp = document.createElement("span");
            typeset(sp, n);
            h.appendChild(sp);
        });
        const stats = document.createElement("div");
        stats.className = "stats";
        stats.innerHTML =
            `${e.n_gauge} gauge groups · ${e.n_phases} phase${e.n_phases > 1 ? "s" : ""}` +
            (e.phases_computed === false ? " (not computed)" : "") + "<br>" +
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
    renderResultsPager(pages);
}

function renderResultsPager(pages) {
    const pg = document.getElementById("resultsPager");
    if (!pg) return;
    pg.innerHTML = "";
    if (pages <= 1) { pg.style.display = "none"; return; }
    pg.style.display = "flex";
    const page = resultState.page;
    const btn = (label, target, disabled) => {
        const b = document.createElement("button");
        b.className = "btn secondary page-btn" + (target === page ? " active" : "");
        b.textContent = label;
        if (disabled) b.disabled = true;
        else b.addEventListener("click", () => gotoResultsPage(target));
        return b;
    };
    pg.appendChild(btn("‹ prev", page - 1, page === 0));
    // a compact window of page numbers around the current one
    const nums = new Set([0, pages - 1]);
    for (let d = -2; d <= 2; d++) {
        const p = page + d;
        if (p >= 0 && p < pages) nums.add(p);
    }
    let prev = -1;
    for (const p of [...nums].sort((a, b) => a - b)) {
        if (prev >= 0 && p > prev + 1) {
            const gap = document.createElement("span");
            gap.className = "page-gap";
            gap.textContent = "…";
            pg.appendChild(gap);
        }
        pg.appendChild(btn(String(p + 1), p, false));
        prev = p;
    }
    pg.appendChild(btn("next ›", page + 1, page === pages - 1));
}

/* ====================== theory page: loading ============================ */

window.__DIMER_DB_LOAD__ = function (t) {
    if (Array.isArray(t._phase_chunks)) {
        // Keep loaded phases only when the content-versioned part set is the
        // same.  A cache-busted descriptor refresh after a deployment must
        // not mix phase objects from two generations.
        const old = theoryCache[t.id];
        const signature = value => Array.isArray(value && value._phase_chunks)
            ? value._phase_chunks.map(part => part.file).join("|") : null;
        const phases = old && signature(old) === signature(t)
            && Array.isArray(old.phases) ? old.phases : [];
        phases.length = t.n_phases;
        t.phases = phases;
    }
    if (Array.isArray(t._seiberg_chunks)) {
        // Graph parts use the same content-versioned replacement rule as
        // phase parts.  Preserve an already assembled graph only when a
        // descriptor refresh names the identical generation.
        const old = theoryCache[t.id];
        const signature = value => Array.isArray(value && value._seiberg_chunks)
            ? value._seiberg_chunks.map(part => part.file).join("|") : null;
        const reusable = !!(old && old._seiberg_loaded === true
            && signature(old) === signature(t));
        t.seiberg = reusable ? old.seiberg
            : { ...(t.seiberg || {}), nodes: [], links: [] };
        t._seiberg_loaded = reusable;
    }
    theoryCache[t.id] = t;
    if (REMOTE_DATABASE) {
        const prior = remoteTheoryOrder.indexOf(t.id);
        if (prior >= 0) remoteTheoryOrder.splice(prior, 1);
        remoteTheoryOrder.push(t.id);
        while (remoteTheoryOrder.length > 24) {
            const expired = remoteTheoryOrder.shift();
            delete theoryCache[expired];
            for (const key of Object.keys(theoryLoadPromises))
                if (canonicalTheoryId(key) === expired) delete theoryLoadPromises[key];
        }
    }
};

window.__DIMER_DB_LOAD_PHASES__ = function (payload) {
    if (!payload || typeof payload.id !== "string"
        || typeof payload.file !== "string"
        || !Number.isInteger(payload.start) || !Array.isArray(payload.phases)) return;
    const t = theoryCache[payload.id];
    if (!t || !Array.isArray(t.phases) || !Array.isArray(t._phase_chunks)) return;
    // Content-versioned chunks are accepted only by the descriptor that
    // declared them.  A late script from a prior deployment therefore cannot
    // contaminate a freshly loaded generation.
    const part = t._phase_chunks.find(chunk => chunk.file === payload.file
        && chunk.start === payload.start
        && chunk.count === payload.phases.length);
    if (!part) return;
    payload.phases.forEach((phase, offset) => {
        const i = payload.start + offset;
        if (i >= 0 && i < t.n_phases) t.phases[i] = phase;
    });
};

window.__DIMER_DB_LOAD_SEIBERG__ = function (payload) {
    if (!payload || typeof payload.id !== "string"
        || typeof payload.file !== "string"
        || (payload.field !== "nodes" && payload.field !== "links")
        || !Number.isInteger(payload.start) || !Array.isArray(payload.items)) return;
    const t = theoryCache[payload.id];
    if (!t || !t.seiberg || !Array.isArray(t._seiberg_chunks)) return;
    const part = t._seiberg_chunks.find(chunk => chunk.file === payload.file
        && chunk.field === payload.field && chunk.start === payload.start
        && chunk.count === payload.items.length);
    if (!part || !Array.isArray(t.seiberg[payload.field])) return;
    payload.items.forEach((item, offset) => {
        t.seiberg[payload.field][payload.start + offset] = item;
    });
};

function loadScript(src) {
    return new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = src;
        s.onload = () => {
            if (typeof s.remove === "function") s.remove();
            resolve();
        };
        s.onerror = () => {
            if (typeof s.remove === "function") s.remove();
            reject(new Error("failed to load " + src));
        };
        document.head.appendChild(s);
    });
}

function refreshTheoryDescriptor(t) {
    const src = `db/theories/${t.id}.js?reload=${Date.now()}-${Math.random()}`;
    return loadScript(src).then(() => {
        const fresh = theoryCache[t.id];
        if (!fresh || !Array.isArray(fresh.phases))
            throw new Error(`could not refresh ${t.id}`);
        if (fresh !== t) {
            const replacement = { ...fresh };
            Object.keys(t).forEach(key => delete t[key]);
            Object.assign(t, replacement);
            theoryCache[t.id] = t;
        }
        return t;
    });
}

function ensurePhase(t, i, allowDescriptorRefresh = true) {
    if (t && Array.isArray(t.phases) && t.phases[i])
        return Promise.resolve(t.phases[i]);
    // Version-3 Parquet datasets externalise large theories into bounded
    // 128-phase rows.  The data layer knows which local or hosted shard owns
    // the requested block; keep this application path independent of URLs.
    if (t && PARQUET_DATABASE
            && typeof PARQUET_DATABASE.loadTheoryPhase === "function") {
        return PARQUET_DATABASE.loadTheoryPhase(t.id, i).then(phase => {
            if (!Array.isArray(t.phases)) t.phases = new Array(t.n_phases);
            t.phases[i] = phase;
            if (REMOTE_DATABASE) {
                // A long browsing session must not gradually hydrate every
                // phase of a huge theory in memory. Keep recent selections.
                t._recent_api_phases = (t._recent_api_phases || []).filter(index => index !== i);
                t._recent_api_phases.push(i);
                while (t._recent_api_phases.length > 48)
                    delete t.phases[t._recent_api_phases.shift()];
            }
            return phase;
        });
    }
    const chunks = t && t._phase_chunks;
    const chunk = Array.isArray(chunks)
        ? chunks.find(c => i >= c.start && i < c.start + c.count) : null;
    if (!chunk || typeof chunk.file !== "string")
        return Promise.reject(new Error(`phase ${i + 1} is not available`));
    const key = `${t.id}:${chunk.file}`;
    if (!phaseChunkPromises[key]) {
        phaseChunkPromises[key] = loadScript(`db/theories/${chunk.file}`)
            .then(() => {
                for (let k = chunk.start; k < chunk.start + chunk.count; k++)
                    if (!t.phases[k])
                        throw new Error(`${chunk.file} did not provide phase ${k + 1}`);
            })
            .catch(err => {
                delete phaseChunkPromises[key];
                throw err;
            });
    }
    const loaded = phaseChunkPromises[key].then(() => {
        if (!t.phases[i]) throw new Error(`phase ${i + 1} is not available`);
        return t.phases[i];
    });
    if (!allowDescriptorRefresh) return loaded;
    return loaded.catch(() => refreshTheoryDescriptor(t)
        .then(() => ensurePhase(t, i, false)));
}

function ensureSeibergGraph(t, allowDescriptorRefresh = true) {
    if (t && !t.seiberg && PARQUET_DATABASE
            && typeof PARQUET_DATABASE.loadTheoryGraph === "function") {
        return PARQUET_DATABASE.loadTheoryGraph(t.id).then(graph => {
            t.seiberg = graph;
            return graph;
        });
    }
    const chunks = t && t._seiberg_chunks;
    if (!Array.isArray(chunks)) return Promise.resolve(t.seiberg);
    if (t._seiberg_loaded === true) return Promise.resolve(t.seiberg);

    // Load sequentially.  Concurrent 45 MB scripts briefly duplicate several
    // decoded arrays and can exhaust a browser precisely for the large graphs
    // this format is intended to support.
    let pending = Promise.resolve();
    for (const chunk of chunks) {
        const key = `${t.id}:${chunk.file}`;
        pending = pending.then(() => {
            if (!seibergChunkPromises[key]) {
                seibergChunkPromises[key] = loadScript(`db/theories/${chunk.file}`)
                    .then(() => {
                        const values = t.seiberg && t.seiberg[chunk.field];
                        if (!Array.isArray(values))
                            throw new Error(`${chunk.file} has an invalid field`);
                        for (let i = chunk.start; i < chunk.start + chunk.count; i++)
                            if (values[i] === undefined)
                                throw new Error(`${chunk.file} did not provide item ${i + 1}`);
                    })
                    .catch(err => {
                        delete seibergChunkPromises[key];
                        throw err;
                    });
            }
            return seibergChunkPromises[key];
        });
    }
    const loaded = pending.then(() => {
        if (t.seiberg.nodes.length !== Number(t._seiberg_node_count)
            || t.seiberg.links.length !== Number(t._seiberg_link_count))
            throw new Error("Seiberg graph chunks are incomplete");
        t._seiberg_loaded = true;
        return t.seiberg;
    });
    if (!allowDescriptorRefresh) return loaded;
    return loaded.catch(() => refreshTheoryDescriptor(t)
        .then(() => ensureSeibergGraph(t, false)));
}

function loadTheory(id) {
    id = canonicalTheoryId(id);
    let pending;
    if (theoryCache[id]) {
        pending = Promise.resolve(theoryCache[id]);
    } else {
        if (!theoryLoadPromises[id]) {
            const load = PARQUET_DATABASE
                ? PARQUET_DATABASE.loadTheory(id).then(t => {
                    if (REMOTE_DATABASE && id !== t.id) THEORY_ID_ALIASES.set(id, t.id);
                    window.__DIMER_DB_LOAD__(t);
                    return t;
                })
                : loadScript(`db/theories/${id}.js`).then(() => {
                    if (!theoryCache[id]) throw new Error("bad theory file");
                    return theoryCache[id];
                });
            theoryLoadPromises[id] = load
                .catch(err => {
                    delete theoryLoadPromises[id];
                    throw new Error("theory not found: " + id + " (" + err.message + ")");
                });
        }
        pending = theoryLoadPromises[id];
    }
    // renderTheory remains synchronous and always starts at phase 1.  For a
    // split record, fetch only the chunk containing that phase before render.
    return pending.then(t => ensurePhase(t, 0).then(() => t));
}

function openTheory(id, phase = 0) {
    location.hash = `#/theory/${encodeURIComponent(id)}`;
}

/* ====================== theory page: rendering ========================== */

function renderTheory(t) {
    phaseSelectionSerial++;
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
        ["toric phases", t.n_phases + phasesNote(t)],
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

    prepareSeibergGraph(t);
    buildPhaseSelector(t);
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

// Toric block with the SELECTED phase's GLSM multiplicities (perfect-matching
// counts are phase-dependent).  The theory-level triples are the phase-0
// multiplicities, so they remain a lossless fallback for legacy records whose
// phase-0 ``glsm_mult`` map is absent.  Never reuse them for another phase.
function phaseToric(t, i) {
    const p = t.phases[i];
    let mult = p && p.glsm_mult;
    if (!mult && p && RESOLVE_PHASE_TORIC_MULTIPLICITIES) {
        // The resolver is explicitly bounded, abort-safe, and weakly cached.
        // Calling it here keeps the work lazy to the selected phase.
        mult = RESOLVE_PHASE_TORIC_MULTIPLICITIES(p, t.toric.points);
    }
    return {
        hull: t.toric.hull,
        points: t.toric.points.map(([x, y, storedMultiplicity]) => {
            const key = `${x},${y}`;
            const phaseMultiplicity = mult
                && Object.prototype.hasOwnProperty.call(mult, key)
                ? mult[key] : null;
            const m = phaseMultiplicity != null
                ? phaseMultiplicity
                : i === 0 ? storedMultiplicity : null;
            return [x, y, m != null ? m : null];
        }),
    };
}

// Sum exact non-negative counts without rounding oversized Parquet int64
// values. The decoder represents only unsafe counts as decimal strings, while
// ordinary multiplicities and browser-derived maps remain numbers.
function sumExactNonnegativeIntegers(values) {
    let total = 0n;
    for (const value of values) {
        let integer;
        if (typeof value === "bigint") integer = value;
        else if (typeof value === "number") {
            if (!Number.isSafeInteger(value) || value < 0) return null;
            integer = BigInt(value);
        } else if (typeof value === "string" && /^(?:0|[1-9][0-9]*)$/.test(value)) {
            integer = BigInt(value);
        } else return null;
        if (integer < 0n) return null;
        total += integer;
    }
    return total <= BigInt(Number.MAX_SAFE_INTEGER)
        ? Number(total) : total.toString(10);
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
    const { point: P, minX, maxX, minY, maxY } = toricCanvasProjection(
        canvas, pts, 30, 60,
    );
    // ambient lattice
    ctx.fillStyle = "#273049";
    for (let x = minX; x <= maxX; x++)
        for (let y = minY; y <= maxY; y++) {
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
    // Corner (extremal/external) perfect matchings always have multiplicity
    // one, so labelling them only adds visual noise.  Keep multiplicities on
    // internal points and on non-corner boundary points, where they carry
    // useful information.
    const hullVertices = new Set(toric.hull.map(p => `${p[0]},${p[1]}`));
    for (const p of pts) {
        const [X, Y] = P(p);
        ctx.beginPath();
        ctx.arc(X, Y, 5.5, 0, 7);
        ctx.fillStyle = "#e8ecf5";
        ctx.fill();
        if (p[2] != null && !hullVertices.has(`${p[0]},${p[1]}`)) {
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

// three.js + 3d-force-graph are fetched only when a theory page actually wants
// the 3D graph, so a slow CDN can never delay the first paint of the site.
// Resolves to true once ForceGraph3D is usable, false if the fetch failed.
let _fg3dPromise = null;
function ensureForceGraph() {
    if (typeof ForceGraph3D !== "undefined") return Promise.resolve(true);
    if (_fg3dPromise) return _fg3dPromise;
    const load = src => new Promise((res, rej) => {
        const s = document.createElement("script");
        s.src = src;
        s.onload = () => res(true);
        s.onerror = () => rej(new Error("failed: " + src));
        document.head.appendChild(s);
    });
    _fg3dPromise = load(window.THREE_SRC)          // three first: FG3D uses it
        .then(() => load(window.FORCEGRAPH_SRC))
        .then(() => typeof ForceGraph3D !== "undefined")
        .catch(() => false)
        .then(ok => {
            // A transient CDN/offline failure must not poison every later
            // attempt in this session.  In particular, the large-graph
            // opt-in button becomes a usable Retry button.
            if (!ok) _fg3dPromise = null;
            return ok;
        });
    return _fg3dPromise;
}

function destroySeibergGraph() {
    if (seibergBuildTimer) {
        clearInterval(seibergBuildTimer);
        seibergBuildTimer = null;
    }
    if (seibergGraph && typeof seibergGraph._destructor === "function")
        seibergGraph._destructor();
    seibergGraph = null;
}

function seibergViewIsCurrent(t, serial) {
    return currentTheory === t && seibergViewSerial === serial;
}

// ``n_phases`` is the phase count known in the complete database.  A reduced
// Hugging Face publication preserves that useful total while shipping only
// phase 1.  The Parquet loader annotates the in-memory theory with the number
// that this publication can actually hydrate; the fallback also handles an
// inline truncated record outside that loader.
function availablePhaseCount(t) {
    const declared = Number(t && t.n_phases);
    const total = Number.isSafeInteger(declared) && declared > 0 ? declared : 0;
    const annotated = Number(t && t._available_phase_count);
    if (Number.isSafeInteger(annotated) && annotated >= 0)
        return Math.min(total, annotated);
    if (t && t.phases_truncated === true && Array.isArray(t.phases))
        return Math.min(total, t.phases.length);
    return total;
}

function setSeibergButtonExpanded(button, expanded) {
    if (button.setAttribute)
        button.setAttribute("aria-expanded", expanded ? "true" : "false");
    else
        button.ariaExpanded = expanded ? "true" : "false";
}

function seibergGraphSize(t) {
    const nodes = t.seiberg && Array.isArray(t.seiberg.nodes)
        ? t.seiberg.nodes.length : 0;
    const phases = availablePhaseCount(t);
    return Math.max(nodes, phases);
}

function setSeibergHint(t) {
    document.getElementById("seibergHint").textContent =
        t.phases_computed === false
            ? "toric phases not computed — one known phase stored" :
            t.n_phases === 1 ? "single toric phase" :
                `${t.n_phases} toric phases${t.phases_truncated ? " (not computed in full)" : ""}`;
}

function showSeibergFailure(t, serial, optedIn) {
    if (!seibergViewIsCurrent(t, serial)) return;
    const el = document.getElementById("seibergGraph");
    el.innerHTML = '<div class="seiberg-message" role="status">3d-force-graph unavailable (offline?) — use the phase selector below.</div>';
    if (!optedIn) return;
    const button = document.getElementById("seibergShowButton");
    button.classList.remove("hidden");
    button.disabled = false;
    button.textContent = "Retry graph";
    setSeibergButtonExpanded(button, false);
}

function prepareSeibergGraph(t) {
    const serial = ++seibergViewSerial;
    destroySeibergGraph();
    const section = document.getElementById("seibergSection");
    const el = document.getElementById("seibergGraph");
    const hint = document.getElementById("seibergHint");
    const button = document.getElementById("seibergShowButton");
    el.innerHTML = "";
    hint.textContent = "";
    button.onclick = null;
    button.disabled = false;
    button.textContent = "Display graph";
    button.classList.add("hidden");
    setSeibergButtonExpanded(button, false);

    const hasMultiplePhases = availablePhaseCount(t) > 1 && t._graph_available !== false;
    section.classList.toggle("hidden", !hasMultiplePhases);
    if (!hasMultiplePhases) return;

    setSeibergHint(t);

    const graphSize = seibergGraphSize(t);
    if (REMOTE_DATABASE || graphSize > SEIBERG_GRAPH_AUTO_LIMIT) {
        // This return deliberately precedes buildSeibergGraph, and therefore
        // ensureForceGraph: large records do not fetch or initialise any 3D
        // dependency merely because their theory page was opened.
        button.classList.remove("hidden");
        el.innerHTML = `<div class="seiberg-message" role="status">This graph has ${graphSize.toLocaleString()} nodes and is ${REMOTE_DATABASE ? "downloaded only when requested" : "not rendered automatically"}.</div>`;
        button.onclick = () => {
            if (!seibergViewIsCurrent(t, serial)) return;
            button.disabled = true;
            button.textContent = "Loading graph…";
            el.innerHTML = '<div class="seiberg-message" role="status">loading the 3D graph…</div>';
            buildSeibergGraph(t, serial, true);
        };
        return;
    }
    buildSeibergGraph(t, serial, false);
}

function buildSeibergGraph(t, serial = seibergViewSerial, optedIn = false) {
    if (!seibergViewIsCurrent(t, serial)) return;
    destroySeibergGraph();
    const el = document.getElementById("seibergGraph");
    el.innerHTML = "";
    const parquetGraphPending = !t.seiberg && PARQUET_DATABASE
        && typeof PARQUET_DATABASE.loadTheoryGraph === "function";
    if (parquetGraphPending
            || (Array.isArray(t._seiberg_chunks) && t._seiberg_loaded !== true)) {
        el.innerHTML = '<div class="seiberg-message" role="status">loading graph data…</div>';
        ensureSeibergGraph(t).then(() => {
            if (seibergViewIsCurrent(t, serial))
                buildSeibergGraph(t, serial, optedIn);
        }).catch(err => {
            if (!seibergViewIsCurrent(t, serial)) return;
            el.innerHTML = '<div class="seiberg-message" role="status">graph data could not be loaded — retry when the database files are available.</div>';
            if (optedIn) {
                const button = document.getElementById("seibergShowButton");
                button.classList.remove("hidden");
                button.disabled = false;
                button.textContent = "Retry graph";
                setSeibergButtonExpanded(button, false);
            }
            console.error(err);
        });
        return;
    }
    if (typeof ForceGraph3D === "undefined") {
        // first theory page of the session: pull the 3D libraries in now
        el.innerHTML = '<div class="seiberg-message" role="status">loading the 3D graph…</div>';
        seibergGraph = null;
        ensureForceGraph().then(ok => {
            if (!seibergViewIsCurrent(t, serial)) return;  // moved on
            if (ok) buildSeibergGraph(t, serial, optedIn);
            else showSeibergFailure(t, serial, optedIn);
        });
        return;
    }
    const nodes = t.seiberg.nodes.map(i => ({ id: i }));
    const links = t.seiberg.links
        .map(l => Array.isArray(l)
            ? { source: l[0], target: l[1] }
            : { source: l.source, target: l.target })
        .filter(l => l.source !== l.target);

    // large graphs (hundreds-thousands of phases): per-node meshes/sprites and
    // the incremental build-up animation would freeze the page — render once
    // with plain nodes and a bounded simulation instead.
    const big = nodes.length > 250;
    const hasTHREE = typeof THREE !== "undefined" && !big;
    const wrap = document.getElementById("seibergWrap");
    let graph;
    try {
        graph = ForceGraph3D()(el)
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
    } catch (error) {
        console.error(error);
        showSeibergFailure(t, serial, optedIn);
        return;
    }
    seibergGraph = graph;
    if (optedIn) {
        const button = document.getElementById("seibergShowButton");
        button.disabled = true;
        button.textContent = "Graph displayed";
        setSeibergButtonExpanded(button, true);
    }
    if (big)
        graph.cooldownTicks(200).warmupTicks(50)
            .nodeResolution(4).enableNodeDrag(false);
    graph.__big = big;

    if (hasTHREE) {
        graph
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
        graph.nodeColor(n => n.id === currentPhase ? "#5eead4" : "#8b93b5");
    }

    if (big) {
        // no build-up animation: one single graphData call
        graph.graphData({ nodes, links });
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
        graph.graphData({ nodes: ns, links: ls.map(l => ({ ...l })) });
        if (step >= nodes.length) {
            clearInterval(timer);
            if (seibergBuildTimer === timer) seibergBuildTimer = null;
        }
    }, Math.max(25, stepMs));
    seibergBuildTimer = timer;
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

function buildPhaseSelector(t) {
    const box = document.getElementById("phasePills");
    const jump = document.getElementById("phaseJump");
    const input = document.getElementById("phaseNumber");
    const total = document.getElementById("phaseTotal");
    const prev = document.getElementById("phasePrev");
    const next = document.getElementById("phaseNext");
    const phaseCount = availablePhaseCount(t);
    clearPhaseInputTimer();
    box.innerHTML = "";
    if (phaseCount > 100) {
        box.classList.add("hidden");
        jump.classList.remove("hidden");
        input.inputMode = "numeric";
        input.pattern = "[1-9][0-9]*";
        input.maxLength = String(phaseCount).length;
        total.textContent = `of ${phaseCount}`;
        const enteredPhase = raw => {
            if (!/^[1-9]\d*$/.test(raw)) return null;
            const phase = Number(raw);
            return phase <= phaseCount ? phase : null;
        };
        const loadEnteredPhase = raw => {
            const phase = enteredPhase(raw);
            if (phase === null) return false;
            selectPhase(phase - 1);
            return true;
        };
        input.oninput = () => {
            clearPhaseInputTimer();
            // Editing is a new navigation intent.  Prevent an older lazy
            // phase request from completing over the draft now being typed.
            phaseSelectionSerial++;
            const raw = String(input.value).trim();
            if (enteredPhase(raw) === null) return;
            // A short pause avoids loading phases 1 and 10 while the user is
            // still typing 101.  The final valid whole number loads itself.
            phaseInputTimer = setTimeout(() => {
                phaseInputTimer = null;
                if (currentTheory === t && String(input.value).trim() === raw)
                    loadEnteredPhase(raw);
            }, 250);
        };
        input.onkeydown = event => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            clearPhaseInputTimer();
            phaseSelectionSerial++;
            loadEnteredPhase(String(input.value).trim());
        };
        prev.onclick = () => selectPhase(currentPhase - 1);
        next.onclick = () => selectPhase(currentPhase + 1);
        syncPhaseSelector(t, currentPhase);
        return;
    }

    box.classList.remove("hidden");
    jump.classList.add("hidden");
    input.oninput = null;
    input.onkeydown = null;
    for (let i = 0; i < phaseCount; i++) {
        const b = document.createElement("button");
        b.className = "pill" + (i === currentPhase ? " active" : "");
        b.textContent = `phase ${i + 1}`;
        b.dataset.phase = String(i);
        b.addEventListener("click", () => selectPhase(i));
        box.appendChild(b);
    }
}

function clearPhaseInputTimer() {
    if (phaseInputTimer !== null) {
        clearTimeout(phaseInputTimer);
        phaseInputTimer = null;
    }
}

function syncPhaseSelector(t, i) {
    const phaseCount = availablePhaseCount(t);
    if (phaseCount > 100) {
        document.getElementById("phaseNumber").value = String(i + 1);
        document.getElementById("phasePrev").disabled = i <= 0;
        document.getElementById("phaseNext").disabled = i >= phaseCount - 1;
        return;
    }
    [...document.getElementById("phasePills").children].forEach(b =>
        b.classList.toggle("active", Number(b.dataset.phase) === i));
}

function selectPhase(i) {
    clearPhaseInputTimer();
    const t = currentTheory;
    if (!t || !Number.isInteger(i) || i < 0 || i >= availablePhaseCount(t))
        return Promise.resolve(false);
    const serial = ++phaseSelectionSerial;
    const finish = () => {
        if (currentTheory !== t || serial !== phaseSelectionSerial) return false;
        currentPhase = i;
        syncPhaseSelector(t, i);
        refreshSeibergColors();
        renderPhase(i);
        return true;
    };
    if (t.phases[i]) {
        finish();
        return Promise.resolve(true);
    }
    document.getElementById("phaseStats").textContent = `loading phase ${i + 1}…`;
    return ensurePhase(t, i).then(finish).catch(err => {
        if (currentTheory === t && serial === phaseSelectionSerial) {
            syncPhaseSelector(t, currentPhase);
            document.getElementById("phaseStats").textContent =
                `Could not load phase ${i + 1}: ${err.message || err}`;
        }
        console.error(err);
        return false;
    });
}

function renderPhase(i) {
    const t = currentTheory;
    const p = t.phases[i];
    const selectedToric = phaseToric(t, i);
    buildCopyPayloads(t, p, i, selectedToric);

    // phase-dependent common block: GLSM multiplicities on the toric diagram
    // and the chiral / W-term counts
    const gl = document.getElementById("glsmDetails");
    drawToricDiagram(document.getElementById("toricCanvas"), selectedToric,
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
    // A graph-only checkpoint deliberately stores the authoritative, compact
    // W/Q data before derived presentation fields such as W_latex have been
    // filled.  Those phases are common in the larger (notably genus-six)
    // records.  The old guard on W_latex therefore hid a perfectly complete
    // superpotential even though wDisplayTerms() already knows how to rebuild
    // the exact field expression from W and Q.
    const terms = wDisplayTerms(p);
    if (terms.length) {
        const expression = terms.join(" \\\\ & ");
        const fallback = p.W_latex || `W = ${terms.join(" ")}`;
        typesetRawTeX(
            wBox,
            "\\begin{aligned}W ={}& " + expression + "\\end{aligned}",
            fallback,
        );
    } else wBox.textContent = "—";

    const matchingCount = sumExactNonnegativeIntegers(
        selectedToric.points.map(point => point[2]),
    );
    document.getElementById("phaseStats").textContent =
        `${p.n_chirals} chiral multiplets · ${p.n_W_terms} superpotential terms` +
        (p.zigzags ? ` · ${p.zigzags.length} zigzag paths` : "") +
        (matchingCount != null ? ` · ${matchingCount} perfect matchings` : "");

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

function buildCopyPayloads(t, phase, phaseIndex = null, selectedToric = null) {
    const index = Number.isInteger(phaseIndex)
        ? phaseIndex
        : Number.isInteger(phase && phase.idx) ? phase.idx : 0;
    const toric = selectedToric || phaseToric(t, index);
    copyPayloads.toric_m = "{" + toric.points.map(p =>
        `{${p[0]}, ${p[1]}, ${p[2] == null ? "Null" : p[2]}}`).join(", ") + "}";
    copyPayloads.toric_py = "[" + toric.points.map(p =>
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
    const previousFocus = document.activeElement;
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    let copied = false;
    try {
        ta.select();
        copied = document.execCommand("copy") === true;
    } catch (e) {
        copied = false;
    } finally {
        ta.remove();
        if (previousFocus && typeof previousFocus.focus === "function")
            previousFocus.focus();
    }
    return copied;
}

const copyButtonLabels = new Map();
const copyFeedbackSerials = new Map();
let citationStatusSerial = 0;

function citationCopyStatus(target, copied) {
    const status = document.getElementById("citationStatus");
    if (!status) return;
    const label = target === document.getElementById("paperCitation")
        ? "Paper" : "Database";
    const serial = ++citationStatusSerial;
    status.textContent = copied
        ? `${label} BibTeX copied.`
        : `Could not copy ${label.toLowerCase()} BibTeX. Open “View BibTeX” and select it manually.`;
    setTimeout(() => {
        if (serial === citationStatusSerial) status.textContent = "";
    }, copied ? 1800 : 5000);
}

function showCopySuccess(btn, target) {
    if (!copyButtonLabels.has(btn)) copyButtonLabels.set(btn, btn.textContent);
    const serial = (copyFeedbackSerials.get(btn) || 0) + 1;
    copyFeedbackSerials.set(btn, serial);
    if (target) btn.classList.add("copied");
    else btn.textContent = "✓";
    setTimeout(() => {
        if (copyFeedbackSerials.get(btn) !== serial) return;
        if (target) btn.classList.remove("copied");
        else btn.textContent = copyButtonLabels.get(btn);
    }, 700);
    if (target) citationCopyStatus(target, true);
}

document.querySelectorAll(".copy-mini").forEach(btn => {
    btn.addEventListener("click", ev => {
        ev.stopPropagation();
        ev.preventDefault();      // keep <details> from toggling
        const target = btn.dataset.copyTarget
            ? document.getElementById(btn.dataset.copyTarget) : null;
        const text = target ? target.textContent.trim()
            : (copyPayloads[btn.dataset.copy] || "");
        const failed = () => {
            if (target) citationCopyStatus(target, false);
        };
        const fallback = () => fallbackCopy(text)
            ? showCopySuccess(btn, target) : failed();
        if (!text) { failed(); return; }
        if (typeof navigator !== "undefined" && navigator.clipboard
            && navigator.clipboard.writeText) {
            try {
                Promise.resolve(navigator.clipboard.writeText(text))
                    .then(() => showCopySuccess(btn, target), fallback);
            } catch (e) {
                fallback();
            }
        } else fallback();
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
    const serial = ++routeSerial;
    const h = location.hash;
    const m = /^#\/theory\/(.+)$/.exec(h);
    if (m) {
        const requestedId = decodeURIComponent(m[1]);
        const id = canonicalTheoryId(requestedId);
        if (id !== requestedId && window.history
            && typeof window.history.replaceState === "function") {
            try {
                window.history.replaceState(null, "", `#/theory/${encodeURIComponent(id)}`);
            } catch (_) {
                // Some restricted/local browsing contexts disallow History
                // API writes.  The canonical record should still load even
                // when the address bar cannot be cleaned up.
            }
        }
        const loading = document.getElementById("theoryLoadStatus");
        if (loading) {
            loading.textContent = `Loading ${id} from the Parquet database…`;
            loading.classList.remove("hidden");
        }
        loadTheory(id).then(t => {
            if (serial === routeSerial) {
                loading && loading.classList.add("hidden");
                renderTheory(t);
            }
        }).catch(err => {
            if (serial !== routeSerial) return;
            loading && loading.classList.add("hidden");
            phaseSelectionSerial++;
            currentTheory = null;
            destroySeibergGraph();
            document.getElementById("theoryPage").classList.add("hidden");
            document.getElementById("homePage").classList.remove("hidden");
            showResults([], String(err.message || err));
        });
    } else {
        document.getElementById("theoryLoadStatus")?.classList.add("hidden");
        phaseSelectionSerial++;
        currentTheory = null;
        document.getElementById("theoryPage").classList.add("hidden");
        document.getElementById("homePage").classList.remove("hidden");
        destroySeibergGraph();
    }
}

window.addEventListener("hashchange", route);

/* ============================== init ==================================== */

buildPropForm();
renderDrawCanvas();
route();
