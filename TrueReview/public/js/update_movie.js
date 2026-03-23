const watchedId = window.location.pathname.split("/").pop();

// Load existing watched entry details
async function loadWatchedEntry() {
    const res = await fetch(`/api/watched/${watchedId}`);

    if (!res.ok) {
        console.error("Failed to load watched entry");
        return;
    }

    const data = await res.json();

    // Fill movie visuals
    const posterImg = document.getElementById("movie-poster");
    posterImg.src = data.poster_full_url;
    posterImg.onerror = () => { posterImg.src = '/TrueReview_logo/Poster_BW.png'; };
    document.getElementById("movie-title").textContent = data.movie_title;
    document.getElementById("movie-year").textContent = data.releaseYear;

    // Pre-fill rating + review
    const rating = parseFloat(data.user_rating);
    document.getElementById("rating").value = rating;
    document.getElementById("rating-display").textContent = rating.toFixed(1);
    document.getElementById("review").value = data.review || "";

    // Set form actions
    document.getElementById("update-form").action = `/update-movie/${watchedId}`;
    document.getElementById("delete-form").action = `/delete-movie/${watchedId}`;
}

// Update rating display as slider moves
const ratingSlider = document.getElementById("rating");
const ratingDisplay = document.getElementById("rating-display");

ratingSlider.addEventListener("input", (e) => {
    const value = parseFloat(e.target.value).toFixed(1);
    ratingDisplay.textContent = value;
});

loadWatchedEntry();
