#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { chromium } = require("playwright");
const { PDFDocument } = require("pdf-lib");

const VIEWPORT = { width: 1280, height: 800 };
const PDF_PAGE = { width: 720, height: 450 }; // 10 x 6.25 inches, 16:10
// A high-resolution JPEG keeps fine equations legible while avoiding the much
// larger lossless-PNG PDF produced by the first version of this exporter.
const JPEG_QUALITY = 90;

function mimeType(filePath) {
	const types = {
		".css": "text/css; charset=utf-8",
		".gif": "image/gif",
		".html": "text/html; charset=utf-8",
		".ico": "image/x-icon",
		".jpeg": "image/jpeg",
		".jpg": "image/jpeg",
		".js": "text/javascript; charset=utf-8",
		".json": "application/json; charset=utf-8",
		".png": "image/png",
		".svg": "image/svg+xml",
		".woff": "font/woff",
		".woff2": "font/woff2",
	};
	return types[path.extname(filePath).toLowerCase()] || "application/octet-stream";
}

function startStaticServer(rootDirectory) {
	const root = path.resolve(rootDirectory);
	const server = http.createServer((request, response) => {
		try {
			const requestUrl = new URL(request.url || "/", "http://127.0.0.1");
			let pathname = decodeURIComponent(requestUrl.pathname);
			if (pathname.endsWith("/")) pathname += "index.html";

			const filePath = path.resolve(root, "." + pathname);
			const relative = path.relative(root, filePath);
			if (relative.startsWith("..") || path.isAbsolute(relative)) {
				response.writeHead(403);
				response.end("Forbidden");
				return;
			}

			if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
				response.writeHead(404);
				response.end("Not found");
				return;
			}

			response.writeHead(200, {
				"Content-Type": mimeType(filePath),
				"Cache-Control": "no-store",
			});
			fs.createReadStream(filePath).pipe(response);
		} catch (error) {
			response.writeHead(500);
			response.end(String(error));
		}
	});

	return new Promise((resolve, reject) => {
		server.once("error", reject);
		server.listen(0, "127.0.0.1", () => {
			const address = server.address();
			resolve({ server, port: address.port });
		});
	});
}

function browserExecutable() {
	const candidates = [
		process.env.CHROME_PATH,
		process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
		process.env.LOCALAPPDATA &&
			path.join(process.env.LOCALAPPDATA, "Google", "Chrome", "Application", "chrome.exe"),
		process.env.PROGRAMFILES &&
			path.join(process.env.PROGRAMFILES, "Google", "Chrome", "Application", "chrome.exe"),
		process.env["PROGRAMFILES(X86)"] &&
			path.join(process.env["PROGRAMFILES(X86)"], "Google", "Chrome", "Application", "chrome.exe"),
		process.env.PROGRAMFILES &&
			path.join(process.env.PROGRAMFILES, "Microsoft", "Edge", "Application", "msedge.exe"),
		"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
		"/usr/bin/google-chrome",
		"/usr/bin/chromium",
		"/usr/bin/chromium-browser",
	].filter(Boolean);

	return candidates.find((candidate) => fs.existsSync(candidate));
}

async function waitForDeck(page) {
	await page.waitForFunction(
		() => window.Reveal && Reveal.isReady && Reveal.isReady(),
		{ timeout: 60_000 },
	);
	await page.evaluate(async () => {
		if (document.fonts && document.fonts.ready) await document.fonts.ready;
		if (window.MathJax && MathJax.startup && MathJax.startup.promise) {
			await MathJax.startup.promise;
		}
	});
	await page.waitForFunction(
		() => Array.from(document.images).every((image) => image.complete),
		{ timeout: 60_000 },
	);
}

async function revealFinalState(page, horizontal, vertical) {
	await page.evaluate(
		({ h, v }) => Reveal.slide(h, v, -1),
		{ h: horizontal, v: vertical },
	);
	await page.waitForTimeout(20);

	const fragmentCount = await page.evaluate(() => {
		return Reveal.getCurrentSlide().querySelectorAll(".fragment").length;
	});
	for (let fragment = 0; fragment < fragmentCount; fragment += 1) {
		await page.evaluate(() => Reveal.nextFragment());
		await page.waitForTimeout(8);
	}

	await page.evaluate(() => {
		if (typeof window.sync === "function") window.sync(Reveal.getCurrentSlide());
		const wash = document.querySelector(".wash-disk");
		if (wash) wash.classList.remove("run");
		if (document.activeElement && typeof document.activeElement.blur === "function") {
			document.activeElement.blur();
		}
		if (Reveal.layout) Reveal.layout();
	});

	// Reduced-motion mode makes CSS and scripted transitions jump to their
	// endpoint. This pause allows the deck's deferred layout/redraw hooks.
	await page.waitForTimeout(220);

	const endpoint = await page.evaluate(() => {
		const slide = Reveal.getCurrentSlide();
		return {
			hiddenFragments: slide.querySelectorAll(".fragment:not(.visible)").length,
			stepTriggers: slide.querySelectorAll(".step-trigger").length,
			visibleStepTriggers: slide.querySelectorAll(".step-trigger.visible").length,
		};
	});
	if (
		endpoint.hiddenFragments ||
		endpoint.stepTriggers !== endpoint.visibleStepTriggers
	) {
		throw new Error(
			"Slide did not reach its final fragment state: " +
			JSON.stringify(endpoint),
		);
	}
}

