const MOVIE_TYPE_SUBJECTS = {
	fiction: "Feature films",
	"non-fiction": "Documentary films"
};
const API_ORIGIN = window.location.hostname === "jrscott812.github.io"
	? "https://random-movie-picker-4d4e4afe3a91.herokuapp.com"
	: "";
let activeShelfBiblionumber = "";

function apiUrl(path) {
	return `${API_ORIGIN}${path}`;
}

function randomInteger(min, max) {
	return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function parseApiResponse(response) {
	const contentType = response.headers.get("content-type") || "";
	if (!contentType.includes("application/json")) {
		throw new Error("The movie API is unavailable. This app must be deployed to a Node.js host, not GitHub Pages.");
	}
	return response.json();
}

function resetPreviews() {
	activeShelfBiblionumber = "";
	document.getElementById("classic-preview").hidden = true;
	document.getElementById("movie-preview").hidden = true;
	document.getElementById("shelf-preview").hidden = true;
	document.getElementById("shelf-items").replaceChildren();
	["shelf-previous", "shelf-next"].forEach((id) => {
		const button = document.getElementById(id);
		button.hidden = true;
		delete button.dataset.itemnumber;
	});
}

function displayClassicValues(movieType) {
	const carousel = movieType === "fiction" ? randomInteger(1, 3) : movieType === "non-fiction" ? 3 : randomInteger(1, 4);
	const values = {
		carousel,
		section: randomInteger(1, 5),
		row: randomInteger(1, 6),
		subSection: randomInteger(1, 5),
		index: randomInteger(1, 7)
	};

	Object.entries(values).forEach(([name, value]) => {
		document.getElementById(`${name.replace(/([A-Z])/g, "-$1").toLowerCase()}-value`).innerText = value;
	});
	resetPreviews();
	document.getElementById("classic-preview").hidden = false;
	document.getElementById("search-description").innerText = "Classic random indices generated.";
}

function renderShelf(shelf) {
	const shelfItems = document.getElementById("shelf-items");
	shelfItems.replaceChildren(...shelf.items.map((item) => {
		const link = document.createElement("a");
		link.className = "shelf-item";
		link.href = item.recordUrl;
		link.target = "_blank";
		link.rel = "noopener";
		link.title = item.title;
		link.dataset.biblionumber = item.biblionumber;
		if (item.biblionumber === activeShelfBiblionumber) link.setAttribute("aria-current", "true");
		link.addEventListener("click", (event) => {
			if (item.biblionumber !== activeShelfBiblionumber) {
				event.preventDefault();
				selectShelfMovie(item.biblionumber);
			}
		});
		if (item.posterUrl) {
			const poster = document.createElement("img");
			poster.src = item.posterUrl;
			poster.alt = `Poster for ${item.title}`;
			poster.onerror = () => poster.replaceWith(Object.assign(document.createElement("span"), { className: "shelf-placeholder", innerText: "No poster" }));
			link.append(poster);
		} else {
			link.append(Object.assign(document.createElement("span"), { className: "shelf-placeholder", innerText: "No poster" }));
		}
		const label = document.createElement("span");
		label.append(item.title);
		if (item.copyCount > 1) {
			const count = document.createElement("span");
			count.className = "copy-count";
			count.innerText = `x${item.copyCount}`;
			count.title = `${item.copyCount} copies available`;
			label.append(" ", count);
		}
		link.append(label);
		return link;
	}));
	const shelfPrevious = document.getElementById("shelf-previous");
	const shelfNext = document.getElementById("shelf-next");
	shelfPrevious.hidden = !shelf.previousItemnumber;
	shelfNext.hidden = !shelf.nextItemnumber;
	shelfPrevious.dataset.itemnumber = shelf.previousItemnumber;
	shelfNext.dataset.itemnumber = shelf.nextItemnumber;
}

function renderMovie(movie) {
	const movieTitle = document.getElementById("movie-title");
	const moviePoster = document.getElementById("movie-poster");
	const movieNote = document.getElementById("movie-note");
	const movieDirector = document.getElementById("movie-director");
	const movieActors = document.getElementById("movie-actors");
	const actorsRow = document.getElementById("actors-row");
	movieTitle.innerText = movie.title;
	movieTitle.href = movie.recordUrl;
	movieNote.innerText = movie.titleNote || "";
	movieNote.hidden = !movie.titleNote;
	movieDirector.innerText = movie.director ? `Directed by ${movie.director}` : "";
	movieDirector.hidden = !movie.director;
	const actors = (movie.actors || "").split(/[;,]/).map((actor) => actor.trim()).filter(Boolean);
	movieActors.replaceChildren(...actors.map((actor) => Object.assign(document.createElement("span"), { className: "actor-name", innerText: actor })));
	actorsRow.hidden = !movie.actors;
	moviePoster.src = movie.posterUrl;
	moviePoster.alt = movie.posterUrl ? `Poster for ${movie.title}` : "";
	moviePoster.hidden = !movie.posterUrl;
	moviePoster.onerror = () => { moviePoster.hidden = true; };
	document.getElementById("movie-location").innerText = movie.location;
	document.getElementById("movie-call-number").innerText = movie.callNumber;
	renderShelf(movie.shelf);
	document.getElementById("shelf-preview").hidden = movie.shelf.items.length === 0;
	document.getElementById("movie-preview").hidden = false;
}

async function selectShelfMovie(biblionumber) {
	const description = document.getElementById("search-description");
	const results = document.getElementById("results");
	try {
		description.innerText = "Loading movie details...";
		results.classList.add("is-loading");
		const response = await fetch(apiUrl("/api/movie"), {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ biblionumber })
		});
		const movie = await parseApiResponse(response);
		if (!response.ok) throw new Error(movie.message);
		activeShelfBiblionumber = biblionumber;
		renderMovie(movie);
		description.innerText = "Selected from the DVD shelf. Select it again to open the catalog record.";
	} catch (error) {
		description.innerText = error.message || "The movie details could not be loaded.";
	} finally {
		results.classList.remove("is-loading");
	}
}

