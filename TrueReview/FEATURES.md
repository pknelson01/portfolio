# TrueReview Features Documentation

---

## Search and Auto-Populate all_movies

**Description:**
When users search for movies from TMDB and interact with them (add to watchlist, rate, or view details), the movie data is automatically fetched from TMDB and inserted into the `all_movies` database table with complete metadata.

**Key Capabilities:**
- Fetches full movie details from TMDB API (title, genres, runtime, MPAA rating, language, release date, overview, posters)
- Stores up to 10 genre IDs per movie
- Detects TMDB ID reuse (when invalid movies are replaced) and cleans up old data
- Updates existing movies with fresh TMDB data
- Automatically triggered when users add to watchlist or rate movies

**Code Locations:**
- **Helper Function:** `server.js:108-247` - `ensureMovieInDatabase(movie_id)`
- **Title Similarity Check:** `server.js:109-128` - `titlesDifferSignificantly(title1, title2)`
- **ID Reuse Detection:** `server.js:163-193` - Compares title and release year to detect reused IDs
- **Called From:**
  - `/api/watchlist/add` endpoint: `server.js:502`
  - `/add-movie/:movie_id` endpoint: `server.js:947`
  - `/api/movie/:movie_id` endpoint: `server.js:874`

**Database Table:**
- Table: `all_movies`
- Columns: movie_id, movie_title, movie_runtime, mpaa_rating, movie_language, movie_release_date, poster_path, poster_full_url, adult_01, movie_overview, genre_01 through genre_10

---

## Popcorn Kernels

**Description:**
A gamification system that rewards users with points (popcorn kernels) for engaging with the platform. Users earn kernels by rating movies and writing reviews.

**Earning Rules:**
- **+1 kernel** for rating a movie
- **+5 additional kernels** (total +6) for writing a review
- **-1 kernel** when moving a rated movie to watchlist (no review)
- **-6 kernels** when moving a reviewed movie to watchlist

**Code Locations:**
- **Add Movie/Rate:** `server.js:965-976` - Calculates kernels when adding to watched_list
- **Update Review:** `server.js:1028-1055` - Adjusts kernels when adding/removing reviews on updates
- **Move to Watchlist:** `server.js:567-586` - Subtracts kernels when moving from watched to watchlist
- **Display:**
  - Dashboard: Shows user's total kernel count
  - Profile pages: Displays kernels for user profiles

**Database:**
- Table: `users`
- Column: `popcorn_kernels` (INT)
- Default value: 0
- Uses `GREATEST(0, popcorn_kernels - amount)` to prevent negative values

---

## Watched List

**Description:**
A comprehensive log of all movies a user has watched, with ratings and optional reviews. Users can track their viewing history, rate movies on a 0-10 scale, and write detailed reviews.

**Features:**
- Rate movies from 0.0 to 10.0 (one decimal precision)
- Write optional text reviews
- Edit ratings and reviews after submission
- Delete entries from watched history
- Filter by ratings, activity, year, and alphabetically
- Visual "Watched" badge on movie cards in search results
- Automatic removal from watchlist when movie is rated

**Code Locations:**
- **Page Route:** `server.js:271` - `/watched` route
- **Page File:** `views/watched.html`
- **JavaScript:** `public/js/watched.js`
- **API Endpoints:**
  - GET `/api/watched` - Fetch user's watched movies: `server.js:345-363`
  - GET `/api/watched/:watched_id` - Get single entry for editing: `server.js:366-391`
  - POST `/add-movie/:movie_id` - Add movie to watched list: `server.js:940-985`
  - POST `/update-movie/:watched_id` - Update existing entry: `server.js:988-1058`
  - POST `/delete-movie/:watched_id` - Delete entry: `server.js:1061-1109`

**Database:**
- Table: `watched_list`
- Columns: watched_id (PK), user_id, movie_id, user_rating, review, memory, watched_date, in_theater, recommend, rewatch_qty

**UI Components:**
- Rating slider (0.0 - 10.0)
- Review textarea
- Filter dropdown with multiple sort options
- Edit and delete buttons per entry
- Entry numbers showing chronological order

---

## Watchlist

**Description:**
A personal queue of movies users want to watch. Supports priority flagging, filtering, and easy management. Movies can be added from search results, moved from watched list, or removed when rated.

