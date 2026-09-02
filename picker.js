function randomInteger(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function PickMovie(movieType = "all") {
    let carousel;

    if (movieType === "fiction") {
        carousel = randomInteger(1, 3);
    } else if (movieType === "non-fiction") {
        carousel = 3;
    } else {
        carousel = randomInteger(1, 4);
    }

    const section = randomInteger(1, 5);
    const row = randomInteger(1, 6);
    const subSection = randomInteger(1, 5);
    const index = randomInteger(1, 7);

    DisplayValues(carousel, section, row, subSection, index);

    return { carousel, section, row, subSection, index };
}

function DisplayValues(carousel, section, row, subSection, index) {
    document.getElementById("carousel-value").innerText = carousel;
    document.getElementById("section-value").innerText = section;
    document.getElementById("row-value").innerText = row;
    document.getElementById("sub-section-value").innerText = subSection;
    document.getElementById("index-value").innerText = index;
}

document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("pick-movie").addEventListener("click", () => {
        const selectedType = document.querySelector("input[name='movie-type']:checked").value;
        PickMovie(selectedType);
    });
});