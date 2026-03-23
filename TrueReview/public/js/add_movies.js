// =============================================================================
//  add_movies.js — Client-side rendering for Search page (Movies & Users)
// =============================================================================

const searchInput = document.getElementById("search-input");
const resultsDiv = document.getElementById("search-results");
const loadingText = document.getElementById("loading-text");
const errorText = document.getElementById("error-text");

let debounceTimer = null;
let currentSearchType = 'movies'; // Default to movies

// Make currentSearchType accessible globally for tab switching
window.addEventListener('load', () => {
    // Listen for tab changes
    document.querySelectorAll('.search-tab-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            // Don't do anything if the button is disabled
            if (this.classList.contains('disabled')) {
                return;
            }

            // Remove active class from all tabs
            document.querySelectorAll('.search-tab-btn').forEach(tab => {
                tab.classList.remove('active');
            });

            // Add active class to clicked tab
            this.classList.add('active');

            // Update search type
            currentSearchType = this.dataset.searchType;

            // Update placeholder
            searchInput.placeholder = currentSearchType === 'movies'
                ? 'Search for a movie...'
                : 'Search for users...';

            // Clear results
            searchInput.value = '';
            resultsDiv.innerHTML = '';

            console.log('Search type switched to:', currentSearchType);
        });
    });
});

// -----------------------------------------------------------------------------
//  RENDER MOVIE RESULTS
// -----------------------------------------------------------------------------
function renderMovieResults(movies) {
    resultsDiv.innerHTML = "";

    if (!movies || movies.length === 0) {
        resultsDiv.innerHTML = `<p class="no-results">No movies found.</p>`;
        return;
    }

    movies.forEach(movie => {
        const card = document.createElement("a");
        card.className = movie.isWatched ? "movie-card watched" : "movie-card";

        if (movie.isWatched && movie.watched_id) {
            card.href = `/update-movie/${movie.watched_id}`;
        } else if (movie.isWatched && !movie.watched_id) {
            console.warn("Movie marked as watched but missing watched_id:", movie);
            card.href = `/rate-movie/${movie.movie_id}`;
        } else {
            card.href = `/rate-movie/${movie.movie_id}`;
        }

        const watchlistBtnClass = movie.inWatchlist ? "watchlist-btn in-watchlist" : "watchlist-btn";
        const watchlistBtnText = movie.inWatchlist ? "✓ In Watchlist" : "+ Watchlist";

        card.innerHTML = `
            <div class="poster-wrapper">
                <img class="poster" src="${movie.poster_full_url}" alt="${movie.movie_title}" onerror="this.src='/TrueReview_logo/Poster_BW.png'" />
            </div>

            <div class="movie-info">
                <h2 class="title">${movie.movie_title}</h2>
                <p class="year">${movie.isCurrentYear ? movie.fullReleaseDate : movie.releaseYear}</p>
            </div>

            ${movie.isWatched ? '<div class="watched-label">Watched</div>' : ''}
            <button class="${watchlistBtnClass}" onclick="addToWatchlist(event, ${movie.movie_id}, ${movie.watched_id || null}, ${movie.isWatched}, ${movie.inWatchlist})">${watchlistBtnText}</button>
        `;

        resultsDiv.appendChild(card);
    });
}

// -----------------------------------------------------------------------------
//  RENDER USER RESULTS
// -----------------------------------------------------------------------------
function renderUserResults(users) {
    resultsDiv.innerHTML = "";

    if (!users || users.length === 0) {
        resultsDiv.innerHTML = `<p class="no-results">No users found.</p>`;
        return;
    }

    users.forEach(user => {
        const card = document.createElement("div");
        card.className = "user-result-card";

        const profilePicUrl = user.profile_picture
            ? `/uploads/profile_pictures/${user.profile_picture}`
            : '/TrueReview_logo/Icon_BW.png';

        const followBtnClass = user.is_following ? "user-follow-btn following" : "user-follow-btn";
        const followBtnText = user.is_following ? "Following" : "Follow";

        card.innerHTML = `
            <div class="user-result-left">
                <img class="user-profile-pic" src="${profilePicUrl}" alt="${user.username}" onerror="this.src='/TrueReview_logo/Icon_BW.png'" />
                <div class="user-info">
                    <div class="user-display-name">${user.display_name}</div>
                    <div class="user-username">@${user.username}</div>
                </div>
            </div>
            <button
                class="${followBtnClass}"
                onclick="toggleUserFollow(event, ${user.user_id}, this)"
                data-user-id="${user.user_id}"
                data-following="${user.is_following}"
            >
                ${followBtnText}
            </button>
        `;

        resultsDiv.appendChild(card);
    });
}