async function renderSlides(page, temporaryDirectory) {
	const slidePositions = await page.evaluate(() => {
		return Reveal.getSlides().map((slide, index) => {
			const position = Reveal.getIndices(slide);
			return {
				h: position.h,
				v: position.v || 0,
				id: slide.id || "slide-" + String(index + 1).padStart(2, "0"),
			};
		});
	});
	const captures = [];

	await page.evaluate(() => {
		Reveal.configure({ transition: "none", backgroundTransition: "none" });
	});

	for (let order = 0; order < slidePositions.length; order += 1) {
		const position = slidePositions[order];
		await revealFinalState(page, position.h, position.v);
		const slideId = position.id;
		const safeId = slideId.replace(/[^a-zA-Z0-9_-]+/g, "-");
		const imagePath = path.join(
			temporaryDirectory,
			String(order + 1).padStart(2, "0") + "-" + safeId + ".jpg",
		);
		await page.screenshot({
			path: imagePath,
			type: "jpeg",
			quality: JPEG_QUALITY,
			fullPage: false,
			animations: "disabled",
			caret: "hide",
		});
		captures.push({ id: slideId, imagePath });
	}

	return captures;
}

async function assemblePdf(captures, outputPath, deckTitle) {
	const pdf = await PDFDocument.create();
	pdf.setTitle(deckTitle);
	pdf.setAuthor("Benjamin Suzzoni");
	pdf.setCreator("Reveal.js final-state exporter");
	pdf.setProducer("pdf-lib");
	pdf.setSubject("Final animation state of each presentation slide");

	for (const capture of captures) {
		const slideImage = await pdf.embedJpg(fs.readFileSync(capture.imagePath));
		const page = pdf.addPage([PDF_PAGE.width, PDF_PAGE.height]);
		page.drawImage(slideImage, {
			x: 0,
			y: 0,
			width: PDF_PAGE.width,
			height: PDF_PAGE.height,
		});
	}

	fs.mkdirSync(path.dirname(outputPath), { recursive: true });
	fs.writeFileSync(outputPath, await pdf.save({ useObjectStreams: true }));
}

async function main() {
	const deckDirectory = __dirname;
	const repositoryRoot = path.resolve(deckDirectory, "..", "..");
	const deckRelative = path.relative(repositoryRoot, deckDirectory).split(path.sep).join("/");
	const outputPath = path.resolve(
		process.argv[2] || path.join(deckDirectory, path.basename(deckDirectory) + ".pdf"),
	);
	if (path.extname(outputPath).toLowerCase() !== ".pdf") {
		throw new Error("Output must end in .pdf: " + outputPath);
	}

	const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "southampton-pdf-"));
	const runtimeErrors = [];
	const failedResponses = [];
	let server;
	let browser;

	try {
		const staticHost = await startStaticServer(repositoryRoot);
		server = staticHost.server;
		const deckUrl = "http://127.0.0.1:" + staticHost.port + "/" + deckRelative + "/";

		const executablePath = browserExecutable();
		browser = await chromium.launch({
			headless: true,
			...(executablePath ? { executablePath } : {}),
		});
		const context = await browser.newContext({
			viewport: VIEWPORT,
			deviceScaleFactor: 2,
			reducedMotion: "reduce",
			colorScheme: "light",
		});
		const page = await context.newPage();

		page.on("pageerror", (error) => runtimeErrors.push(error.message));
		page.on("response", (response) => {
			if (response.status() >= 400 && !response.url().endsWith("/favicon.ico")) {
				failedResponses.push(response.status() + " " + response.url());
			}
		});

		await page.goto(deckUrl, { waitUntil: "networkidle", timeout: 60_000 });
		await waitForDeck(page);
		const deckTitle = (await page.title()) || path.basename(deckDirectory);
		const captures = await renderSlides(page, temporaryDirectory);

		if (runtimeErrors.length || failedResponses.length) {
			const details = runtimeErrors.concat(failedResponses).join("\n");
			throw new Error("The deck reported browser errors:\n" + details);
		}

		await assemblePdf(captures, outputPath, deckTitle);
		console.log("Created " + outputPath);
		console.log("Pages: " + captures.length);
		console.log("Endpoint slides: " + captures.map((capture) => capture.id).join(", "));
	} finally {
		if (browser) await browser.close();
		if (server) await new Promise((resolve) => server.close(resolve));

		const safeTemporaryRoot = path.resolve(os.tmpdir()) + path.sep;
		const resolvedTemporary = path.resolve(temporaryDirectory);
		if (resolvedTemporary.startsWith(safeTemporaryRoot)) {
			fs.rmSync(resolvedTemporary, { recursive: true, force: true });
		}
	}
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
