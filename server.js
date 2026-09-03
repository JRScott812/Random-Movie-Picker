import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const ROOT = __dirname;
const CATALOG_URL = "https://catalog.library.taylor.edu/cgi-bin/koha/opac-search.pl";
const MOVIE_TYPE_SUBJECTS = { fiction: "Feature films", "non-fiction": "Documentary films" };
const responseCache = new Map();

async function fetchTextCached(url, options) {
	const cacheKey = `${url}|${options?.headers?.Authorization || ""}`;
	if (responseCache.has(cacheKey)) return responseCache.get(cacheKey);

	const response = await fetch(url, options);
	if (!response.ok) return "";
	const text = await response.text();
	responseCache.set(cacheKey, text);
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
	return value.replace(/<[^>]*>/g, " ").replace(/&(?:amp|nbsp);/g, " ").replace(/&#39;/g, "'").replace(/&quot;/g, "\"").replace(/\s+/g, " ").trim();
}

function extractFirstMatch(value, expression) {
	const match = value.match(expression);
	return match ? decodeHtml(match[1]) : "";
}

function extractCatalogTitle(page) {
	const titleMatch = page.match(/class="biblio-title"[^>]*>([\s\S]*?)<\/span>\s*(?:<span class="part-number"[^>]*>([\s\S]*?)<\/span>)?\s*(?:<span class="part-name"[^>]*>([\s\S]*?)<\/span>)?/);
	if (titleMatch) return titleMatch.slice(1).filter(Boolean).map(decodeHtml).join(" ").replace(/\s*\/\s*$/, "");

	return extractFirstMatch(page, /<h1 class="title"[^>]*>([\s\S]*?)<\//).replace(/\s*\/\s*$/, "");
}

async function findPoster(title) {
	if (!process.env.TMDB_ACCESS_TOKEN) return "";

	const parameters = new URLSearchParams({ query: title.replace(/\s*\/\s*$/, "") });
	const token = process.env.TMDB_ACCESS_TOKEN;
	const requestUrl = `https://api.themoviedb.org/3/search/movie?${parameters}`;
	const posterCacheKey = `poster:${title}`;
	if (responseCache.has(posterCacheKey)) return responseCache.get(posterCacheKey);

	let response = await fetch(requestUrl, {
		headers: { Authorization: `Bearer ${token}` }
	});
	if (response.status === 401) {
		parameters.set("api_key", token);
		response = await fetch(`https://api.themoviedb.org/3/search/movie?${parameters}`);
	}
	if (!response.ok) return "";

	const movie = (await response.json()).results?.find((result) => result.poster_path);
	const posterUrl = movie ? `https://image.tmdb.org/t/p/w342${movie.poster_path}` : "";
	responseCache.set(posterCacheKey, posterUrl);
	return posterUrl;
}

async function findMovie({ movieType, searchTerm, selectionMode }) {
	const titleSearch = String(searchTerm || "").trim();
	const parameters = new URLSearchParams({
		idx: titleSearch ? "ti" : (MOVIE_TYPE_SUBJECTS[movieType] ? "su" : ""),
		q: titleSearch || MOVIE_TYPE_SUBJECTS[movieType] || "*",
		advsearch: "1", sort_by: "relevance", do: "Search", count: "50"
	});
	["branch:ITU", "available", "ln,rtrn:eng", "l-format:vd"].forEach((limit) => parameters.append("limit", limit));

	const searchUrl = `${CATALOG_URL}?${parameters}`;
	let page = await fetchTextCached(searchUrl);
	let recordUrl = searchUrl;
	const detailUrls = [...page.matchAll(/href="([^\"]*opac-detail\.pl\?biblionumber=\d+)/g)].map((match) => match[1]);
	const detailUrl = detailUrls[Math.floor(Math.random() * detailUrls.length)];
	if (detailUrl) {
		recordUrl = new URL(detailUrl.replace(/&amp;/g, "&"), CATALOG_URL).toString();
		page = await fetchTextCached(recordUrl);
	}

	const title = extractCatalogTitle(page);
	const holdings = [...page.matchAll(/<tr vocab="http:\/\/schema\.org\/"[\s\S]*?<\/tr>/g)];
	const availableHoldings = holdings.filter((row) => /Taylor University Zondervan Library/.test(row[0]));
	const holding = availableHoldings[selectionMode === "classic" ? Math.floor(Math.random() * availableHoldings.length) : 0]?.[0];
	if (!title || !holding) {
		throw new Error("No available Taylor DVD matched that search.");
	}

	const library = extractFirstMatch(holding, /class="location"[\s\S]*?>([\s\S]*?)<\/td>/);
	const shelving = extractFirstMatch(holding, /class="shelvingloc">([\s\S]*?)<\//);
	const callNumber = extractFirstMatch(holding, /class="call_no"[^>]*>([\s\S]*?)\s*\(/);
	const posterUrl = await findPoster(title);
	return { title, location: [library, shelving].filter(Boolean).join(" - "), callNumber, recordUrl, posterUrl };
}

const server = createServer(async (request, response) => {
	if (request.method === "POST" && request.url === "/api/movie") {
		let body = "";
		for await (const chunk of request) body += chunk;
		try {
			const movie = await findMovie(JSON.parse(body));
			response.writeHead(200, { "Content-Type": "application/json" });
			response.end(JSON.stringify(movie));
		} catch (error) {
			response.writeHead(404, { "Content-Type": "application/json" });
			response.end(JSON.stringify({ message: error.message }));
		}
		return;
	}

	const fileName = request.url === "/" ? "index.html" : request.url.slice(1);
	if (!/^[\w.-]+$/.test(fileName)) return response.end("Not found");
	try {
		const content = await readFile(join(ROOT, fileName));
		response.writeHead(200, { "Content-Type": fileName.endsWith(".css") ? "text/css" : fileName.endsWith(".js") ? "text/javascript" : "text/html" });
		response.end(content);
	} catch {
		response.writeHead(404);
		response.end("Not found");
	}
});

loadEnvironmentFile().then(() => {
	server.listen(3000, () => console.log("Movie picker running at http://localhost:3000"));
}).catch((error) => {
	console.error("Unable to load environment settings:", error.message);
	process.exitCode = 1;
});