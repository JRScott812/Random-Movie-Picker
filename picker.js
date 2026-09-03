const MOVIE_TYPE_SUBJECTS = {
	fiction: "Feature films",
	"non-fiction": "Documentary films"
};

async function DisplayCatalogSearch(movieType, searchTerm) {
	const description = document.getElementById("search-description");
	const moviePreview = document.getElementById("movie-preview");

	description.innerText = "Finding an available DVD...";
	moviePreview.hidden = true;

	try {
		const response = await fetch("/api/movie", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ movieType, searchTerm })
		});
		const movie = await response.json();

		if (!response.ok) {
			throw new Error(movie.message);
		}

		const movieTitle = document.getElementById("movie-title");
		const moviePoster = document.getElementById("movie-poster");
		movieTitle.innerText = movie.title;
		movieTitle.href = movie.recordUrl;
		moviePoster.src = movie.posterUrl;
		moviePoster.alt = movie.posterUrl ? `Poster for ${movie.title}` : "";
		moviePoster.hidden = !movie.posterUrl;
		document.getElementById("movie-location").innerText = movie.location;
		document.getElementById("movie-call-number").innerText = movie.callNumber;
		description.innerText = "Available now in the PALNI catalog.";
		moviePreview.hidden = false;
	} catch (error) {
		description.innerText = error.message || "The catalog could not be reached. Please try again.";
	}
}

document.addEventListener("DOMContentLoaded", () => {
	document.getElementById("movie-picker").addEventListener("submit", (event) => {
		event.preventDefault();
		const selectedType = document.querySelector("input[name='movie-type']:checked").value;
		const searchTerm = document.getElementById("movie-search").value;
		DisplayCatalogSearch(selectedType, searchTerm);
	});
});