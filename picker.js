const MOVIE_TYPE_SUBJECTS = {
	fiction: "Feature films",
	"non-fiction": "Documentary films"
};

function randomInteger(min, max) {
	return Math.floor(Math.random() * (max - min + 1)) + min;
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
		const response = await fetch("/api/movie", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ movieType, searchTerm, selectionMode })
		});
		const movie = await response.json();

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
		const shelfItems = document.getElementById("shelf-items");
		shelfItems.replaceChildren(...movie.shelf.map((item) => {
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
				poster.onerror = () => {
					poster.replaceWith(Object.assign(document.createElement("span"), {
						className: "shelf-placeholder",
						innerText: "No poster"
					}));
				};
				link.append(poster);
			} else {
				const placeholder = document.createElement("span");
				placeholder.className = "shelf-placeholder";
				placeholder.innerText = "No poster";
				link.append(placeholder);
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
		shelfPreview.hidden = movie.shelf.length === 0;
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

document.addEventListener("DOMContentLoaded", () => {
	document.getElementById("movie-picker").addEventListener("submit", (event) => {
		event.preventDefault();
		const selectedType = document.querySelector("input[name='movie-type']:checked").value;
		const selectedMode = document.querySelector("input[name='selection-mode']:checked").value;
		const searchTerm = document.getElementById("movie-search").value;
		if (selectedMode === "classic") {
			displayClassicValues(selectedType);
			return;
		}
		DisplayCatalogSearch(selectedType, searchTerm, selectedMode);
	});
});