import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)));
const DEFAULT_CATALOG_URL = "https://catalog.library.taylor.edu/cgi-bin/koha/opac-search.pl";
const DEFAULT_SHELF_ITEMNUMBER = "2274508";
const MOVIE_TYPE_SUBJECTS = { fiction: "Feature films", "non-fiction": "Documentary films" };
const DEFAULT_ALLOWED_ORIGIN = "https://jrscott812.github.io";
const responseCache = new Map();
const MAX_BODY_SIZE = 10 * 1024;
const MAX_CACHE_ENTRIES = 100;
const STATIC_FILES = new Map([
	["index.html", "text/html; charset=utf-8"],
	["picker.js", "text/javascript; charset=utf-8"],
	["styles.css", "text/css; charset=utf-8"]
]);

function environmentValue(name, fallback) {
	return process.env[name]?.trim() || fallback;
}

function cacheResponse(key, value) {
	if (responseCache.size >= MAX_CACHE_ENTRIES) responseCache.delete(responseCache.keys().next().value);
	responseCache.set(key, value);
}

async function fetchTextCached(url, options) {
	const cacheKey = `${url}|${options?.headers?.Authorization || ""}`;
	if (responseCache.has(cacheKey)) return responseCache.get(cacheKey);

	const response = await fetch(url, { ...options, signal: AbortSignal.timeout(10000) });
	if (!response.ok) return "";
	const text = await response.text();
	cacheResponse(cacheKey, text);
	return text;
}

