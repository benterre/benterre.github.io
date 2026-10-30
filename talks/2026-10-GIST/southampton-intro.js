/* Reused Southampton UAT animation. Width labels use L in this WZW talk. */
(function(){'use strict';
var largeNStage = (function () {
			var canvas = document.getElementById("uatCanvas");
			var nLabel = document.getElementById("uatNLabel");
			var errorLabel = document.getElementById("uatErrorLabel");
			if (!canvas) return { show: function () {}, stop: function () {}, redraw: function () {} };
			var context = canvas.getContext("2d");
			if (!context) return { show: function () {}, stop: function () {}, redraw: function () {} };
			var states = [
				{ n: 1, proxy: 1, infinite: 0, nodes: 1, terms: 1, quality: "coarse approximation" },
				{ n: 5, proxy: 5, infinite: 0, nodes: 5, terms: 3, quality: "main features appear" },
				{ n: 20, proxy: 20, infinite: 0, nodes: 11, terms: 7, quality: "finer structure resolved" },
				{ n: 100, proxy: 100, infinite: 0, nodes: 18, terms: 18, quality: "small residual error" },
				{ n: Infinity, proxy: 300, infinite: 1, nodes: 25, terms: 48, quality: "residual below visual scale" }
			];
			var frame = null;
			var targetIndex = 0;

			function vector(state) {
				return {
					n: state.proxy != null ? state.proxy : state.n,
					infinite: state.infinite,
					nodes: state.nodes,
					terms: state.terms
				};
			}

			function blend(a, b, u) {
				return {
					n: a.n + (b.n - a.n) * u,
					infinite: a.infinite + (b.infinite - a.infinite) * u,
					nodes: a.nodes + (b.nodes - a.nodes) * u,
					terms: a.terms + (b.terms - a.terms) * u
				};
			}

			var renderState = vector(states[0]);

			function basisTerm(j, x) {
				var amplitude = 0.68 / Math.pow(j + 1, 1.38);
				return amplitude * Math.sin((j + 1) * x + 0.41 * j);
			}

			/* A high-resolution reference to an absolutely convergent infinite
			   series. Finite-width states use genuine partial sums and retain a
			   non-zero residual all the way through the displayed endpoint. */
			function targetFunction(x) {
				var sum = 0;
				for (var j = 0; j < 160; j++) sum += basisTerm(j, x);
				return sum;
			}

			function partialFunction(x, terms) {
				var whole = Math.floor(terms);
				var fraction = terms - whole;
				var sum = 0;
				for (var j = 0; j < whole; j++) sum += basisTerm(j, x);
				if (whole < 160 && fraction > 0) sum += fraction * basisTerm(whole, x);
				return sum;
			}

			function roundedRect(ctx, x, y, w, h, radius) {
				var r = Math.min(radius, w / 2, h / 2);
				ctx.beginPath();
				ctx.moveTo(x + r, y);
				ctx.arcTo(x + w, y, x + w, y + h, r);
				ctx.arcTo(x + w, y + h, x, y + h, r);
				ctx.arcTo(x, y + h, x, y, r);
				ctx.arcTo(x, y, x + w, y, r);
				ctx.closePath();
			}

			function measure() {
				var rect = canvas.getBoundingClientRect();
				var ratio = Math.min(window.devicePixelRatio || 1, 2);
				var width = Math.max(300, rect.width);
				var height = Math.max(180, rect.height);
				if (canvas.width !== Math.round(width * ratio) ||
					canvas.height !== Math.round(height * ratio)) {
					canvas.width = Math.round(width * ratio);
					canvas.height = Math.round(height * ratio);
				}
				context.setTransform(ratio, 0, 0, ratio, 0, 0);
				return { width: width, height: height };
			}

			function drawNode(x, y, radius, stroke, fill) {
				context.beginPath();
				context.arc(x, y, radius, 0, Math.PI * 2);
				context.fillStyle = fill;
				context.fill();
				context.strokeStyle = stroke;
				context.lineWidth = 2;
				context.stroke();
			}

			function stateLabel(state) {
				if (state.infinite > 0.88) return "L → ∞";
				var rounded = Math.round(state.n);
				return Math.abs(state.n - rounded) < 0.08 ? "L = " + rounded : "L ≈ " + rounded;
			}

			function draw(state) {
				var size = measure();
				var width = size.width;
				var height = size.height;
				context.clearRect(0, 0, width, height);

				var nodes = Math.max(1, Math.round(state.nodes));
				var terms = state.terms;
				var leftW = width * 0.43;
				var inputX = 48;
				var hiddenX = leftW * 0.53;
				var outputX = leftW - 42;
				var centerY = height * 0.53;
				var top = 36;
				var bottom = height - 34;

				context.font = "600 14px Inter, sans-serif";
				context.fillStyle = "#64748b";
				context.textAlign = "center";
				context.fillText("network width", leftW * 0.5, 19);

				var yPositions = [];
				for (var i = 0; i < nodes; i++) {
					yPositions.push(nodes === 1 ? centerY : top + (bottom - top) * i / (nodes - 1));
				}
				context.strokeStyle = "rgba(99,102,241,0.22)";
				context.lineWidth = 1.25;
				yPositions.forEach(function (y) {
					context.beginPath();
					context.moveTo(inputX + 14, centerY);
					context.lineTo(hiddenX - 8, y);
					context.lineTo(outputX - 15, centerY);
					context.stroke();
				});
				drawNode(inputX, centerY, 13, "#6366f1", "#ffffff");
				yPositions.forEach(function (y, i) {
					var hue = i % 2 ? "#eef2ff" : "#f0fdfa";
					drawNode(hiddenX, y, nodes > 18 ? 4.2 : 6.2, "#6366f1", hue);
				});
				drawNode(outputX, centerY, 14, "#14b8a6", "#ffffff");
				context.font = "500 13px Inter, sans-serif";
				context.fillStyle = "#0f172a";
				context.fillText("x", inputX, centerY + 4);
				context.fillText("Φ", outputX, centerY + 4);
				context.fillStyle = "#64748b";
				context.fillText(stateLabel(state), hiddenX, height - 8);

				var plotX = leftW + 38;
				var plotY = 31;
				var plotW = width - plotX - 25;
				var plotH = height - 58;
				roundedRect(context, plotX, plotY, plotW, plotH, 12);
				context.fillStyle = "rgba(255,255,255,0.88)";
				context.fill();
				context.strokeStyle = "#e2e8f0";
				context.lineWidth = 1;
				context.stroke();

				context.save();
				roundedRect(context, plotX, plotY, plotW, plotH, 12);
				context.clip();
				for (var grid = 1; grid < 4; grid++) {
					var gy = plotY + plotH * grid / 4;
					context.beginPath();
					context.moveTo(plotX, gy);
					context.lineTo(plotX + plotW, gy);
					context.strokeStyle = "#eef2f7";
					context.lineWidth = 1;
					context.stroke();
				}

				function curve(fn, colour, dash, lineWidth) {
					context.beginPath();
					for (var p = 0; p <= 180; p++) {
						var t = p / 180;
						var x = t * Math.PI * 2;
						var value = fn(x);
						var px = plotX + t * plotW;
						var py = plotY + plotH * (0.5 - value / 3.3);
						if (p === 0) context.moveTo(px, py);
						else context.lineTo(px, py);
					}
					context.strokeStyle = colour;
					context.lineWidth = lineWidth;
					context.setLineDash(dash);
					context.stroke();
					context.setLineDash([]);
				}
				curve(targetFunction, "#94a3b8", [7, 6], 2);
				curve(function (x) { return partialFunction(x, terms); }, "#f59e0b", [], 3);
				context.restore();

				context.font = "500 12px Inter, sans-serif";
				context.textAlign = "left";
				context.fillStyle = "#64748b";
				context.fillText("target", plotX + 13, plotY + 18);
				context.fillStyle = "#b45309";
				context.fillText("network", plotX + 65, plotY + 18);
			}

			function updateLabels(state, settledIndex) {
				nLabel.textContent = stateLabel(state);
				errorLabel.textContent = settledIndex == null ?
					"refining approximation…" : states[settledIndex].quality;
			}

			function show(index) {
				index = Math.max(0, Math.min(states.length - 1, index));
				if (frame) cancelAnimationFrame(frame);
				frame = null;
				var startState = vector(renderState);
				var endState = vector(states[index]);
				targetIndex = index;
				var distance = Math.abs(startState.n - endState.n) +
					Math.abs(startState.nodes - endState.nodes) +
					Math.abs(startState.terms - endState.terms) +
					Math.abs(startState.infinite - endState.infinite);
				if (distance < 0.001 || (window.matchMedia &&
					window.matchMedia("(prefers-reduced-motion: reduce)").matches)) {
					renderState = endState;
					draw(renderState);
					updateLabels(renderState, index);
					return;
				}
				var start = performance.now();
				var duration = 720;
				function tick(now) {
					var u = Math.min(1, (now - start) / duration);
					var eased = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
					renderState = blend(startState, endState, eased);
					draw(renderState);
					updateLabels(renderState, u < 1 ? null : index);
					if (u < 1) frame = requestAnimationFrame(tick);
					else {
						frame = null;
						renderState = endState;
					}
				}
				frame = requestAnimationFrame(tick);
			}

			function stop() {
				if (frame) cancelAnimationFrame(frame);
				frame = null;
			}

			function redraw() {
				if (frame) cancelAnimationFrame(frame);
				frame = null;
				renderState = vector(states[targetIndex]);
				draw(renderState);
				updateLabels(renderState, targetIndex);
			}

			return { show: show, stop: stop, redraw: redraw };
		})();
window.SouthamptonIntro={sync:function(slide,step){if(slide&&slide.id==='large-n-slide')largeNStage.show(step);else largeNStage.stop();},redraw:function(){largeNStage.redraw();}};})();
