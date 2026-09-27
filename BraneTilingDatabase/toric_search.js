/*
 * Pure toric-polygon helpers shared by the drawing UI and its exhaustive
 * catalog regression test.  Keep canonicalPolygonKey in lock-step with
 * braneTiling.utils.canonical_polygon: the v3 search catalog stores exactly
 * that canonical form.
 */
(function (root, factory) {
    const api = factory();
    if (typeof module === "object" && module.exports) module.exports = api;
    root.DIMER_DB_TORIC_SEARCH = api;
})(typeof globalThis === "object" ? globalThis : this, function () {
    "use strict";

    function gcd(a, b) {
        a = Math.abs(a); b = Math.abs(b);
        while (b) [a, b] = [b, a % b];
        return a;
    }

    // Python's // floors towards -Infinity; Math.trunc (used by the retired
    // browser canonicalizer) does not.  Negative Euclidean-algorithm states
    // occur for perfectly ordinary reflected polygons.
    function extendedGcdFloor(a, b) {
        let oldR = a, r = b, oldS = 1, s = 0, oldT = 0, t = 1;
        while (r !== 0) {
            const q = Math.floor(oldR / r);
            [oldR, r] = [r, oldR - q * r];
            [oldS, s] = [s, oldS - q * s];
            [oldT, t] = [t, oldT - q * t];
        }
        if (oldR < 0) {
            oldR = -oldR; oldS = -oldS; oldT = -oldT;
        }
        return { g: oldR, x: oldS, y: oldT };
    }

    function convexHull(points) {
        const unique = new Map();
        for (const point of points || []) {
            const x = Number(point?.[0]), y = Number(point?.[1]);
            if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y)) {
                throw new TypeError("toric polygon coordinates must be safe integers");
            }
            unique.set(`${x},${y}`, [x, y]);
        }
        const sorted = [...unique.values()]
            .sort((left, right) => left[0] - right[0] || left[1] - right[1]);
        if (sorted.length <= 1) return sorted;
        const cross = (o, a, b) =>
            (a[0] - o[0]) * (b[1] - o[1])
            - (a[1] - o[1]) * (b[0] - o[0]);
        const half = sequence => {
            const result = [];
            for (const point of sequence) {
                while (result.length >= 2
                        && cross(result.at(-2), result.at(-1), point) <= 0) {
                    result.pop();
                }
                result.push(point);
            }
            return result;
        };
        const lower = half(sorted);
        const upper = half([...sorted].reverse());
        return lower.slice(0, -1).concat(upper.slice(0, -1));
    }

    function comparePointSequences(left, right) {
        const count = Math.min(left.length, right.length);
        for (let i = 0; i < count; i++) {
            if (left[i][0] !== right[i][0]) return left[i][0] - right[i][0];
            if (left[i][1] !== right[i][1]) return left[i][1] - right[i][1];
        }
        return left.length - right.length;
    }

    function canonicalPolygonKey(points) {
        const vertices = convexHull(points);
        if (vertices.length < 3) return null;
        let best = null;
        for (const reflected of [false, true]) {
            // canonical_polygon reflects x, reverses orientation, then takes
            // the hull again.  Re-hulling also removes any dependence on the
            // incoming vertex order.
            const transformedVertices = reflected
                ? convexHull([...vertices].reverse().map(([x, y]) => [-x, y]))
                : vertices;
            const n = transformedVertices.length;
            for (let start = 0; start < n; start++) {
                const cycle = Array.from(
                    { length: n }, (_, offset) =>
                        transformedVertices[(start + offset) % n],
                );
                let edgeX = cycle[1][0] - cycle[0][0];
                let edgeY = cycle[1][1] - cycle[0][1];
                const divisor = gcd(edgeX, edgeY);
                edgeX /= divisor; edgeY /= divisor;
                const { x: firstX, y: firstY } =
                    extendedGcdFloor(edgeX, edgeY);
                let candidate = cycle.map(([x, y]) => {
                    const px = x - cycle[0][0], py = y - cycle[0][1];
                    return [
                        firstX * px + firstY * py,
                        -edgeY * px + edgeX * py,
                    ];
                });
                const topY = Math.max(...candidate.map(point => point[1]));
                const topX = Math.max(...candidate
                    .filter(point => point[1] === topY)
                    .map(point => point[0]));
                const shear = -Math.floor(topX / topY);
                candidate = candidate.map(([x, y]) => [x + shear * y, y]);
                if (best === null || comparePointSequences(candidate, best) < 0)
                    best = candidate;
            }
        }
        return best.map(([x, y]) => `${x},${y}`).join(";");
    }

    return Object.freeze({ canonicalPolygonKey, convexHull });
});
