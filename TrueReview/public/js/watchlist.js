console.log("Watchlist page loaded.");

let allMovies = [];
let currentFilter = sessionStorage.getItem('watchlistFilter') || 'priority-desc';

async function loadWatchlist() {
    try {
        const res = await fetch("/api/watchlist");
        allMovies = await res.json();

        console.log("Watchlist movies data:", allMovies);

        // Assign entry numbers based on watch_list_id order (most recent = highest number)
        // Sort by watch_list_id to get chronological order
        const sortedByWatchlistId = [...allMovies].sort((a, b) => a.watch_list_id - b.watch_list_id);

        // Assign entry numbers starting from 1 for oldest
        sortedByWatchlistId.forEach((movie, index) => {
            movie.entryNumber = index + 1;
        });

        // Apply saved filter or default
        applyFilter(currentFilter);
    } catch (err) {
        console.error("Error loading watchlist movies:", err);
    }
}

function applyFilter(filterType) {
    currentFilter = filterType;
    // Save filter to sessionStorage
    sessionStorage.setItem('watchlistFilter', filterType);

    let filteredMovies = [...allMovies];

    // Apply priority filter
    if (filterType === 'priority-high') {
        filteredMovies = filteredMovies.filter(movie => movie.priority_01 === 1);
    }

    // Apply sorting
    switch(filterType) {
        case 'activity-desc':
            // Default order - sort by added_date DESC (most recent first)
            filteredMovies.sort((a, b) => new Date(b.added_date) - new Date(a.added_date));
            break;
        case 'activity-asc':
            filteredMovies.sort((a, b) => new Date(a.added_date) - new Date(b.added_date));
            break;
        case 'priority-desc':
            // High priority (1) first, then normal (0)
            filteredMovies.sort((a, b) => {
                if (b.priority_01 !== a.priority_01) {
                    return b.priority_01 - a.priority_01;
                }
                // If same priority, sort by added date (newest first)
                return new Date(b.added_date) - new Date(a.added_date);
            });
            break;
        case 'year-desc':
            filteredMovies.sort((a, b) => {
                const yearA = a.movie_release_date ? new Date(a.movie_release_date).getFullYear() : null;
                const yearB = b.movie_release_date ? new Date(b.movie_release_date).getFullYear() : null;

                // Put movies without release dates at the end
                if (yearA === null && yearB === null) return 0;
                if (yearA === null) return 1;
                if (yearB === null) return -1;

                return yearB - yearA;
            });
            break;
        case 'year-asc':
            filteredMovies.sort((a, b) => {
                const yearA = a.movie_release_date ? new Date(a.movie_release_date).getFullYear() : null;
                const yearB = b.movie_release_date ? new Date(b.movie_release_date).getFullYear() : null;

                // Put movies without release dates at the end
                if (yearA === null && yearB === null) return 0;
                if (yearA === null) return 1;
                if (yearB === null) return -1;

                return yearA - yearB;
            });
            break;
        case 'alpha-asc':
            filteredMovies.sort((a, b) => a.movie_title.localeCompare(b.movie_title));
            break;
        case 'alpha-desc':
            filteredMovies.sort((a, b) => b.movie_title.localeCompare(a.movie_title));
            break;
    }

    displayMovies(filteredMovies);
}

function displayMovies(movies) {
    const grid = document.querySelector(".movies-grid");
    grid.innerHTML = "";

    // Update total entries count
    document.getElementById("total-entries").textContent = `TOTAL ENTRIES: ${movies.length}`;

    if (movies.length === 0) {
        grid.innerHTML = `<p class="empty-msg">No movies found with this filter.</p>`;
        return;
    }

    movies.forEach((movie) => {
        const card = document.createElement("a");
        card.className = "movie-card";
        card.href = `/rate-movie/${movie.movie_id}`;

        // Use entryNumber assigned during load - stays consistent regardless of sort order
        const entryNumber = String(movie.entryNumber).padStart(3, '0');

        // Priority badge HTML (only show if priority_01 === 1)
        const priorityBadgeHTML = movie.priority_01 === 1
            ? '<div class="priority-badge">HIGH PRIORITY</div>'
            : '';

        // Priority button classes based on current priority
        const priorityBtnClass = movie.priority_01 === 1 ? 'priority-btn active' : 'priority-btn';

        card.innerHTML = `
            <div class="poster-wrapper">
                ${priorityBadgeHTML}
                <button class="${priorityBtnClass}" data-movie-id="${movie.movie_id}" data-watch-list-id="${movie.watch_list_id}" data-priority="${movie.priority_01}">
                    <span class="priority-icon">★</span>
                </button>
                <img
                    src="${movie.poster_full_url}"
                    alt="${movie.movie_title}"
                    class="movie-poster"
                    onerror="this.src='/TrueReview_logo/Poster_BW.png'"
                >
                <div class="watchlist-entry-number">ENTRY_${entryNumber}</div>
                <div class="hover-overlay">
                    <div class="movie-title">${movie.movie_title}</div>
                </div>
            </div>
        `;

        grid.appendChild(card);
    });

    // Add event listeners to priority buttons
    document.querySelectorAll('.priority-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();

            const watchListId = btn.dataset.watchListId;
            const currentPriority = parseInt(btn.dataset.priority);
            const newPriority = currentPriority === 1 ? 0 : 1;

            try {
                const res = await fetch(`/api/watchlist/${watchListId}/priority`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ priority_01: newPriority })
                });

                if (!res.ok) {
                    console.error('Failed to update priority');
                    return;
                }

                // Update button state
                btn.dataset.priority = newPriority;
                if (newPriority === 1) {
                    btn.classList.add('active');
                } else {
                    btn.classList.remove('active');
                }

                // Reload to update the priority badge
                loadWatchlist();
            } catch (err) {
                console.error('Error updating priority:', err);
            }
        });
    });
}

// Filter dropdown toggle
document.addEventListener('DOMContentLoaded', () => {
    const filterBtn = document.getElementById('filter-btn');
    const filterDropdown = document.getElementById('filter-dropdown');
    const filterOptions = document.querySelectorAll('.filter-option');

    // Set active class on the currently selected filter
    const savedFilter = sessionStorage.getItem('watchlistFilter') || 'activity-desc';
    filterOptions.forEach(opt => {
        if (opt.getAttribute('data-filter') === savedFilter) {
            opt.classList.add('active');
        }
    });

    filterBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        filterDropdown.classList.toggle('active');
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (!filterDropdown.contains(e.target) && e.target !== filterBtn) {
            filterDropdown.classList.remove('active');
        }
    });

    // Handle filter selection
    filterOptions.forEach(option => {
        option.addEventListener('click', (e) => {
            const filterType = option.getAttribute('data-filter');

            // Only apply filter if this option has a data-filter attribute
            if (filterType) {
                e.stopPropagation();

                // Remove active class from all options
                filterOptions.forEach(opt => opt.classList.remove('active'));
                // Add active class to selected option
                option.classList.add('active');

                // Apply the filter
                applyFilter(filterType);

                // Close dropdown
                filterDropdown.classList.remove('active');
            }
        });
    });
});

// Load immediately
loadWatchlist();
