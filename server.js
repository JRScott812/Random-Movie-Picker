const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");

const ROOT = __dirname;
const CATALOG_URL = "https://catalog.library.taylor.edu/cgi-bin/koha/opac-search.pl";
const MOVIE_TYPE_SUBJECTS = { fiction: "Feature films", "non-fiction": "Documentary films" };

async function loadEnvironmentFile() {
	try {
		const environmentFile = await fs.readFile(path.join(ROOT, ".env"), "utf8");
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

async function findPoster(title) {
	if (!process.env.TMDB_ACCESS_TOKEN) return "";

	const parameters = new URLSearchParams({ query: title.replace(/\s*\/\s*$/, "") });
	const response = await fetch(`https://api.themoviedb.org/3/search/movie?${parameters}`, {
		headers: { Authorization: `Bearer ${process.env.TMDB_ACCESS_TOKEN}` }
	});
	if (!response.ok) return "";

	const movie = (await response.json()).results?.find((result) => result.poster_path);
	return movie ? `https://image.tmdb.org/t/p/w342${movie.poster_path}` : "";
}

async function findMovie({ movieType, searchTerm }) {
	const titleSearch = String(searchTerm || "").trim();
	const parameters = new URLSearchParams({
		idx: titleSearch ? "ti" : (MOVIE_TYPE_SUBJECTS[movieType] ? "su" : ""),
		q: titleSearch || MOVIE_TYPE_SUBJECTS[movieType] || "*",
		advsearch: "1", sort_by: "relevance", do: "Search"
	});
	["branch:ITU", "available", "ln,rtrn:eng", "l-format:vd"].forEach((limit) => parameters.append("limit", limit));

	const searchResponse = await fetch(`${CATALOG_URL}?${parameters}`);
	let page = await searchResponse.text();
	let recordUrl = searchResponse.url;
	const detailUrl = page.match(/href="([^\"]*opac-detail\.pl\?biblionumber=\d+)/)?.[1];
	if (detailUrl) {
		recordUrl = new URL(detailUrl.replace(/&amp;/g, "&"), CATALOG_URL).toString();
		page = await (await fetch(recordUrl)).text();
	}

	const title = extractFirstMatch(page, /class="biblio-title">([\s\S]*?)<\//) || extractFirstMatch(page, /<h1 class="title"[^>]*>([\s\S]*?)<\//);
	const holdings = [...page.matchAll(/<tr vocab="http:\/\/schema\.org\/"[\s\S]*?<\/tr>/g)];
	const holding = holdings.find((row) => /Taylor University Zondervan Library/.test(row[0]))?.[0];
	if (!title || !holding) {
		throw new Error("No available Taylor DVD matched that search.");
	}

	const library = extractFirstMatch(holding, /class="location"[\s\S]*?>([\s\S]*?)<\/td>/);
	const shelving = extractFirstMatch(holding, /class="shelvingloc">([\s\S]*?)<\//);
	const callNumber = extractFirstMatch(holding, /class="call_no"[^>]*>([\s\S]*?)\s*\(/);
	const posterUrl = await findPoster(title);
	return { title, location: [library, shelving].filter(Boolean).join(" - "), callNumber, recordUrl, posterUrl };
}

const server = http.createServer(async (request, response) => {
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
		const content = await fs.readFile(path.join(ROOT, fileName));
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