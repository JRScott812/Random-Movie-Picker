const MOVIE_TYPE_SUBJECTS = {
	fiction: "Feature films",
	"non-fiction": "Documentary films"
};
const API_ORIGIN = window.location.hostname === "jrscott812.github.io"
	? "https://random-movie-picker-4d4e4afe3a91.herokuapp.com"
	: "";

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
	document.getElementById("movie-preview").hidden = true;
	document.getElementById("shelf-preview").hidden = true;
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

async function DisplayCatalogSearch(movieType, searchTerm, selectionMode) {
	const description = document.getElementById("search-description");
	const moviePreview = document.getElementById("movie-preview");
	const classicPreview = document.getElementById("classic-preview");
	const results = document.getElementById("results");
	const pickMovie = document.getElementById("pick-movie");
	const shelfPreview = document.getElementById("shelf-preview");

	classicPreview.hidden = true;
	moviePreview.hidden = true;
	shelfPreview.hidden = true;
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

		const movieTitle = document.getElementById("movie-title");
		const moviePoster = document.getElementById("movie-poster");
		const movieNote = document.getElementById("movie-note");
		const directorRow = document.getElementById("director-row");
		const actorsRow = document.getElementById("actors-row");
		movieTitle.innerText = movie.title;
		movieTitle.href = movie.recordUrl;
		movieNote.innerText = movie.titleNote || "";
		movieNote.hidden = !movie.titleNote;
		document.getElementById("movie-director").innerText = movie.director || "";
		directorRow.hidden = !movie.director;
		document.getElementById("movie-actors").innerText = movie.actors || "";
		actorsRow.hidden = !movie.actors;
		moviePoster.src = movie.posterUrl;
		moviePoster.alt = movie.posterUrl ? `Poster for ${movie.title}` : "";
		moviePoster.hidden = !movie.posterUrl;
		moviePoster.onerror = () => {
			moviePoster.hidden = true;
		};
		document.getElementById("movie-location").innerText = movie.location;
		document.getElementById("movie-call-number").innerText = movie.callNumber;
		renderShelf(movie.shelf);
		shelfPreview.hidden = movie.shelf.items.length === 0;
		description.innerText = "Available now in the PALNI catalog.";
		moviePreview.hidden = false;
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
	const moviePreview = document.getElementById("movie-preview");
	const classicPreview = document.getElementById("classic-preview");
	const shelfPreview = document.getElementById("shelf-preview");
	const results = document.getElementById("results");
	const pickMovie = document.getElementById("pick-movie");

	classicPreview.hidden = true;
	moviePreview.hidden = true;
	shelfPreview.hidden = true;
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
	async function browseShelf(itemnumber, button) {
		button.disabled = true;
		try {
			const response = await fetch(apiUrl(`/api/shelf?itemnumber=${encodeURIComponent(itemnumber)}`));
			const shelf = await parseApiResponse(response);
			if (!response.ok) throw new Error(shelf.message);
			renderShelf(shelf);
			document.getElementById("shelf-items").scrollTo({ left: 0, behavior: "smooth" });
		} catch (error) {
			document.getElementById("search-description").innerText = error.message || "The shelf could not be loaded.";
		} finally {
			button.disabled = false;
		}
	}

	document.getElementById("shelf-previous").addEventListener("click", (event) => browseShelf(event.currentTarget.dataset.itemnumber, event.currentTarget));
	document.getElementById("shelf-next").addEventListener("click", (event) => browseShelf(event.currentTarget.dataset.itemnumber, event.currentTarget));

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