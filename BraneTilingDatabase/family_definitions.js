/* EDIT FAMILY DEFINITIONS AND REFERENCES HERE.
 * Frontend-only editorial content: never serialized into the scientific data.
 * paragraphs accept MathJax \(...\) and \[...\], not HTML. Add reference keys
 * to an entry's references array; use citationElement for the forthcoming paper
 * so changing the existing BibTeX/citation box updates its link automatically.
 */
(function (root, factory) {
    const api = factory();
    if (typeof module === "object" && module.exports) module.exports = api;
    else root.BraneFamilyDefinitions = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
    "use strict";
    const references = {
        database: { label: "R. Seong and B. Suzzoni — Classifying Brane Tilings: to infinity and beyond (forthcoming; see citation below)", citationElement: "paperCitation" },
        labc: { label: "S. Franco, A. Hanany, D. Martelli, J. Sparks, D. Vegh and B. Wecht — Gauge Theories from Toric Geometry and Brane Tilings (hep-th/0505211)", url: "https://arxiv.org/abs/hep-th/0505211" },
        lgeometry: { label: "M. Cvetič, H. Lü, D. N. Page and C. N. Pope — New Einstein-Sasaki Spaces in Five and Higher Dimensions (hep-th/0504225)", url: "https://arxiv.org/abs/hep-th/0504225" },
        ypq: { label: "S. Benvenuti, S. Franco, A. Hanany, D. Martelli and J. Sparks — An Infinite Family of Superconformal Quiver Gauge Theories with Sasaki-Einstein Duals (hep-th/0411264)", url: "https://arxiv.org/abs/hep-th/0411264" },
        ygeometry: { label: "J. P. Gauntlett, D. Martelli, J. Sparks and D. Waldram — Sasaki-Einstein Metrics on S² × S³ (hep-th/0403002)", url: "https://arxiv.org/abs/hep-th/0403002" },
        xpq: { label: "A. Hanany, P. Kazakopoulos and B. Wecht — A New Infinite Class of Quiver Gauge Theories (hep-th/0503177)", url: "https://arxiv.org/abs/hep-th/0503177" },
        zpq: { label: "T. Oota and Y. Yasui — New Example of Infinite Family of Quiver Gauge Theories (hep-th/0610092)", url: "https://arxiv.org/abs/hep-th/0610092" },
        habcd: { label: "S.-J. Lee, R.-K. Seong and B. Suzzoni — Tilting Mutations and Quiver-Invariant Dualities in Brane Tilings (2608.07269), §1", url: "https://arxiv.org/abs/2608.07269" },
        conifold: { label: "I. R. Klebanov and E. Witten — Superconformal Field Theory on Threebranes at a Calabi-Yau Singularity (hep-th/9807080)", url: "https://arxiv.org/abs/hep-th/9807080" },
        dimers: { label: "A. Hanany and K. D. Kennaway — Dimer Models and Toric Diagrams (hep-th/0503149)", url: "https://arxiv.org/abs/hep-th/0503149" },
        reflexive: { label: "A. Hanany and R.-K. Seong — Brane Tilings and Reflexive Polygons (1201.2614)", url: "https://arxiv.org/abs/1201.2614" },
        surfaces: { label: "B. Feng, A. Hanany and Y.-H. He — D-Brane Gauge Theories from Toric Singularities and Toric Duality (hep-th/0003085)", url: "https://arxiv.org/abs/hep-th/0003085" },
    };
    const definitions = {
        c3: { title: String.raw`\(\mathbb C^3\)`, paragraphs: [String.raw`Affine three-space, with toric polygon \(\operatorname{conv}\{(0,0),(1,0),(0,1)\}\). Its finite abelian toric quotients are labelled by their group and action.`], references: ["dimers"] },
        conifold: { title: "Conifold", paragraphs: [String.raw`The affine Calabi–Yau threefold \(uv=xy\), with toric polygon \(\operatorname{conv}\{(0,0),(1,0),(1,1),(0,1)\}\).`], references: ["conifold"] },
        labc: { title: String.raw`\(L^{a,b,c}\)`, paragraphs: [String.raw`Write \(d=a+b-c\). The toric cone has the four-ray Calabi–Yau charge relation \((a,b,-c,-d)\), with \(a,b,c,d>0\). The family generalizes \(Y^{p,q}\). Its quivers and superpotentials are constructed in Franco–Hanany et al.; the Sasaki–Einstein geometry was introduced by Cvetič et al.`, String.raw`For non-coprime parameters the charge relation alone does not fix the ambient quotient lattice. Use the stored polygon and explicit orbifold action, rather than discarding common factors.`], references: ["labc", "lgeometry"] },
        ypq: {
            title: String.raw`\(Y^{p,q}\)`,
            paragraphs: [String.raw`In the database lattice convention, \(P=\operatorname{conv}\{(0,0),(1,0),(0,p),(-1,p+q)\}\), with \(p\ge1\), \(0\le q\le p\). The endpoint \(q=p\) is a degenerate-corner limit; it need not have four extreme vertices. These are cones over the \(Y^{p,q}\) Sasaki–Einstein spaces.`],
            references: ["ygeometry", "ypq"],
        },
        xpq: { title: String.raw`\(X^{p,q}\)`, paragraphs: [String.raw`\(P=\operatorname{conv}\{(1,0),(2,0),(1,p),(0,p-q+1),(0,p-q)\}\), with \(1\le q\le p\). This family Higgses to \(Y^{p,q}\) theories. Generic members have five corners; boundary parameter choices may have fewer.`], references: ["xpq"] },
        zpq: { title: String.raw`\(Z^{p,q}\)`, paragraphs: [String.raw`\(P=\operatorname{conv}\{(1,0),(2,0),(2,1),(1,p),(0,p-q+1),(0,p-q)\}\), with \(1\le q\le p\). This family extends \(X^{p,q}\); generic members have six corners. Degenerate parameter choices may have fewer.`], references: ["zpq"] },
        habcd: { title: String.raw`\(H^{a,b,c,d}\)`, paragraphs: [String.raw`\(P=\operatorname{conv}\{(0,0),(1,0),(a+1,b),(a+1,b+d),(a,c+d),(0,c)\}\). For the strictly convex six-corner family, \(a,b,c,d>0\) and \(d+a(c-b)>0\). Historical database aliases also include convex-hull limits with fewer corners; such an alias does not assert six extreme vertices.`], references: ["habcd"] },
        kabcd: { title: String.raw`\(K^{a,b,c,d}\) (legacy convention)`, paragraphs: ["These retained historical labels identify specific verified polygons, not a currently certified general parameterization. Automatic K-family generation is disabled because the old general formula did not reproduce every named example. The exact definition of this entry is its stored toric polygon; do not infer a new K polygon from these parameters."], references: ["database"], instancePolygon: true },
        m_polygon: {
            title: String.raw`\(M^{\ell,r,h,x,y,z,w}\) — complete pentagons`,
            paragraphs: [
                String.raw`\[P=\operatorname{conv}\{(0,0),(\ell,0),(r,h),(x,y),(z,w)\}.\]`,
                String.raw`All parameters are integers, \(\ell,h\ge1\) and \(0\le r<h\).
                    The displayed points must be distinct extreme corners in counterclockwise order:
                    \(\det(v_{i+1}-v_i,v_j-v_i)>0\) for every cyclic edge and every other displayed vertex.
                    Invalid tuples are rejected, not repaired by dropping points.`,
                String.raw`Every convex lattice pentagon is included, even with nonprimitive edges
                    or nontrivial quotient lattice. Normalize all five starting vertices in both directions,
                    reduce the third vertex's horizontal coordinate modulo its height, and select the
                    lexicographically smallest of the ten tuples. This labels a toric diagram, not a
                    particular tiling phase. M is a definition adopted in this database, not an
                    established literature name.`,
            ],
            references: ["database"],
        },
        n_polygon: {
            title: String.raw`\(N^{\ell,r,h,x,y,z,w,u,v}\) — complete hexagons`,
            paragraphs: [
                String.raw`\[P=\operatorname{conv}\{(0,0),(\ell,0),(r,h),(x,y),(z,w),(u,v)\}.\]`,
                String.raw`All parameters are integers, \(\ell,h\ge1\) and \(0\le r<h\).
                    For every cyclic edge require \(\det(v_{i+1}-v_i,v_j-v_i)>0\) for every other
                    displayed vertex. Thus all six points must be distinct, strictly convex,
                    counterclockwise extreme corners. Invalid tuples are rejected without discarding points.`,
                String.raw`Every convex lattice hexagon is included, without a primitive-edge or
                    saturated-lattice restriction. Normalize all six starting vertices and both
                    traversal directions, reduce the third vertex's horizontal coordinate modulo
                    its height, and take the lexicographically smallest of the twelve tuples.
                    N identifies the diagram, not a toric phase, and is a definition adopted here
                    rather than an established literature name.`,
            ],
            references: ["database"],
        },
        delpezzo: {
            title: String.raw`\(dP_n\)`,
            paragraphs: [String.raw`The affine anticanonical cone over the del Pezzo surface obtained by blowing up \(n\) generic points of \(\mathbb P^2\). The toric cases here are \(n=0,1,2,3\). The stored lattice polygon distinguishes its geometry and toric phases.`],
            references: ["surfaces", "reflexive"],
        },
        f0: {
            title: String.raw`\(F_0\)`,
            paragraphs: [String.raw`The anticanonical cone over \(\mathbb P^1\times\mathbb P^1\), equivalently \(Y^{2,0}\). A representative polygon is \(\operatorname{conv}\{(1,0),(0,1),(-1,0),(0,-1)\}\), with one interior point. It is not the unit-square conifold polygon.`],
            references: ["surfaces", "ypq", "reflexive"],
        },
        spp: { title: "Suspended pinch point (SPP)", paragraphs: [String.raw`The hypersurface \(uv=xy^2\), also \(L^{1,2,1}\). This is a four-corner toric diagram with a non-corner boundary lattice point, not a generic pentagon.`], references: ["labc"] },
        pseudo_delpezzo: { title: "Pseudo del Pezzo", paragraphs: ["Toric degenerations related to del Pezzo configurations, distinguished by their exact stored lattice polygons. A pseudo-del-Pezzo label is not interchangeable with the corresponding generic del Pezzo surface."], references: ["reflexive"], instancePolygon: true },
        reflexive: { title: "Reflexive polygon", paragraphs: [String.raw`A lattice polygon with a single interior lattice point. Translating that point to the origin gives a lattice polar dual. There are sixteen equivalence classes in two dimensions; a polygon can carry other family names at the same time.`], references: ["reflexive"] },
        orbifold: { title: "Finite abelian toric orbifold", paragraphs: [String.raw`A finite-index lattice quotient of the stated parent toric cone, displayed as parent/group followed by its action tuple(s). The database keeps the ambient lattice and the action certificate. The facet-monomial generator ordering and action convention are described in the database paper; an action tuple is not an arbitrary independent weight on every chiral field.`], references: ["dimers", "database"] },
    };
    const nameTests = {
        c3: /^(?:C3|C\^3)$/, conifold: /^(?:C|Conifold|T11)$/,
        labc: /^L\^/, ypq: /^Y\^/, xpq: /^X\^/, zpq: /^Z\^/,
        habcd: /^H\^/, kabcd: /^K\^/, m_polygon: /^M\^/, n_polygon: /^N\^/,
        delpezzo: /^(?:dP\d+[a-z]?|PP2|P2|F1)$/, f0: /^(?:F0|P1xP1)$/,
        spp: /^SPP$/, pseudo_delpezzo: /^(?:PdP|pseudo dP)/,
    };
    function entriesFor(theory) {
        const keys = new Set();
        for (const family of theory?.families || []) {
            const base = family.replace(/_orbifold$/, "");
            if (definitions[base]) keys.add(base);
            if (family.endsWith("_orbifold")) keys.add("orbifold");
        }
        for (const name of theory?.names || []) {
            const base = name.split("/")[0];
            for (const [key, test] of Object.entries(nameTests)) if (test.test(base)) keys.add(key);
            if (name.includes("/Z")) keys.add("orbifold");
        }
        return [...keys].map(key => ({ key, ...definitions[key] }));
    }
    function render(container, theory, typeset) {
        if (!container) return;
        container.ownerDocument.defaultView?.MathJax?.typesetClear?.([container]);
        container.replaceChildren();
        const entries = theory ? entriesFor(theory) : [];
        container.classList.toggle("hidden", !entries.length);
        if (!entries.length) return;
        const document = container.ownerDocument;
        const heading = document.createElement("h2");
        heading.textContent = "Family definitions and references";
        container.append(heading);
        const convention = document.createElement("p");
        convention.textContent = String.raw`Vertices mean extreme corners, not all boundary points.
            Polygon representatives are understood up to affine unimodular equivalence.
            The plotted minimal-shear frame may differ from a family's defining frame.
            The complete lattice diagram is \(P\cap\mathbb Z^2\), and its Calabi–Yau cone
            is generated by the lifted vertices \((1,v_x,v_y)\).`;
        container.append(convention);
        for (const entry of entries) {
            const article = document.createElement("article");
            article.className = "family-definition";
            article.dataset.family = entry.key;
            const title = document.createElement("h3");
            title.textContent = entry.title;
            article.append(title);
            const paragraphs = [...entry.paragraphs];
            if (entry.instancePolygon && theory.toric?.hull?.length)
                paragraphs.push("This entry: \\(P=\\operatorname{conv}\\{" + theory.toric.hull.map(p => `(${p[0]},${p[1]})`).join(",") + "\\}\\). (In its stored display frame.)");
            for (const value of paragraphs) {
                const p = document.createElement("p"); p.textContent = value; article.append(p);
            }
            const list = document.createElement("ul");
            for (const key of entry.references) {
                const reference = references[key];
                if (!reference) continue;
                const li = document.createElement("li"), a = document.createElement("a");
                const citation = reference.citationElement && document.getElementById(reference.citationElement);
                const href = reference.url || citation?.closest("article")?.querySelector(".citation-record a")?.href
                    || (reference.citationElement ? "#" + reference.citationElement : "");
                if (!/^https:\/\//.test(href) && !href.startsWith("#")) continue;
                a.href = href; a.textContent = reference.label;
                if (!href.startsWith("#")) { a.target = "_blank"; a.rel = "noopener noreferrer"; }
                li.append(a); list.append(li);
            }
            article.append(list); container.append(article);
        }
        if (typeset) typeset(container);
    }
    return { references, definitions, entriesFor, render };
});
