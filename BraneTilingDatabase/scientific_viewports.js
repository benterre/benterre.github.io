/* Interactive scientific canvases. Classic script intentionally supports file://.
 * Geometry/data are never modified; all camera transforms are presentation-only.
 * Only visible periodic copies are drawn, with a workload-limited zoom-out floor.
 */
(function (root, factory) {
    const api = factory();
    if (typeof module === "object" && module.exports) module.exports = api;
    else root.BraneScientificViewports = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
    "use strict";
    const active = new Map();
    const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));

    class Camera {
        constructor(width, height, { min = 1, max = 1, bounded = false } = {}) {
            Object.assign(this, { width, height, min, max, bounded, scale: 1, x: 0, y: 0 });
        }
        constrain() {
            this.scale = clamp(this.scale, this.min, this.max);
            if (this.bounded) {
                this.x = clamp(this.x, this.width * (1 - this.scale), 0);
                this.y = clamp(this.y, this.height * (1 - this.scale), 0);
            }
        }
        zoom(value, x = this.width / 2, y = this.height / 2) {
            const next = clamp(value, this.min, this.max), factor = next / this.scale;
            this.x = x - (x - this.x) * factor;
            this.y = y - (y - this.y) * factor;
            this.scale = next;
            this.constrain();
        }
        pan(x, y) { this.x += x; this.y += y; this.constrain(); }
        reset() { this.scale = 1; this.x = this.y = 0; this.constrain(); }
        point(p) { return [p[0] * this.scale + this.x, p[1] * this.scale + this.y]; }
        inverse(p) { return [(p[0] - this.x) / this.scale, (p[1] - this.y) / this.scale]; }
    }

    function toricLayout(toric, width, height, measure) {
        const points = toric.points || [];
        const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
        const minX = Math.min(...xs), maxX = Math.max(...xs);
        const minY = Math.min(...ys), maxY = Math.max(...ys);
        const cell = Math.min((width - 60) / Math.max(1, maxX - minX),
            (height - 60) / Math.max(1, maxY - minY), 60);
        const ox = (width - cell * (minX + maxX)) / 2;
        const oy = (height + cell * (minY + maxY)) / 2;
        const point = p => [ox + p[0] * cell, oy - p[1] * cell];
        const corners = new Set((toric.hull || []).map(p => `${p[0]},${p[1]}`));
        const labels = points.filter(p => p[2] != null && !corners.has(`${p[0]},${p[1]}`));
        // Test actual text extents, not genus: long exact multiplicities may
        // crowd even a modest polygon. Binned boxes make this linear in the
        // ordinary lattice case and avoid a quadratic all-points comparison.
        const bins = new Map(), boxes = [];
        let crowded = cell < 20;
        const addBox = box => {
            const [left, top, right, bottom] = box;
            for (let i = Math.floor(left / 32); i <= Math.floor(right / 32); i++) {
                for (let j = Math.floor(top / 32); j <= Math.floor(bottom / 32); j++) {
                    const key = `${i},${j}`, previous = bins.get(key) || [];
                    for (const other of previous)
                        if (left < other[2] && right > other[0] && top < other[3] && bottom > other[1]) crowded = true;
                    previous.push(box); bins.set(key, previous);
                }
            }
        };
        for (const p of points) {
            const [x, y] = point(p);
            addBox([x - 6, y - 6, x + 6, y + 6]);
        }
        for (const p of labels) {
            const [x, y] = point(p), box = [x + 8, y - 20, x + 8 + measure(String(p[2])), y - 6];
            boxes.push(box); addBox(box);
            if (box[0] < 0 || box[1] < 0 || box[2] > width || box[3] > height) crowded = true;
        }
        return { point, cell, minX, maxX, minY, maxY, corners, labels, crowded,
            maxZoom: Math.max(1, width / (3 * cell)), boxes };
    }

    function tilingGeometry(tiling, width, height) {
        let lattice = tiling.lattice.map(p => p.slice()), nodes = tiling.nodes.map(p => p.slice());
        let sx = 1, sy = 1, mxx = 0, myy = 0;
        // Preserve the previous strip-isotropization and initial framing.
        for (const [b, w, u, v] of tiling.edges) {
            const dx = nodes[w][0] + u * lattice[0][0] + v * lattice[1][0] - nodes[b][0];
            const dy = nodes[w][1] + u * lattice[0][1] + v * lattice[1][1] - nodes[b][1];
            mxx += dx * dx; myy += dy * dy;
        }
        if (mxx > 1e-12 && myy > 1e-12) {
            const q = Math.sqrt(myy / mxx);
            if (q > 2) sx = Math.min(q, 24);
            else if (q < 0.5) sy = Math.min(1 / q, 24);
        }
        nodes = nodes.map(p => [p[0] * sx, p[1] * sy, p[2]]);
        lattice = lattice.map(p => [p[0] * sx, p[1] * sy]);
        const det = lattice[0][0] * lattice[1][1] - lattice[0][1] * lattice[1][0];
        if (!Number.isFinite(det) || Math.abs(det) < 1e-15) throw new Error("singular tiling lattice");
        const xy = (u, v) => [u * lattice[0][0] + v * lattice[1][0], u * lattice[0][1] + v * lattice[1][1]];
        const uv = p => [(p[0] * lattice[1][1] - p[1] * lattice[1][0]) / det,
            (-p[0] * lattice[0][1] + p[1] * lattice[0][0]) / det];
        const view = [[-.06, -.06], [1.06, -.06], [1.06, 1.06], [-.06, 1.06]].map(p => xy(...p));
        const minX = Math.min(...view.map(p => p[0])), maxX = Math.max(...view.map(p => p[0]));
        const minY = Math.min(...view.map(p => p[1])), maxY = Math.max(...view.map(p => p[1]));
        const scale = Math.min((width - 24) / (maxX - minX), (height - 24) / (maxY - minY));
        const ox = (width - scale * (maxX + minX)) / 2, oy = (height + scale * (maxY + minY)) / 2;
        const point = p => [ox + p[0] * scale, oy - p[1] * scale];
        const world = p => [(p[0] - ox) / scale, (oy - p[1]) / scale];
        const segments = tiling.edges.map(([b, w, u, v]) => {
            const a = nodes[b].slice(0, 2), bPoint = [nodes[w][0] + u * lattice[0][0] + v * lattice[1][0],
                nodes[w][1] + u * lattice[0][1] + v * lattice[1][1]];
            return { a, b: bPoint, delta: [bPoint[0] - a[0], bPoint[1] - a[1]],
                aUV: uv(a), bUV: uv(bPoint) };
        });
        const faceEdges = new Map();
        tiling.edges.forEach((edge, i) => {
            for (const f of new Set(edge.slice(4, 6))) {
                if (!faceEdges.has(f)) faceEdges.set(f, []);
                faceEdges.get(f).push(i);
            }
        });
        const faces = (tiling.faces || []).map(([f, fx, fy]) => {
            const ids = faceEdges.get(f) || [], lift = new Map();
            if (ids.length) lift.set(tiling.edges[ids[0]][0], segments[ids[0]].a);
            let changed = true;
            while (changed) {
                changed = false;
                for (const i of ids) {
                    const [b, w] = tiling.edges[i], d = segments[i].delta;
                    if (lift.has(b) && !lift.has(w)) {
                        const p = lift.get(b); lift.set(w, [p[0] + d[0], p[1] + d[1]]); changed = true;
                    } else if (lift.has(w) && !lift.has(b)) {
                        const p = lift.get(w); lift.set(b, [p[0] - d[0], p[1] - d[1]]); changed = true;
                    }
                }
            }
            let x = 0, y = 0, count = 0;
            for (const i of ids) {
                const p = lift.get(tiling.edges[i][0]), d = segments[i].delta;
                if (p) { x += p[0] + d[0] / 2; y += p[1] + d[1] / 2; count++; }
            }
            let [u, v] = uv(count ? [x / count, y / count] : [fx * sx, fy * sy]);
            u -= Math.floor(u); v -= Math.floor(v);
            return { id: f, p: xy(u, v), uv: [u, v] };
        });
        const uvNodes = nodes.map(n => uv(n));
        const baseEdge = segments.length ? Math.min(...segments.map(s => Math.hypot(...s.delta) * scale).filter(d => d > 1e-6)) : 10;
        return { lattice, nodes, segments, faces, uvNodes, point, world, xy, uv, scale, baseEdge,
            cell: [[0, 0], [1, 0], [1, 1], [0, 1]].map(p => xy(...p)) };
    }

    // Integer translations whose primitive bounding boxes intersect the view
    // in lattice coordinates. Includes long winding edges, not just +/-1 cells.
    function translations(bounds, a, b = a) {
        return [Math.ceil(bounds[0] - Math.max(a[0], b[0])), Math.floor(bounds[2] - Math.min(a[0], b[0])),
            Math.ceil(bounds[1] - Math.max(a[1], b[1])), Math.floor(bounds[3] - Math.min(a[1], b[1]))];
    }
    function periodicBounds(geometry, camera, margin = 12) {
        const corners = [[-margin, -margin], [camera.width + margin, -margin],
            [camera.width + margin, camera.height + margin], [-margin, camera.height + margin]]
            .map(p => geometry.uv(geometry.world(camera.inverse(p))));
        return [Math.min(...corners.map(p => p[0])), Math.min(...corners.map(p => p[1])),
            Math.max(...corners.map(p => p[0])), Math.max(...corners.map(p => p[1]))];
    }
    function periodicCost(geometry, camera) {
        const b = periodicBounds(geometry, camera);
        let count = 0;
        const add = (a, z = a) => {
            const r = translations(b, a, z);
            count += Math.max(0, r[1] - r[0] + 1) * Math.max(0, r[3] - r[2] + 1);
        };
        geometry.segments.forEach(s => add(s.aUV, s.bUV));
        geometry.uvNodes.forEach(p => add(p));
        geometry.faces.forEach(f => add(f.uv));
        return count;
    }

    function controls(canvas) {
        const doc = canvas.ownerDocument;
        const box = doc.createElement("div"); box.className = "scientific-controls";
        const buttons = {};
        for (const [key, text, label] of [["minus", "−", "Zoom out"], ["plus", "+", "Zoom in"], ["reset", "Reset", "Reset view"]]) {
            const button = doc.createElement("button"); button.type = "button"; button.textContent = text;
            button.setAttribute("aria-label", `${label}: ${canvas.id === "toricCanvas" ? "toric diagram" : "brane tiling"}`);
            button.dataset.viewAction = key; box.appendChild(button); buttons[key] = button;
        }
        const status = doc.createElement("span"); status.className = "scientific-zoom"; box.appendChild(status);
        const hint = doc.createElement("div"); hint.className = "scientific-hint";
        const detail = doc.createElement("div"); detail.className = "scientific-point-detail";
        detail.setAttribute("role", "status"); detail.setAttribute("aria-live", "polite");
        canvas.insertAdjacentElement("afterend", box); box.insertAdjacentElement("afterend", hint);
        hint.insertAdjacentElement("afterend", detail);
        return { box, buttons, status, hint, detail };
    }

    class Viewport {
        constructor(canvas, type, data, glsmLabels) {
            this.canvas = canvas; this.type = type; this.data = data; this.glsmLabels = glsmLabels;
            this.width = Number(canvas.dataset.logicalWidth || canvas.getAttribute("width"));
            this.height = Number(canvas.dataset.logicalHeight || canvas.getAttribute("height"));
            canvas.dataset.logicalWidth = String(this.width); canvas.dataset.logicalHeight = String(this.height);
            canvas.style.width = `${this.width}px`; canvas.style.height = "auto";
            canvas.style.aspectRatio = `${this.width} / ${this.height}`;
            this.ctx = canvas.getContext("2d"); this.ctx.font = "bold 12px sans-serif";
            this.listeners = []; this.pointers = new Map(); this.frame = null;
            let hint;
            if (type === "toric") {
                this.geometry = toricLayout(data, this.width, this.height, s => this.ctx.measureText(s).width);
                this.interactive = this.geometry.crowded && this.geometry.maxZoom > 1.001;
                this.camera = new Camera(this.width, this.height, { bounded: true, max: this.interactive ? this.geometry.maxZoom : 1 });
                hint = this.interactive
                    ? "Scroll or pinch to zoom · drag to explore · tap a point for its exact multiplicity"
                    : "Tap a point for its exact multiplicity";
            } else {
                this.geometry = tilingGeometry(data, this.width, this.height);
                this.interactive = true;
                this.camera = new Camera(this.width, this.height, { min: .2, max: Math.max(32, Math.min(4096, 80 / this.geometry.baseEdge)) });
                const budget = Math.max(120000, periodicCost(this.geometry, this.camera) * 2);
                this.camera.scale = .2;
                while (this.camera.scale < 1 && periodicCost(this.geometry, this.camera) > budget) this.camera.scale *= 1.25;
                this.camera.min = Math.min(1, this.camera.scale); this.camera.reset();
                hint = "Scroll or pinch to zoom · drag to explore the repeated tiling · pink outline: original torus cell";
            }
            this.ui = controls(canvas); this.ui.hint.textContent = hint;
            this.ui.box.hidden = !this.interactive;
            canvas.classList.toggle("scientific-interactive", this.interactive);
            canvas.tabIndex = 0;
            canvas.setAttribute("role", "img");
            canvas.setAttribute("aria-label", type === "toric" ? "Toric diagram. Select a point to read its multiplicity."
                : "Periodic brane tiling. Use plus and minus to zoom, arrow keys to pan, and Home to reset.");
            this.installEvents();
            this.observer = typeof ResizeObserver === "function" ? new ResizeObserver(() => this.schedule()) : null;
            this.observer?.observe(canvas);
            this.listen(window, "resize", () => this.schedule());
            this.draw();
        }
        listen(target, name, fn, opts) { target.addEventListener(name, fn, opts); this.listeners.push(() => target.removeEventListener(name, fn, opts)); }
        local(event) {
            const r = this.canvas.getBoundingClientRect();
            return [(event.clientX - r.left) * this.width / r.width, (event.clientY - r.top) * this.height / r.height];
        }
        installEvents() {
            const { canvas, camera, ui } = this;
            this.listen(ui.buttons.plus, "click", () => { camera.zoom(camera.scale * 1.5); this.schedule(); });
            this.listen(ui.buttons.minus, "click", () => { camera.zoom(camera.scale / 1.5); this.schedule(); });
            this.listen(ui.buttons.reset, "click", () => { camera.reset(); ui.detail.textContent = ""; this.schedule(); });
            this.listen(canvas, "wheel", event => {
                if (!this.interactive) return;
                event.preventDefault();
                const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? this.height : 1);
                camera.zoom(camera.scale * Math.exp(clamp(-delta * .002, -.5, .5)), ...this.local(event)); this.schedule();
            }, { passive: false });
            this.listen(canvas, "keydown", event => {
                if (!this.interactive) return;
                if (event.key === "+" || event.key === "=") camera.zoom(camera.scale * 1.5);
                else if (event.key === "-") camera.zoom(camera.scale / 1.5);
                else if (event.key === "Home" || event.key === "0") camera.reset();
                else if (event.key.startsWith("Arrow")) {
                    camera.pan(event.key === "ArrowLeft" ? 24 : event.key === "ArrowRight" ? -24 : 0,
                        event.key === "ArrowUp" ? 24 : event.key === "ArrowDown" ? -24 : 0);
                } else return;
                event.preventDefault(); this.schedule();
            });
            this.listen(canvas, "pointerdown", event => {
                if (event.button != null && event.button !== 0) return;
                const p = this.local(event); this.pointers.set(event.pointerId, p);
                this.tap = this.pointers.size === 1 ? { start: p, id: event.pointerId } : null;
                canvas.setPointerCapture(event.pointerId); canvas.classList.add("is-dragging");
            });
            this.listen(canvas, "pointermove", event => {
                if (!this.pointers.has(event.pointerId)) return;
                const before = [...this.pointers.values()], old = this.pointers.get(event.pointerId), now = this.local(event);
                this.pointers.set(event.pointerId, now);
                if (this.tap && Math.hypot(now[0] - this.tap.start[0], now[1] - this.tap.start[1]) > 5) this.tap = null;
                if (!this.interactive) return;
                if (this.pointers.size === 1) camera.pan(now[0] - old[0], now[1] - old[1]);
                else if (this.pointers.size === 2) {
                    const after = [...this.pointers.values()];
                    const center = values => [(values[0][0] + values[1][0]) / 2, (values[0][1] + values[1][1]) / 2];
                    const distance = values => Math.hypot(values[0][0] - values[1][0], values[0][1] - values[1][1]);
                    const b = center(before), a = center(after), d = distance(before);
                    camera.zoom(camera.scale * (d > 1 ? distance(after) / d : 1), ...b);
                    camera.pan(a[0] - b[0], a[1] - b[1]);
                }
                this.schedule();
            });
            const release = event => {
                if (event.type === "pointerup" && this.tap?.id === event.pointerId && this.type === "toric") this.selectPoint(this.local(event));
                this.pointers.delete(event.pointerId); this.tap = null;
                if (!this.pointers.size) canvas.classList.remove("is-dragging");
                if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
            };
            for (const name of ["pointerup", "pointercancel", "lostpointercapture"]) this.listen(canvas, name, release);
            // Keyboard users can read exact values without aiming at a canvas.
            if (this.type === "toric") {
                const details = canvas.ownerDocument.createElement("details"); details.className = "scientific-values";
                const summary = canvas.ownerDocument.createElement("summary"); summary.textContent = "Exact lattice points and multiplicities";
                details.appendChild(summary);
                const list = canvas.ownerDocument.createElement("div"); list.className = "scientific-value-list";
                for (const p of this.data.points) {
                    const item = canvas.ownerDocument.createElement("div");
                    item.textContent = `(${p[0]}, ${p[1]}): ${p[2] ?? "not available"}`; list.appendChild(item);
                }
                details.appendChild(list); ui.detail.insertAdjacentElement("afterend", details); this.values = details;
            }
        }
        selectPoint(at) {
            let best = null, distance = 14;
            for (const p of this.data.points) {
                const q = this.camera.point(this.geometry.point(p)), d = Math.hypot(q[0] - at[0], q[1] - at[1]);
                if (d < distance) { best = p; distance = d; }
            }
            if (best) this.ui.detail.textContent = `(${best[0]}, ${best[1]}) · multiplicity ${best[2] ?? "not available"}`;
        }
        schedule() {
            if (this.frame != null || this.disposed) return;
            this.frame = requestAnimationFrame(() => { this.frame = null; this.draw(); });
        }
        draw() {
            if (this.disposed) return;
            const { canvas, ctx, camera } = this;
            const r = canvas.getBoundingClientRect();
            if (!r.width || !r.height) return;
            const dpr = Math.min(3, window.devicePixelRatio || 1);
            const width = Math.round(r.width * dpr), height = Math.round(r.height * dpr);
            if (canvas.width !== width) canvas.width = width;
            if (canvas.height !== height) canvas.height = height;
            ctx.setTransform(width / this.width, 0, 0, height / this.height, 0, 0);
            ctx.clearRect(0, 0, this.width, this.height);
            ctx.save(); ctx.beginPath(); ctx.rect(0, 0, this.width, this.height); ctx.clip();
            if (this.type === "toric") this.drawToric(); else this.drawTiling();
            ctx.restore();
            this.ui.status.textContent = `${Math.round(camera.scale * 100)}%`;
            this.ui.buttons.minus.disabled = camera.scale <= camera.min + 1e-8;
            this.ui.buttons.plus.disabled = camera.scale >= camera.max - 1e-8;
            canvas.dataset.viewScale = String(camera.scale);
            canvas.dataset.viewX = String(camera.x); canvas.dataset.viewY = String(camera.y);
            canvas.dataset.interactive = String(this.interactive);
        }
        drawToric() {
            const { ctx, geometry: g, camera: c, data } = this;
            const P = p => c.point(g.point(p)), spacing = g.cell * c.scale;
            // Ambient lattice is clipped to visible integer coordinates, not
            // the potentially huge bounding rectangle of the whole polygon.
            const baseTL = c.inverse([0, 0]), baseBR = c.inverse([this.width, this.height]);
            const zero = g.point([0, 0]);
            const xmin = Math.max(g.minX, Math.ceil((baseTL[0] - zero[0]) / g.cell));
            const xmax = Math.min(g.maxX, Math.floor((baseBR[0] - zero[0]) / g.cell));
            const ymin = Math.max(g.minY, Math.ceil((zero[1] - baseBR[1]) / g.cell));
            const ymax = Math.min(g.maxY, Math.floor((zero[1] - baseTL[1]) / g.cell));
            ctx.fillStyle = "#273049";
            if ((xmax - xmin + 1) * (ymax - ymin + 1) <= 30000) {
                for (let x = xmin; x <= xmax; x++) for (let y = ymin; y <= ymax; y++) {
                    const p = P([x, y]); ctx.beginPath(); ctx.arc(...p, Math.min(2, spacing * .12), 0, 7); ctx.fill();
                }
            }
            ctx.beginPath();
            data.hull.forEach((p, i) => { const q = P(p); i ? ctx.lineTo(...q) : ctx.moveTo(...q); });
            ctx.closePath(); ctx.fillStyle = "rgba(94,234,212,0.08)"; ctx.strokeStyle = "#5eead4";
            ctx.lineWidth = 1.6; ctx.fill(); ctx.stroke();
            const occupied = [];
            for (const p of data.points) {
                const [x, y] = P(p);
                if (x < -8 || y < -8 || x > this.width + 8 || y > this.height + 8) continue;
                const radius = Math.min(5.5, spacing * .17);
                ctx.beginPath(); ctx.arc(x, y, radius, 0, 7); ctx.fillStyle = "#e8ecf5"; ctx.fill();
                if (p[2] == null || g.corners.has(`${p[0]},${p[1]}`)) continue;
                const text = String(p[2]); ctx.font = "bold 12px sans-serif";
                const naturalWidth = ctx.measureText(text).width;
                // Dense diagrams use the empty upper-right part of a lattice
                // cell. Both the full integer string and its box scale down;
                // exact strings are never rounded to scientific notation.
                const font = g.crowded ? Math.min(12, spacing * .32,
                    12 * Math.max(1, spacing * .75 - radius) / Math.max(1, naturalWidth)) : 12;
                const dx = g.crowded ? radius + 1 : 8, dy = g.crowded ? -radius - 1 : -7;
                ctx.font = `bold ${font}px sans-serif`; ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
                const width = ctx.measureText(text).width, box = [x + dx, y + dy - font, x + dx + width, y + dy + 1];
                if (occupied.some(b => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1])) continue;
                occupied.push(box); ctx.fillStyle = "#f9a8d4"; ctx.fillText(text, x + dx, y + dy);
            }
            this.labelBoxes = occupied;
            if (this.glsmLabels) {
                ctx.font = "italic bold 12px serif"; ctx.fillStyle = "#5eead4";
                for (const label of this.glsmLabels) { const p = P([label.x, label.y]); ctx.fillText(label.label, p[0] + 8, p[1] + 14); }
            }
        }
        drawTiling() {
            const { ctx, geometry: g, camera: c } = this;
            const bounds = periodicBounds(g, c), P = p => c.point(g.point(p));
            let copies = 0, faces = 0;
            const visit = (a, b, fn) => {
                const r = translations(bounds, a, b);
                for (let i = r[0]; i <= r[1]; i++) for (let j = r[2]; j <= r[3]; j++) { fn(g.xy(i, j)); copies++; }
            };
            ctx.lineWidth = 1.5; ctx.strokeStyle = "#cbd5f0";
            ctx.beginPath();
            for (const s of g.segments) visit(s.aUV, s.bUV, shift => {
                const a = P([s.a[0] + shift[0], s.a[1] + shift[1]]), b = P([s.b[0] + shift[0], s.b[1] + shift[1]]);
                if (Math.max(a[0], b[0]) < -8 || Math.min(a[0], b[0]) > this.width + 8 ||
                    Math.max(a[1], b[1]) < -8 || Math.min(a[1], b[1]) > this.height + 8) return;
                ctx.moveTo(...a); ctx.lineTo(...b);
            });
            ctx.stroke();
            const radius = Math.min(5, Math.max(.5, g.baseEdge * c.scale * .15));
            for (let i = 0; i < g.nodes.length; i++) visit(g.uvNodes[i], g.uvNodes[i], shift => {
                const n = g.nodes[i], p = P([n[0] + shift[0], n[1] + shift[1]]);
                if (p[0] < -8 || p[0] > this.width + 8 || p[1] < -8 || p[1] > this.height + 8) return;
                ctx.beginPath(); ctx.arc(...p, radius, 0, 7); ctx.fillStyle = n[2] === 1 ? "#0d1220" : "#e8ecf5";
                ctx.fill(); ctx.strokeStyle = "#e8ecf5"; ctx.lineWidth = Math.min(1.4, radius); ctx.stroke();
            });
            ctx.strokeStyle = "#f9a8d4"; ctx.setLineDash([6, 5]); ctx.lineWidth = 1.2; ctx.beginPath();
            g.cell.forEach((p, i) => { const q = P(p); i ? ctx.lineTo(...q) : ctx.moveTo(...q); });
            ctx.closePath(); ctx.stroke(); ctx.setLineDash([]);
            const font = Math.min(14, Math.max(2, g.baseEdge * c.scale * .55));
            ctx.font = `bold ${font}px sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
            ctx.fillStyle = "#5eead4";
            for (const face of g.faces) visit(face.uv, face.uv, shift => {
                const p = P([face.p[0] + shift[0], face.p[1] + shift[1]]);
                if (p[0] < -8 || p[0] > this.width + 8 || p[1] < -8 || p[1] > this.height + 8) return;
                // Dark halo keeps numbers readable across nearby light edges.
                ctx.strokeStyle = "#0d1220"; ctx.lineWidth = 2.5; ctx.strokeText(String(face.id + 1), ...p);
                ctx.fillText(String(face.id + 1), ...p); faces++;
            });
            this.canvas.dataset.visibleCopies = String(copies); this.canvas.dataset.visibleFaces = String(faces);
            this.canvas.dataset.faceFont = String(font);
        }
        dispose() {
            this.disposed = true; this.observer?.disconnect();
            if (this.frame != null) cancelAnimationFrame(this.frame);
            this.listeners.forEach(fn => fn()); this.pointers.clear();
            this.ui.box.remove(); this.ui.hint.remove(); this.ui.detail.remove(); this.values?.remove();
            this.canvas.classList.remove("scientific-interactive", "is-dragging");
            this.canvas.removeAttribute("tabindex"); this.canvas.removeAttribute("role");
            this.canvas.removeAttribute("aria-label");
            for (const key of ["viewScale", "viewX", "viewY", "interactive", "visibleCopies", "visibleFaces", "faceFont"])
                delete this.canvas.dataset[key];
            // Restore the legacy logical surface as well as its identity
            // transform, so a later phase with missing/invalid data can use
            // the static error renderer without inheriting our DPR matrix.
            this.canvas.width = this.width; this.canvas.height = this.height;
        }
    }
    function dispose(canvas) { active.get(canvas)?.dispose(); active.delete(canvas); }
    function disposeAll() { [...active.keys()].forEach(dispose); }
    function render(canvas, type, data, labels) {
        dispose(canvas);
        if (!data || type === "toric" && !data.points?.length) return false;
        try { const view = new Viewport(canvas, type, data, labels); active.set(canvas, view); return true; }
        catch (error) { console.warn("Scientific viewport unavailable:", error.message); return false; }
    }
    return { renderToric: (canvas, data, labels) => render(canvas, "toric", data, labels),
        renderTiling: (canvas, data) => render(canvas, "tiling", data), dispose, disposeAll,
        // Geometry/camera exports support deterministic offline regression tests.
        internals: { Camera, toricLayout, tilingGeometry, translations, periodicBounds, periodicCost, active } };
});