async function DisplayCatalogSearch(movieType, searchTerm, selectionMode) {
	const description = document.getElementById("search-description");
	const results = document.getElementById("results");
	const pickMovie = document.getElementById("pick-movie");

	resetPreviews();
	description.innerText = "Finding an available DVD...";
	description.setAttribute("role", "status");
	results.classList.add("is-loading");
	pickMovie.disabled = true;
	pickMovie.setAttribute("aria-busy", "true");
	pickMovie.innerText = "Finding a movie...";

	try {
		const response = await fetch(apiUrl("/api/movie"), {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ movieType, searchTerm, selectionMode })
		});
		const movie = await parseApiResponse(response);

		if (!response.ok) {
			throw new Error(movie.message);
		}

		renderMovie(movie);
		description.innerText = "Available now in the PALNI catalog.";
	} catch (error) {
		description.innerText = error.message || "The catalog could not be reached. Please try again.";
	} finally {
		results.classList.remove("is-loading");
		pickMovie.disabled = false;
		pickMovie.removeAttribute("aria-busy");
		pickMovie.innerText = "Find a movie";
	}
}

async function DisplayShelfSearch() {
	const description = document.getElementById("search-description");
	const shelfPreview = document.getElementById("shelf-preview");
	const results = document.getElementById("results");
	const pickMovie = document.getElementById("pick-movie");

	resetPreviews();
	description.innerText = "Opening the DVD shelf...";
	description.setAttribute("role", "status");
	results.classList.add("is-loading");
	pickMovie.disabled = true;
	pickMovie.setAttribute("aria-busy", "true");
	pickMovie.innerText = "Opening shelf...";

	try {
		const response = await fetch(apiUrl("/api/shelf/start"));
		const shelf = await parseApiResponse(response);
		if (!response.ok) throw new Error(shelf.message);
		renderShelf(shelf);
		shelfPreview.hidden = shelf.items.length === 0;
		description.innerText = "Browsing the PALNI DVD shelf.";
	} catch (error) {
		description.innerText = error.message || "The shelf could not be loaded.";
	} finally {
		results.classList.remove("is-loading");
		pickMovie.disabled = false;
		pickMovie.removeAttribute("aria-busy");
		pickMovie.innerText = "Find a movie";
	}
}

document.addEventListener("DOMContentLoaded", () => {
	function updateSearchField() {
		const randomMode = document.querySelector("input[name='selection-mode']:checked").value === "random";
		const searchField = document.getElementById("search-field");
		searchField.hidden = !randomMode;
		document.getElementById("movie-search").disabled = !randomMode;
	}

	async function browseShelf(itemnumber, button) {
		button.disabled = true;
		try {
			const response = await fetch(apiUrl(`/api/shelf?itemnumber=${encodeURIComponent(itemnumber)}`));
			const shelf = await parseApiResponse(response);
			if (!response.ok) throw new Error(shelf.message);
			activeShelfBiblionumber = "";
			document.getElementById("movie-preview").hidden = true;
			renderShelf(shelf);
			document.getElementById("shelf-preview").hidden = shelf.items.length === 0;
			if (shelf.items.length) document.getElementById("shelf-items").scrollTo({ left: 0, behavior: "smooth" });
		} catch (error) {
			document.getElementById("search-description").innerText = error.message || "The shelf could not be loaded.";
		} finally {
			button.disabled = false;
		}
	}

	document.getElementById("shelf-previous").addEventListener("click", (event) => browseShelf(event.currentTarget.dataset.itemnumber, event.currentTarget));
	document.getElementById("shelf-next").addEventListener("click", (event) => browseShelf(event.currentTarget.dataset.itemnumber, event.currentTarget));
	document.querySelectorAll("input[name='selection-mode']").forEach((input) => input.addEventListener("change", updateSearchField));
	updateSearchField();

	document.getElementById("movie-picker").addEventListener("submit", (event) => {
		event.preventDefault();
		const selectedType = document.querySelector("input[name='movie-type']:checked").value;
		const selectedMode = document.querySelector("input[name='selection-mode']:checked").value;
		const searchTerm = document.getElementById("movie-search").value;
		if (selectedMode === "classic") {
			displayClassicValues(selectedType);
			return;
		}
		if (selectedMode === "shelf") {
			DisplayShelfSearch();
			return;
		}
		DisplayCatalogSearch(selectedType, searchTerm, selectedMode);
	});
});