// Applies the saved theme before first paint to avoid a flash of the wrong theme.
(function () {
	document.documentElement.setAttribute("data-theme", localStorage.getItem("theme") || "auto");
})();

function applyTheme(theme) {
	document.documentElement.setAttribute("data-theme", theme);
	localStorage.setItem("theme", theme);
	document.querySelectorAll(".theme-option").forEach((button) => {
		button.setAttribute("aria-checked", String(button.dataset.themeChoice === theme));
	});
}

document.addEventListener("DOMContentLoaded", () => {
	document.querySelectorAll(".theme-option").forEach((button) => {
		button.addEventListener("click", () => applyTheme(button.dataset.themeChoice));
	});
	applyTheme(localStorage.getItem("theme") || "auto");
});