// -----------------------------------------------------------------------------
//  FETCH SEARCH RESULTS (Movies or Users)
// -----------------------------------------------------------------------------
async function performSearch(query) {
    if (!query.trim()) {
        resultsDiv.innerHTML = "";
        return;
    }

    loadingText.style.display = "block";
    errorText.style.display = "none";

    try {
        let endpoint = '';
        if (currentSearchType === 'movies') {
            endpoint = `/api/search-movies?q=${encodeURIComponent(query)}`;
        } else if (currentSearchType === 'users') {
            endpoint = `/api/search-users?q=${encodeURIComponent(query)}`;
        }

        const res = await fetch(endpoint);

        if (!res.ok) throw new Error("Bad response");

        const data = await res.json();

        loadingText.style.display = "none";

        if (currentSearchType === 'movies') {
            renderMovieResults(data);
        } else if (currentSearchType === 'users') {
            renderUserResults(data);
        }

    } catch (err) {
        loadingText.style.display = "none";
        errorText.style.display = "block";
        console.error("Search Error:", err);
    }
}

// -----------------------------------------------------------------------------
//  DEBOUNCE INPUT
// -----------------------------------------------------------------------------
searchInput.addEventListener("input", () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
        performSearch(searchInput.value);
    }, 300);
});

// -----------------------------------------------------------------------------
//  TOGGLE USER FOLLOW/UNFOLLOW
// -----------------------------------------------------------------------------
async function toggleUserFollow(event, userId, button) {
    event.preventDefault();
    event.stopPropagation();

    const isFollowing = button.getAttribute('data-following') === 'true';
    const endpoint = isFollowing ? 'unfollow' : 'follow';

    try {
        const res = await fetch(`/api/user/${endpoint}/${userId}`, {
            method: 'POST'
        });

        if (!res.ok) {
            const error = await res.json();
            console.error(`Failed to ${endpoint} user:`, error.error);
            return;
        }

        // Update button state
        button.setAttribute('data-following', !isFollowing);
        button.className = isFollowing ? 'user-follow-btn' : 'user-follow-btn following';
        button.textContent = isFollowing ? 'Follow' : 'Following';

        console.log(`${isFollowing ? 'Unfollowed' : 'Followed'} user ${userId}`);
    } catch (err) {
        console.error(`Error ${endpoint}ing user:`, err);
    }
}

// -----------------------------------------------------------------------------
//  CUSTOM MODAL FUNCTIONALITY
// -----------------------------------------------------------------------------
function showConfirmModal() {
    return new Promise((resolve) => {
        const modal = document.getElementById("confirm-modal");
        const yesBtn = document.getElementById("modal-yes");
        const noBtn = document.getElementById("modal-no");

        modal.classList.add("active");

        const handleYes = () => {
            modal.classList.remove("active");
            yesBtn.removeEventListener("click", handleYes);
            noBtn.removeEventListener("click", handleNo);
            resolve(true);
        };

        const handleNo = () => {
            modal.classList.remove("active");
            yesBtn.removeEventListener("click", handleYes);
            noBtn.removeEventListener("click", handleNo);
            resolve(false);
        };

        yesBtn.addEventListener("click", handleYes);
        noBtn.addEventListener("click", handleNo);

        modal.addEventListener("click", (e) => {
            if (e.target === modal) {
                handleNo();
            }
        });
    });
}

// -----------------------------------------------------------------------------
//  MOVIE WATCHLIST FUNCTIONALITY
// -----------------------------------------------------------------------------
async function addToWatchlist(event, movieId, watchedId, isWatched, inWatchlist) {
    event.preventDefault();
    event.stopPropagation();

    const button = event.target;

    if (inWatchlist) {
        try {
            const res = await fetch(`/api/watchlist/${movieId}`, {
                method: "DELETE"
            });

            if (!res.ok) {
                const error = await res.json();
                console.error("Failed to remove from watchlist:", error.error);
                return;
            }

            console.log("Removed from watchlist");
            button.classList.remove("in-watchlist");
            button.textContent = "+ Watchlist";
            button.setAttribute("onclick", `addToWatchlist(event, ${movieId}, ${watchedId || null}, ${isWatched}, false)`);
        } catch (err) {
            console.error("Error removing from watchlist:", err);
        }
        return;
    }

    if (isWatched && watchedId) {
        const confirmed = await showConfirmModal();
        if (!confirmed) return;

        try {
            const res = await fetch("/api/watchlist/move-from-watched", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ watched_id: watchedId, movie_id: movieId })
            });

            if (!res.ok) {
                const error = await res.json();
                console.error("Failed to move to watchlist:", error.error);
                return;
            }

            performSearch(searchInput.value);
        } catch (err) {
            console.error("Error moving to watchlist:", err);
        }
    } else {
        try {
            const res = await fetch("/api/watchlist/add", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ movie_id: movieId, priority_01: 0 })
            });

            if (!res.ok) {
                const error = await res.json();
                console.error("Failed to add to watchlist:", error.error);
                return;
            }

            console.log("Added to watchlist");
            button.classList.add("in-watchlist");
            button.textContent = "✓ In Watchlist";
            button.setAttribute("onclick", `addToWatchlist(event, ${movieId}, ${watchedId || null}, ${isWatched}, true)`);
        } catch (err) {
            console.error("Error adding to watchlist:", err);
        }
    }
}
