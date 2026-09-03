const CATALOG_URL = "https://catalog.library.taylor.edu/cgi-bin/koha/opac-search.pl";
const MOVIE_TYPE_SUBJECTS = {
	fiction: "Feature films",
	"non-fiction": "Documentary films"
};

function BuildCatalogSearchUrl(movieType, searchTerm) {
	const titleSearch = searchTerm.trim();
	const subjectSearch = MOVIE_TYPE_SUBJECTS[movieType];
	const parameters = new URLSearchParams({
		idx: titleSearch ? "ti" : (subjectSearch ? "su" : ""),
		q: titleSearch || subjectSearch || "*",
		advsearch: "1",
		sort_by: "relevance",
		do: "Search"
	});

	parameters.append("limit", "branch:ITU");
	parameters.append("limit", "available");
	parameters.append("limit", "ln,rtrn:eng");
	parameters.append("limit", "l-format:vd");

	return `${CATALOG_URL}?${parameters.toString()}`;
}

function DisplayCatalogSearch(movieType, searchTerm) {
	const catalogLink = document.getElementById("catalog-link");
	const description = document.getElementById("search-description");
	const query = searchTerm.trim() || (MOVIE_TYPE_SUBJECTS[movieType] || "all available DVDs");

	catalogLink.href = BuildCatalogSearchUrl(movieType, searchTerm);
	catalogLink.hidden = false;
	description.innerText = `Search PALNI for ${query}.`;
}

document.addEventListener("DOMContentLoaded", () => {
	document.getElementById("pick-movie").addEventListener("click", () => {
		const selectedType = document.querySelector("input[name='movie-type']:checked").value;
		const searchTerm = document.getElementById("movie-search").value;
		DisplayCatalogSearch(selectedType, searchTerm);
	});
});