function dynamicPlots(containerId, file, res, nPoints, wn, rn, varStr) {

    const container = document.getElementById(containerId);
    if (!container) {
        console.error("Container not found:", containerId);
        return;
    }

    // ================= CREATE LAYOUT =================

    container.innerHTML = "";
    // container.style.display = "flex";
    // container.style.flexDirection = "row";
    container.style.gap = "20px";
    // container.style.alignItems = "flex-start";

    // Left: parameter image
    const paramCanvas = document.createElement("canvas");
    paramCanvas.style.border = "1px solid black";
    paramCanvas.style.cursor = "crosshair";
    // container.appendChild(paramCanvas);

    const overlay = document.createElement("div");
    overlay.style.position = "absolute";
    overlay.style.top = "10px";
    overlay.style.left = "10px";
    overlay.style.background = "rgba(255,255,255,0.8)";
    overlay.style.padding = "4px 8px";
    overlay.style.fontFamily = "monospace";
    overlay.style.fontSize = "14px";
    overlay.style.border = "1px solid black";
    overlay.style.pointerEvents = "none";

    const canvasWrapper = document.createElement("div");
    canvasWrapper.style.position = "relative";
    canvasWrapper.appendChild(paramCanvas);
    canvasWrapper.appendChild(overlay);
    container.appendChild(canvasWrapper);

    // Right: plot container
    const plotsDiv = document.createElement("div");
    plotsDiv.style.display = "flex";
    plotsDiv.style.flexDirection = "row";
    plotsDiv.style.gap = "20px";
    container.appendChild(plotsDiv);

    const plotA = document.createElement("canvas");
    const plotB = document.createElement("canvas");

    [plotA, plotB].forEach(c => {
        c.style.width = "300px";
        c.style.height = "300px";
        c.style.border = "1px solid black";
        plotsDiv.appendChild(c);
    });

    // ================= PLOT BOUNDS =================

    const xmin = -3, xmax = 3;
    const ymin = -3, ymax = 3;

    // ================= LOAD DATA =================

    let dataArray = null;

    fetch(`${file}_(${res}, ${res}, 2, ${nPoints}, ${wn}, ${rn}, 2).bin`)
    .then(r => r.arrayBuffer())
    .then(buf => {
        dataArray = new Float32Array(buf);
        
        // Render center plots on startup
        const mid = Math.floor(res / 2);
        renderA(mid, mid, 0);
        renderB(mid, mid, 1);
    });

    function flatIndex(i, j, plotType, p, w, r, xy) {
    return ((((((i * res + j)
        * 2 + plotType)
        * nPoints + p)
        * wn + w)
        * rn + r)
        * 2 + xy);
    }

    // ================= LOAD PARAM IMAGE =================

    const paramCtx = paramCanvas.getContext("2d");
    const img = new Image();
    img.src = `${file}.png`;

    img.onload = function() {
        paramCanvas.width  = 300;
        paramCanvas.height = 300;
        paramCtx.imageSmoothingEnabled = false;
        paramCtx.drawImage(img, 0, 0, paramCanvas.width, paramCanvas.height);
    };

    // ================= REGL SETUP =================

    function createPlot(canvas) {

        const dpr = window.devicePixelRatio || 1;

        canvas.width  = canvas.clientWidth  * dpr;
        canvas.height = canvas.clientHeight * dpr;

        const regl = window.createREGL({
            canvas: canvas,
            attributes: { antialias: true }
        });

        regl._gl.viewport(0, 0, canvas.width, canvas.height);

        const drawLine = regl({
            vert: `
            precision mediump float;
            attribute vec2 position;
            uniform vec4 bounds;
            void main() {
                float x = (position.x - bounds.x) / (bounds.y - bounds.x);
                float y = (position.y - bounds.z) / (bounds.w - bounds.z);
                x = x * 2.0 - 1.0;
                y = y * 2.0 - 1.0;
                gl_Position = vec4(x, y, 0.0, 1.0);
            }
            `,
            frag: `
            precision mediump float;
            uniform vec4 color;
            void main() {
                gl_FragColor = color;
            }
            `,
            attributes: {
            position: regl.prop("positions")
            },
            uniforms: {
            color: regl.prop("color"),
            bounds: regl.prop("bounds")
            },
            count: regl.prop("count"),
            primitive: "line strip"
        });

        function render(i, j, plotType) {

            if (!dataArray) return;

            regl.clear({ color: [1,1,1,1] });

            for (let w = 0; w < wn; w++) {

            let hue = w / wn;
            let color = hsvToRgb(hue, 0.8, 0.8);

            for (let r = 0; r < rn; r++) {

                let positions = new Float32Array(nPoints * 2);

                for (let p = 0; p < nPoints; p++) {

                let x = dataArray[flatIndex(res-j,i,plotType,p,w,r,0)];
                let y = dataArray[flatIndex(res-j,i,plotType,p,w,r,1)];

                positions[2*p]   = x;
                positions[2*p+1] = y;
                }

                drawLine({
                positions: positions,
                color: [...color, 1],
                count: nPoints,
                bounds: [xmin, xmax, ymin, ymax]
                });
            }
            }
        }

        return render;
    }

    function hsvToRgb(h, s, v) {
        let f = (n, k=(n+h*6)%6) =>
            v - v*s*Math.max(Math.min(k,4-k,1),0);
        return [f(5), f(3), f(1)];
    }

    const renderA = createPlot(plotA);
    const renderB = createPlot(plotB);

    // ================= MOUSE =================

    paramCanvas.addEventListener("mousemove", function(e) {

        const rect = paramCanvas.getBoundingClientRect();

        const x = (e.clientX - rect.left) / rect.width  * paramCanvas.width;
        const y = (e.clientY - rect.top)  / rect.height * paramCanvas.height;

        const i = Math.floor(x / (paramCanvas.width / res));
        const j = Math.floor(y / (paramCanvas.height / res));

        if (i >= 0 && i < res && j >= 0 && j < res) {
            renderA(i, j, 0);
            renderB(i, j, 1);

            overlay.textContent =
                `${varStr} = ${((i/res - 0.5) * 10).toFixed(3)} + ${((j/res - 0.5) * 10).toFixed(3)}i`;
        }
    });

}