**Features:**
- Add movies from search results with green "✓ In Watchlist" indicator
- Priority toggle (star button) for high-priority movies
- Red "HIGH PRIORITY" badge on priority movies
- Click movie → opens rate page
- Automatically removed when movie is rated
- Filter by priority, activity, year, and alphabetically
- Entry numbers showing when movies were added
- Move watched movies back to watchlist (with confirmation)

**Code Locations:**
- **Page Route:** `server.js:306` - `/watchlist` route
- **Page File:** `views/watchlist.html`
- **JavaScript:** `public/js/watchlist.js`
- **API Endpoints:**
  - GET `/api/watchlist` - Fetch user's watchlist: `server.js:487-489`
  - POST `/api/watchlist/add` - Add movie to watchlist: `server.js:492-539`
  - POST `/api/watchlist/move-from-watched` - Move from watched to watchlist: `server.js:542-625`
  - GET `/api/watchlist/check/:movie_id` - Check if movie in watchlist: `server.js:628-641`
  - PATCH `/api/watchlist/:watch_list_id/priority` - Toggle priority: `server.js:644-664`
  - DELETE `/api/watchlist/:movie_id` - Remove from watchlist: `server.js:794-809`

**Database:**
- Table: `watch_list`
- Columns: watch_list_id (PK), user_id, movie_id, priority_01 (0 or 1), notes, added_date

**UI Components:**
- Priority star button (appears on hover)
- Red priority badge banner
- Filter dropdown with priority-first default
- Green watchlist button in search results
- Entry numbers (chronological order)
- Clickable cards linking to rate page

**Integration Points:**
- Search page: `views/add_movies.html` - Shows green button if in watchlist
- Search JavaScript: `public/js/add_movies.js:143-223` - Toggle add/remove functionality
- Rate page: `views/rate_movie.html:485-605` - Add/remove button with redirect
- Add movie: `server.js:960-963` - Auto-removes from watchlist when rated

---

## User Search

**Description:**
A social discovery feature that allows users to search for other users by username and manage follow relationships. Integrated into the main search page with a tab-based interface for switching between movie and user searches.

**Features:**
- Fuzzy search by username using ILIKE pattern matching
- Real-time search with 300ms debounce
- Displays user profile pictures, display names (@username format)
- Shows current follow status for each user
- One-click follow/unfollow toggle
- Excludes current user from search results
- Tab-based interface: Movies / Users / Cast & Crew (coming soon)
- Auto-updates button state after follow/unfollow actions 
- Limit of 50 search results

**Code Locations:**
- **Page Route:** Integrated into search page at `server.js:306` - `/add-movie` route
- **Page File:** `views/add_movies.html:723-726` - Search type tabs
- **JavaScript:** `public/js/add_movies.js`
  - Tab switching: Lines 16-46
  - User result rendering: Lines 96-135
  - Search logic: Lines 140-176
  - Follow/unfollow toggle: Lines 191-218
- **API Endpoints:**
  - GET `/api/search-users` - Search users by username: `server.js:1036-1072`
  - POST `/api/user/follow/:user_id` - Follow a user: `server.js:1324-1346`
  - POST `/api/user/unfollow/:user_id` - Unfollow a user: `server.js:1349-1365`

**Database:**
- Table: `users`
- Search columns: username, display_name, profile_picture
- Table: `user_follows`
- Columns: follower_id (FK to users), following_id (FK to users), followed_at (timestamp)
- Primary Key: (follower_id, following_id) - composite key prevents duplicate follows

**UI Components:**
- Search type tabs with active state indicator
- User result cards with horizontal layout
- Circular profile pictures (60px) with border
- Display name (large, bold) and @username (smaller, gray)
- Follow/Unfollow button with state-based styling
- Default TrueReview logo for users without profile pictures
- Responsive grid layout (full-width cards in results list)

**Implementation Details:**
- Uses simple ILIKE search (no PostgreSQL extensions required)
- Search pattern: `%query%` for partial matching
- Prevents self-following with validation check
- Uses `ON CONFLICT DO NOTHING` to prevent duplicate follows
- Follow status checked via EXISTS subquery in search results
- Button state managed via data attributes (data-following, data-user-id)

---