async function loadEnvironmentFile() {
	try {
		const environmentFile = await readFile(join(ROOT, ".env"), "utf8");
		for (const line of environmentFile.split(/\r?\n/)) {
			const match = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*["']?([^"'#\r\n]*)/);
			if (match && !process.env[match[1]]) {
				process.env[match[1]] = match[2].trim();
			}
		}
	} catch (error) {
		if (error.code !== "ENOENT") throw error;
	}
}

function decodeHtml(value) {
	return value.replace(/<[^>]*>/g, " ").replace(/&(?:amp|nbsp);/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;/g, "'").replace(/&quot;/g, "\"").replace(/\s+/g, " ").trim();
}

function extractFirstMatch(value, expression) {
	const match = value.match(expression);
	return match ? decodeHtml(match[1]) : "";
}

function extractCatalogTitle(page) {
	const titleMatch = page.match(/class="biblio-title"[^>]*>([\s\S]*?)<\/span>\s*(?:<span class="part-number"[^>]*>([\s\S]*?)<\/span>)?\s*(?:<span class="part-name"[^>]*>([\s\S]*?)<\/span>)?\s*(?:<span class="subtitle"[^>]*>([\s\S]*?)<\/span>)?/);
	if (titleMatch) return titleMatch.slice(1).filter(Boolean).map(decodeHtml).join(" ").replace(/\s*\/\s*$/, "");

	return extractFirstMatch(page, /<h1 class="title"[^>]*>([\s\S]*?)<\//).replace(/\s*\/\s*$/, "");
}

function extractTitleNote(page) {
	return extractFirstMatch(page, /class="marcnote marcnote-520"[^>]*>([\s\S]*?)<\/p>/);
}

function extractContributorByRole(page, role) {
	const contributor = [...page.matchAll(/<li>([\s\S]*?<\/li>)/g)]
		.map((match) => match[1])
		.find((block) => block.includes(`[${role}]`));
	const name = contributor ? extractFirstMatch(contributor, /property="name">([\s\S]*?)(?:<span class="authordates"|<\/span>)/) : "";
	return name.replace(/^([^,]+),\s*(.+)$/, "$2 $1");
}

function normalizeShelfTitle(title) {
	return title.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function extractShelfItems(page) {
	const catalogUrl = environmentValue("CATALOG_URL", DEFAULT_CATALOG_URL);
	const items = [...page.matchAll(/href="([^\"]*shelfbrowse_itemnumber=\d+[^\"]*)"[^>]*>\s*<span class="biblio-title"[^>]*>([\s\S]*?)<\/span>/g)]
		.map((match) => ({
			recordUrl: new URL(match[1].replace(/&amp;/g, "&"), catalogUrl).toString(),
			title: decodeHtml(match[2]).replace(/\s*\/\s*$/, ""),
			biblionumber: new URL(match[1].replace(/&amp;/g, "&"), catalogUrl).searchParams.get("biblionumber")
		}))
		.filter((item) => item.title && item.title !== "<>");

	const groupedItems = new Map();
	items.forEach((item) => {
		const titleKey = normalizeShelfTitle(item.title);
		const existingItem = groupedItems.get(titleKey);
		if (existingItem) {
			existingItem.copyCount += 1;
		} else {
			groupedItems.set(titleKey, { ...item, copyCount: 1 });
		}
	});

	return [...groupedItems.values()];
}

function extractShelfNavigation(page) {
	return {
		previousItemnumber: page.match(/id="browser_previous"[\s\S]*?data-prev-itemnumber="(\d+)"/)?.[1] || "",
		nextItemnumber: page.match(/id="browser_next"[\s\S]*?data-next-itemnumber="(\d+)"/)?.[1] || ""
	};
}

async function loadShelf(itemnumber) {
	const catalogUrl = environmentValue("CATALOG_URL", DEFAULT_CATALOG_URL);
	const shelfUrl = `${catalogUrl.replace("opac-search.pl", "svc/shelfbrowser.pl")}?shelfbrowse_itemnumber=${itemnumber}`;
	const shelfPage = await fetchTextCached(shelfUrl);
	const shelfItems = extractShelfItems(shelfPage).slice(0, 7);
	const items = await Promise.all(shelfItems.map(async (item) => ({ ...item, posterUrl: await findPoster(item.title) })));
	return { items, ...extractShelfNavigation(shelfPage) };
}

async function findPoster(title) {
	if (!process.env.TMDB_ACCESS_TOKEN) return "";

	const parameters = new URLSearchParams({ query: title.replace(/\s*\/\s*$/, "") });
	const token = process.env.TMDB_ACCESS_TOKEN;
	const requestUrl = `https://api.themoviedb.org/3/search/movie?${parameters}`;
	const posterCacheKey = `poster:${title}`;
	if (responseCache.has(posterCacheKey)) return responseCache.get(posterCacheKey);

	try {
		let response = await fetch(requestUrl, {
			headers: { Authorization: `Bearer ${token}` },
			signal: AbortSignal.timeout(10000)
		});
		if (response.status === 401) {
			parameters.set("api_key", token);
			response = await fetch(`https://api.themoviedb.org/3/search/movie?${parameters}`, { signal: AbortSignal.timeout(10000) });
		}
		if (!response.ok) return "";

		const movie = (await response.json()).results?.find((result) => result.poster_path);
		const posterUrl = movie ? `https://image.tmdb.org/t/p/w342${movie.poster_path}` : "";
		cacheResponse(posterCacheKey, posterUrl);
		return posterUrl;
	} catch {
		return "";
	}
}

async function findMovie({ movieType, searchTerm, selectionMode }) {
	const catalogUrl = environmentValue("CATALOG_URL", DEFAULT_CATALOG_URL);
	const titleSearch = String(searchTerm || "").trim();
	const parameters = new URLSearchParams({
		idx: titleSearch ? "ti" : (MOVIE_TYPE_SUBJECTS[movieType] ? "su" : ""),
		q: titleSearch || MOVIE_TYPE_SUBJECTS[movieType] || "*",
		advsearch: "1", sort_by: "relevance", do: "Search", count: "50"
	});
	["branch:ITU", "available", "ln,rtrn:eng", "l-format:vd"].forEach((limit) => parameters.append("limit", limit));

	const searchUrl = `${catalogUrl}?${parameters}`;
	let page = await fetchTextCached(searchUrl);
	let recordUrl = searchUrl;
	const detailUrls = [...page.matchAll(/href="([^\"]*opac-detail\.pl\?biblionumber=\d+)/g)].map((match) => match[1]);
	const detailUrl = detailUrls[selectionMode === "random" ? Math.floor(Math.random() * detailUrls.length) : 0];
	if (detailUrl) {
		recordUrl = new URL(detailUrl.replace(/&amp;/g, "&"), catalogUrl).toString();
		page = await fetchTextCached(recordUrl);
	}
	return buildMovieFromRecord(page, recordUrl, selectionMode);
}

async function findMovieByBiblionumber(biblionumber) {
	const catalogUrl = environmentValue("CATALOG_URL", DEFAULT_CATALOG_URL);
	const recordUrl = new URL("opac-detail.pl", catalogUrl);
	recordUrl.searchParams.set("biblionumber", biblionumber);
	const page = await fetchTextCached(recordUrl.toString());
	return buildMovieFromRecord(page, recordUrl.toString(), "shelf");
}

async function buildMovieFromRecord(page, recordUrl, selectionMode) {
	const title = extractCatalogTitle(page);
	const titleNote = extractTitleNote(page);
	const director = extractContributorByRole(page, "film director.");
	const actors = extractFirstMatch(page, /class="marcnote marcnote-511"[^>]*>([\s\S]*?)<\/p>/);
	const holdings = [...page.matchAll(/<tr vocab="http:\/\/schema\.org\/"[\s\S]*?<\/tr>/g)];
	const availableHoldings = holdings.filter((row) => /Taylor University Zondervan Library/.test(row[0]));
	const holding = availableHoldings[selectionMode === "random" ? Math.floor(Math.random() * availableHoldings.length) : 0]?.[0];
	if (!title || !holding) {
		throw new Error("No available Taylor DVD matched that search.");
	}

	const library = extractFirstMatch(holding, /class="location"[\s\S]*?>([\s\S]*?)<\/td>/);
	const shelving = extractFirstMatch(holding, /class="shelvingloc">([\s\S]*?)<\//);
	const callNumber = extractFirstMatch(holding, /class="call_no"[^>]*>([\s\S]*?)\s*\(/);
	const posterUrl = await findPoster(title);
	const shelfItemnumber = holding.match(/shelfbrowse_itemnumber=(\d+)/)?.[1];
	const shelf = shelfItemnumber ? await loadShelf(shelfItemnumber) : { items: [], previousItemnumber: "", nextItemnumber: "" };
	return { title, titleNote, director, actors, location: [library, shelving].filter(Boolean).join(" - "), callNumber, recordUrl, posterUrl, shelf };
}

const server = createServer(async (request, response) => {
	const allowedOrigin = environmentValue("ALLOWED_ORIGIN", DEFAULT_ALLOWED_ORIGIN);
	const allowGithubPages = request.headers.origin === allowedOrigin;
	const headers = {
		"Cache-Control": "no-store",
		"X-Content-Type-Options": "nosniff",
		"Referrer-Policy": "no-referrer",
		"Content-Security-Policy": "default-src 'self'; img-src 'self' https://image.tmdb.org; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; connect-src 'self'",
		...(allowGithubPages ? { "Access-Control-Allow-Origin": allowedOrigin, Vary: "Origin" } : {})
	};
	const requestUrl = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
	if (request.method === "OPTIONS" && requestUrl.pathname.startsWith("/api/")) {
		response.writeHead(204, {
			...headers,
			"Access-Control-Allow-Methods": "GET, POST, OPTIONS",
			"Access-Control-Allow-Headers": "Content-Type"
		});
		return response.end();
	}

	if (request.method === "POST" && requestUrl.pathname === "/api/movie") {
		if (!request.headers["content-type"]?.startsWith("application/json")) {
			response.writeHead(415, { ...headers, "Content-Type": "application/json; charset=utf-8" });
			response.end(JSON.stringify({ message: "Requests must use JSON." }));
			return;
		}
		if (Number(request.headers["content-length"]) > MAX_BODY_SIZE) {
			response.writeHead(413, { ...headers, "Content-Type": "application/json; charset=utf-8" });
			response.end(JSON.stringify({ message: "Request body is too large." }));
			return;
		}
		let body = "";
		for await (const chunk of request) {
			body += chunk;
			if (body.length > MAX_BODY_SIZE) {
				response.writeHead(413, { ...headers, "Content-Type": "application/json" });
				response.end(JSON.stringify({ message: "Request body is too large." }));
				return;
			}
		}
		try {
			const input = JSON.parse(body);
			if (input?.biblionumber !== undefined) {
				if (!/^\d+$/.test(String(input.biblionumber))) {
					const error = new Error("Choose a valid library record.");
					error.status = 400;
					throw error;
				}
				const movie = await findMovieByBiblionumber(String(input.biblionumber));
				response.writeHead(200, { ...headers, "Content-Type": "application/json; charset=utf-8" });
				response.end(JSON.stringify(movie));
				return;
			}
			if (!input || typeof input !== "object" || !["all", "fiction", "non-fiction"].includes(input.movieType)) {
				const error = new Error("Choose a valid movie type.");
				error.status = 400;
				throw error;
			}
			if (input.searchTerm !== undefined && String(input.searchTerm).length > 200) {
				const error = new Error("Search terms must be 200 characters or fewer.");
				error.status = 400;
				throw error;
			}
			if (input.selectionMode !== undefined && !["random", "shelf", "classic"].includes(input.selectionMode)) {
				const error = new Error("Choose a valid selection mode.");
				error.status = 400;
				throw error;
			}
			const movie = await findMovie(input);
			response.writeHead(200, { ...headers, "Content-Type": "application/json; charset=utf-8" });
			response.end(JSON.stringify(movie));
		} catch (error) {
			response.writeHead(error instanceof SyntaxError || error.status ? error.status || 400 : 404, { ...headers, "Content-Type": "application/json; charset=utf-8" });
			response.end(JSON.stringify({ message: error.message }));
		}
		return;
	}

	if (request.method === "GET" && ["/api/shelf", "/api/shelf/start"].includes(requestUrl.pathname)) {
		const itemnumber = requestUrl.pathname === "/api/shelf/start"
			? environmentValue("DEFAULT_SHELF_ITEMNUMBER", DEFAULT_SHELF_ITEMNUMBER)
			: requestUrl.searchParams.get("itemnumber");
		if (!/^\d+$/.test(itemnumber || "")) {
			response.writeHead(400, { ...headers, "Content-Type": "application/json; charset=utf-8" });
			return response.end(JSON.stringify({ message: "A valid shelf item is required." }));
		}
		try {
			response.writeHead(200, { ...headers, "Content-Type": "application/json; charset=utf-8" });
			response.end(JSON.stringify(await loadShelf(itemnumber)));
		} catch {
			response.writeHead(502, { ...headers, "Content-Type": "application/json; charset=utf-8" });
			response.end(JSON.stringify({ message: "The shelf could not be loaded." }));
		}
		return;
	}

	const fileName = requestUrl.pathname === "/" ? "index.html" : requestUrl.pathname.slice(1);
	const contentType = STATIC_FILES.get(fileName);
	if (!contentType) {
		response.writeHead(404, headers);
		return response.end("Not found");
	}
	try {
		const content = await readFile(join(ROOT, fileName));
		response.writeHead(200, { ...headers, "Content-Type": contentType });
		response.end(content);
	} catch {
		response.writeHead(404, headers);
		response.end("Not found");
	}
});

loadEnvironmentFile().then(() => {
	const port = Number(process.env.PORT) || 3000;
	server.listen(port, () => console.log(`Movie picker running at http://localhost:${port}`));
}).catch((error) => {
	console.error("Unable to load environment settings:", error.message);
	process.exitCode = 1;
});