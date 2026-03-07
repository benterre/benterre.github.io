function dynamicTomography(containerId, file, res, nPoints, wn, rn, varStr) {

    const container = document.getElementById(containerId);
    if (!container) {
        console.error("Container not found:", containerId);
        return;
    }

    // ================= CREATE LAYOUT =================

    container.innerHTML = "";
    container.style.display = "flex";
    container.style.flexDirection = "colunm";
    container.style.gap = "30px";
    // container.style.alignItems = "flex-start";

    // ---------- TOP ROW (image + plotA) ----------

    const topRow = document.createElement("div");
    topRow.style.display = "flex";
    topRow.style.flexDirection = "row";
    topRow.style.gap = "30px";
    topRow.style.alignItems = "flex-start";

    container.appendChild(topRow);

    // Parameter image
    const paramCanvas = document.createElement("canvas");
    paramCanvas.style.border = "1px solid black";
    paramCanvas.style.cursor = "crosshair";

    // Overlay numerical value
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
    topRow.appendChild(canvasWrapper);

    // Plot A
    const plotA = document.createElement("canvas");
    plotA.style.width = "300px";
    plotA.style.height = "300px";
    plotA.style.border = "1px solid black";
    topRow.appendChild(plotA);

    topRow.style.flexWrap = "wrap";

    // ---------- BOTTOM ROW (plotC + plotB) ----------

    const bottomRow = document.createElement("div");
    bottomRow.style.display = "flex";
    bottomRow.style.flexDirection = "row";
    bottomRow.style.gap = "30px";

    container.appendChild(bottomRow);

    // Plot C
    const plotC = document.createElement("canvas");
    plotC.style.width = "300px";
    plotC.style.height = "300px";
    plotC.style.border = "1px solid black";
    bottomRow.appendChild(plotC);

    // Plot B
    const plotB = document.createElement("canvas");
    plotB.style.width = "300px";
    plotB.style.height = "300px";
    plotB.style.border = "1px solid black";
    bottomRow.appendChild(plotB);

    bottomRow.style.flexWrap = "wrap";

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

    let wnDataArray = null;

    fetch(`${file}_(${res}, ${res}, ${wn}, 2).bin`)
    .then(r => r.arrayBuffer())
    .then(buf => {
        wnDataArray = new Float32Array(buf);

        // Render center plots on startup
        const mid = Math.floor(res / 2);
        renderC(mid, mid);
    });

    function flatIndex(i, j, plotType, p, w, r, xy) {
        return ((((((i * res + j)
            * 2 + plotType)
            * nPoints + p)
            * wn + w)
            * rn + r)
            * 2 + xy);
    }

    function flatIndexWN(i, j, w, xy) {
        return (((i * res + j) * wn + w) * 2 + xy);
    }

    function flatIndexImage(i, j, which, x, y) {
        return (
            ((((j * res + i)
            * 2 + which)
            * amoeba_res + x)
            * amoeba_res + y)
        );
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

                let x = dataArray[flatIndex(i,j,plotType,p,w,r,0)];
                let y = dataArray[flatIndex(i,j,plotType,p,w,r,1)];

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

    function createWNPlot(canvas) {

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

        function render(i, j) {

            if (!wnDataArray) return;

            regl.clear({ color: [1,1,1,1] });

            for (let w = 0; w < wn; w++) {

            let hue = w / wn;
            let color = hsvToRgb(hue, 0.8, 0.8);

            let x = wnDataArray[flatIndexWN(i, j, w, 0)];
            let y = wnDataArray[flatIndexWN(i, j, w, 1)];

            let positions = new Float32Array([
                0, 0,
                x, y
            ]);

            drawLine({
                positions: positions,
                color: [...color, 1],
                count: 2,
                bounds: [-3, 3, -3, 3]   // adjust if needed
            });
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
    const renderC = createWNPlot(plotC);

    // ================= MOUSE =================

    paramCanvas.addEventListener("mousemove", function(e) {

        const rect = paramCanvas.getBoundingClientRect();

        const x = (e.clientX - rect.left) / rect.width  * paramCanvas.width;
        const y = (e.clientY - rect.top)  / rect.height * paramCanvas.height;

        let j = Math.floor(x / (paramCanvas.width / res));
        let i = Math.floor(y / (paramCanvas.height / res));
        i = res - 1 - i;

        if (i >= 0 && i < res && j >= 0 && j < res) {
            renderA(i, j, 0);
            renderB(i, j, 1);
            renderC(i, j);

            overlay.textContent =
                `${varStr} = ${((j/res - 0.5) * 10).toFixed(3)} + ${((i/res - 0.5) * 10).toFixed(3)}i`;
        }
    });

}

function dynamicAmoeba(containerId, file, res, amoeba_res, varStr) {

    const container = document.getElementById(containerId);
    if (!container) {
        console.error("Container not found:", containerId);
        return;
    }

    // ================= CREATE LAYOUT =================

    container.innerHTML = "";
    container.style.display = "flex";
    container.style.flexDirection = "colunm";
    container.style.gap = "30px";
    // container.style.alignItems = "flex-start";

    // Parameter image
    const paramCanvas = document.createElement("canvas");
    paramCanvas.style.border = "1px solid black";
    paramCanvas.style.cursor = "crosshair";

    // Overlay numerical value
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

    const imagePlotA = document.createElement("canvas");
    const imagePlotB = document.createElement("canvas");

    [imagePlotA, imagePlotB].forEach(c => {
        c.style.width = "300px";
        c.style.height = "300px";
        c.style.border = "1px solid black";
        container.appendChild(c);
    });

    // ================= LOAD DATA =================

    let imageDataArray = null;

    fetch(`${file}_(${res}, ${res}, 2, ${amoeba_res}, ${amoeba_res}).bin`)
    .then(r => r.arrayBuffer())
    .then(buf => {
        imageDataArray = new Uint8Array(buf);
        
        // Render center plots on startup
        const mid = Math.floor(res / 2);
        renderImgA(mid, mid);
        renderImgB(mid, mid);
    });

    function flatIndex(i, j, plotType, p, w, r, xy) {
        return ((((((i * res + j)
            * 2 + plotType)
            * nPoints + p)
            * wn + w)
            * rn + r)
            * 2 + xy);
    }

    function flatIndexWN(i, j, w, xy) {
        return (((i * res + j) * wn + w) * 2 + xy);
    }

    function flatIndexImage(i, j, which, x, y) {
        return (
            ((((j * res + i)
            * 2 + which)
            * amoeba_res + x)
            * amoeba_res + y)
        );
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

    function createImageRenderer(canvas, which) {

        const ctx = canvas.getContext("2d");

        canvas.width = amoeba_res;
        canvas.height = amoeba_res;

        function render(i, j) {

            if (!imageDataArray) return;

            const img = ctx.createImageData(amoeba_res, amoeba_res);
            const data = img.data;  // RGBA array

            for (let x = 0; x < amoeba_res; x++) {
                for (let y = 0; y < amoeba_res; y++) {

                    const value = imageDataArray[
                        flatIndexImage(i, j, which, x, y)
                    ];

                    const idx = 4 * (y * amoeba_res + x);

                    const color = value ? 0 : 255;  // black/white

                    data[idx]     = color;
                    data[idx + 1] = color;
                    data[idx + 2] = color;
                    data[idx + 3] = 255;  // alpha
                }
            }

            ctx.putImageData(img, 0, 0);
        }

        return render;
    }

    const renderImgA = createImageRenderer(imagePlotA, 0);
    const renderImgB = createImageRenderer(imagePlotB, 1);

    // ================= MOUSE =================

    paramCanvas.addEventListener("mousemove", function(e) {

        const rect = paramCanvas.getBoundingClientRect();

        const x = (e.clientX - rect.left) / rect.width  * paramCanvas.width;
        const y = (e.clientY - rect.top)  / rect.height * paramCanvas.height;

        let j = Math.floor(x / (paramCanvas.width / res));
        let i = Math.floor(y / (paramCanvas.height / res));
        i = res - 1 - i;

        if (i >= 0 && i < res && j >= 0 && j < res) {
            renderImgA(j, i);
            renderImgB(j, i);

            overlay.textContent =
                `${varStr} = ${((j/res - 0.5) * 10).toFixed(3)} + ${((i/res - 0.5) * 10).toFixed(3)}i`;
        }
    });

}

function dynamicTomographyAmoeba(containerId, file, res, amoeba_res, nPoints, wn, rn, varStr) {

    const container = document.getElementById(containerId);
    if (!container) {
        console.error("Container not found:", containerId);
        return;
    }

    // ================= CREATE LAYOUT =================

    container.innerHTML = "";
    container.style.display = "flex";
    container.style.flexDirection = "row";
    container.style.gap = "30px";
    // container.style.alignItems = "flex-start";

    // Parameter image
    const paramCanvas = document.createElement("canvas");
    paramCanvas.style.border = "1px solid black";
    paramCanvas.style.cursor = "crosshair";

    // Overlay numerical value
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

    
    const blockRight = document.createElement("div");
    blockRight.style.display = "grid";
    blockRight.style.gridTemplateColumns = "repeat(2, auto)";
    blockRight.style.gap = "10px";
    blockRight.style.alignItems = "flex-start";

    container.appendChild(blockRight);

    const tomox = document.createElement("canvas");
    const tomoy = document.createElement("canvas");
    const am = document.createElement("canvas");
    const coam = document.createElement("canvas");

    [tomox, tomoy, am, coam].forEach(c => {
        c.style.width = "200px";
        c.style.height = "200px";
        c.style.border = "1px solid black";
        blockRight.appendChild(c);
    });

    // ================= PLOT BOUNDS =================

    const xmin = -3, xmax = 3;
    const ymin = -3, ymax = 3;

    // ================= LOAD DATA =================

    let imageDataArray = null;

    fetch(`${file}_(${res}, ${res}, 2, ${amoeba_res}, ${amoeba_res}).bin`)
    .then(r => r.arrayBuffer())
    .then(buf => {
        imageDataArray = new Uint8Array(buf);
        
        // Render center plots on startup
        const mid = Math.floor(res / 2);
        renderAmoeba(mid, mid);
        renderCoamoeba(mid, mid);
    });

    let dataArray = null;

    fetch(`${file}_(${res}, ${res}, 2, ${nPoints}, ${wn}, ${rn}, 2).bin`)
    .then(r => r.arrayBuffer())
    .then(buf => {
        dataArray = new Float32Array(buf);
        
        // Render center plots on startup
        const mid = Math.floor(res / 2);
        renderTomoX(mid, mid, 0);
        renderTomoY(mid, mid, 1);
    });

    function flatIndex(i, j, plotType, p, w, r, xy) {
        return ((((((i * res + j)
            * 2 + plotType)
            * nPoints + p)
            * wn + w)
            * rn + r)
            * 2 + xy);
    }

    function flatIndexImage(i, j, which, x, y) {
        return (
            ((((j * res + i)
            * 2 + which)
            * amoeba_res + x)
            * amoeba_res + y)
        );
    }

    // ================= LOAD PARAM IMAGE =================

    const paramCtx = paramCanvas.getContext("2d");
    const img = new Image();
    img.src = `${file}.png`;

    img.onload = function() {
        paramCanvas.width  = 415;
        paramCanvas.height = 415;
        paramCtx.imageSmoothingEnabled = false;
        paramCtx.drawImage(img, 0, 0, paramCanvas.width, paramCanvas.height);
    };

    // ================= REGL SETUP =================

    // ================= REGL SETUP =================

    function createPlot(canvas) {

        const dpr = window.devicePixelRatio || 1;

        canvas.width  = canvas.offsetWidth  * dpr;
        canvas.height = canvas.offsetHeight * dpr;

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

                let x = dataArray[flatIndex(i,j,plotType,p,w,r,0)];
                let y = dataArray[flatIndex(i,j,plotType,p,w,r,1)];

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

    function createImageRenderer(canvas, which) {

        const ctx = canvas.getContext("2d");

        canvas.width = amoeba_res;
        canvas.height = amoeba_res;

        function render(i, j) {

            if (!imageDataArray) return;

            const img = ctx.createImageData(amoeba_res, amoeba_res);
            const data = img.data;  // RGBA array

            for (let x = 0; x < amoeba_res; x++) {
                for (let y = 0; y < amoeba_res; y++) {

                    const value = imageDataArray[
                        flatIndexImage(i, j, which, x, y)
                    ];

                    const idx = 4 * (y * amoeba_res + x);

                    const color = value ? 0 : 255;  // black/white

                    data[idx]     = color;
                    data[idx + 1] = color;
                    data[idx + 2] = color;
                    data[idx + 3] = 255;  // alpha
                }
            }

            ctx.putImageData(img, 0, 0);
        }

        return render;
    }

    const renderTomoX = createPlot(tomox, 0);
    const renderTomoY = createPlot(tomoy, 1);
    const renderAmoeba = createImageRenderer(am, 0);
    const renderCoamoeba = createImageRenderer(coam, 1);

    // ================= MOUSE =================

    paramCanvas.addEventListener("mousemove", function(e) {

        const rect = paramCanvas.getBoundingClientRect();

        const x = (e.clientX - rect.left) / rect.width  * paramCanvas.width;
        const y = (e.clientY - rect.top)  / rect.height * paramCanvas.height;

        let j = Math.floor(x / (paramCanvas.width / res));
        let i = Math.floor(y / (paramCanvas.height / res));
        i = res - 1 - i;

        if (i >= 0 && i < res && j >= 0 && j < res) {
            renderTomoX(i, j, 0);
            renderTomoY(i, j, 1);
            renderAmoeba(j, i);
            renderCoamoeba(j, i);

            overlay.textContent =
                `${varStr} = ${((j/res - 0.5) * 10).toFixed(3)} + ${((i/res - 0.5) * 10).toFixed(3)}i`;
        }
    });

}