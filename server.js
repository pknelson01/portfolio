// ============================================================================
//  SERVER.JS — TrueReview (HTML VERSION, NO EJS)
// ============================================================================

import express from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import path from "path";
import multer from "multer";
import pg from "pg";
import bcrypt from "bcrypt";
import fetch from "node-fetch";
import { fileURLToPath } from "url";

// ----------------------------------------------------
// Path Fix (ESM)
// ----------------------------------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ----------------------------------------------------
// TMDb API Configuration
// ----------------------------------------------------
const TMDB_API_KEY = process.env.TMDB_API_KEY;

// ----------------------------------------------------
// Express Setup
// ----------------------------------------------------
const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// ----------------------------------------------------
// Static Files
// ----------------------------------------------------
app.use("/public", express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use("/views", express.static(path.join(__dirname, "views")));
app.use("/TrueReview_logo", express.static(path.join(__dirname, "TrueReview_logo")));

// ----------------------------------------------------
// PostgreSQL Setup
// ----------------------------------------------------

const db = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// ----------------------------------------------------
// Sessions
// ----------------------------------------------------
const PgSession = connectPgSimple(session);

app.set("trust proxy", 1);

app.use(
  session({
    store: new PgSession({
      pool: db,
      tableName: "session",
    }),
    secret: process.env.SESSION_SECRET || "truereview_fallback_secret_123",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 24 * 7,
    },
  })
);

// ----------------------------------------------------
// Multer (File Uploads)
// ----------------------------------------------------
const profilePicStorage = multer.diskStorage({
  destination: "./uploads/profile_pictures",
  filename: (req, file, cb) => {
    cb(
      null,
      `pfp_${req.session.user_id}_${Date.now()}${path.extname(
        file.originalname
      )}`
    );
  },
});

const backgroundStorage = multer.diskStorage({
  destination: "./uploads/profile_backgrounds",
  filename: (req, file, cb) => {
    cb(
      null,
      `bg_${req.session.user_id}_${Date.now()}${path.extname(
        file.originalname
      )}`
    );
  },
});

const uploadProfilePic = multer({ storage: profilePicStorage });
const uploadBackground = multer({ storage: backgroundStorage });

// ----------------------------------------------------
// Auth Middleware
// ----------------------------------------------------
function requireLogin(req, res, next) {
  if (!req.session.user_id) return res.redirect("/login");
  next();
}

// ----------------------------------------------------
// Email Validation Function
// ----------------------------------------------------
function isValidEmail(email) {
  return email && email.includes("@") && email.includes(".com");
}

// ----------------------------------------------------
// Helper Function: Ensure Movie Exists in Database
// ----------------------------------------------------
// Helper function to check if titles are significantly different
function titlesDifferSignificantly(title1, title2) {
  if (!title1 || !title2) return false;

  // Normalize titles: lowercase, remove punctuation, split into words
  const normalize = (str) => str.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(w => w.length > 0);
  const words1 = normalize(title1);
  const words2 = normalize(title2);

  // Calculate word overlap
  const set1 = new Set(words1);
  const set2 = new Set(words2);
  const intersection = new Set([...set1].filter(w => set2.has(w)));
  const union = new Set([...set1, ...set2]);

  // Jaccard similarity: intersection / union
  const similarity = intersection.size / union.size;

  // Consider significantly different if less than 50% overlap
  return similarity < 0.5;
}

async function ensureMovieInDatabase(movie_id) {
  try {
    // Check if movie already exists
    const checkSql = `SELECT movie_id, movie_title, movie_release_date FROM all_movies WHERE movie_id = $1`;
    const existing = await db.query(checkSql, [movie_id]);

    const movieExists = existing.rows.length > 0;
    const oldTitle = movieExists ? existing.rows[0].movie_title : null;
    const oldReleaseDate = movieExists ? existing.rows[0].movie_release_date : null;

    if (movieExists) {
      console.log(`[MOVIE DB] Movie ${movie_id} exists in database (${oldTitle}), will fetch fresh TMDB data...`);
    } else {
      console.log(`[MOVIE DB] Movie ${movie_id} not found, fetching from TMDB...`);
    }

    // Always fetch fresh movie details from TMDB
    const movieUrl = `https://api.themoviedb.org/3/movie/${movie_id}?api_key=${TMDB_API_KEY}`;
    const movieResponse = await fetch(movieUrl);

    if (!movieResponse.ok) {
      console.error(`[MOVIE DB] Failed to fetch movie ${movie_id} from TMDB - Status: ${movieResponse.status}`);
      // If movie exists in DB and TMDB fails, keep existing data
      if (movieExists) {
        console.log(`[MOVIE DB] Keeping existing data for movie ${movie_id}`);
        return true;
      }
      return false;
    }

    const movieData = await movieResponse.json();
    console.log(`[MOVIE DB] Received movie data from TMDB: ${movieData.title}`);

    // Check if this is a TMDB ID reuse (invalid movie replaced with new movie)
    if (movieExists) {
      const newTitle = movieData.title;
      const newReleaseDate = movieData.release_date;

      // Check if title changed significantly
      const titleChanged = titlesDifferSignificantly(oldTitle, newTitle);

      // Check if release year changed by more than 1 year
      let yearChanged = false;
      if (oldReleaseDate && newReleaseDate) {
        const oldYear = new Date(oldReleaseDate).getFullYear();
        const newYear = new Date(newReleaseDate).getFullYear();
        yearChanged = Math.abs(oldYear - newYear) > 1;
      }

      // If both title and year changed significantly, TMDB likely reused the ID
      if (titleChanged && yearChanged) {
        console.log(`[MOVIE DB] ⚠️  TMDB ID REUSE DETECTED for ${movie_id}!`);
        console.log(`[MOVIE DB] Old: "${oldTitle}" (${oldReleaseDate})`);
        console.log(`[MOVIE DB] New: "${movieData.title}" (${movieData.release_date})`);
        console.log(`[MOVIE DB] Deleting old movie from all users' lists...`);

        // Delete from all tables (this will cascade to watched_list and watch_list if foreign keys are set)
        await db.query('DELETE FROM watched_list WHERE movie_id = $1', [movie_id]);
        await db.query('DELETE FROM watch_list WHERE movie_id = $1', [movie_id]);
        await db.query('DELETE FROM all_movies WHERE movie_id = $1', [movie_id]);

        console.log(`[MOVIE DB] Old movie deleted. Inserting new movie data...`);
      }
    }

    // Fetch release dates for MPAA rating (US certification)
    const releasesUrl = `https://api.themoviedb.org/3/movie/${movie_id}/release_dates?api_key=${TMDB_API_KEY}`;
    const releasesResponse = await fetch(releasesUrl);
    let mpaaRating = null;

    if (releasesResponse.ok) {
      const releasesData = await releasesResponse.json();
      const usRelease = releasesData.results.find(r => r.iso_3166_1 === 'US');
      if (usRelease && usRelease.release_dates && usRelease.release_dates.length > 0) {
        mpaaRating = usRelease.release_dates[0].certification || null;
      }
    }

    // Extract and format data
    const posterPath = movieData.poster_path || null;
    const posterFullUrl = posterPath ? `https://image.tmdb.org/t/p/w500${posterPath}` : null;
    const runtime = movieData.runtime ?? 0; // Use 0 if null/undefined (0 is valid for unreleased movies)
    const language = movieData.original_language || null;
    const releaseDate = movieData.release_date || null;
    const adult = movieData.adult ? 1 : 0;
    const overview = movieData.overview || null;

    // Extract up to 10 genre IDs
    const genreIds = movieData.genres ? movieData.genres.map(g => g.id) : [];
    const genre_01 = genreIds[0] || null;
    const genre_02 = genreIds[1] || null;
    const genre_03 = genreIds[2] || null;
    const genre_04 = genreIds[3] || null;
    const genre_05 = genreIds[4] || null;
    const genre_06 = genreIds[5] || null;
    const genre_07 = genreIds[6] || null;
    const genre_08 = genreIds[7] || null;
    const genre_09 = genreIds[8] || null;
    const genre_10 = genreIds[9] || null;

    // Insert or update in all_movies
    const upsertSql = `
      INSERT INTO all_movies (
        movie_id, movie_title, movie_runtime, mpaa_rating, movie_language, movie_release_date,
        poster_path, poster_full_url, adult_01, movie_overview,
        genre_01, genre_02, genre_03, genre_04, genre_05,
        genre_06, genre_07, genre_08, genre_09, genre_10
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
      ON CONFLICT (movie_id) DO UPDATE SET
        movie_title = EXCLUDED.movie_title,
        movie_runtime = EXCLUDED.movie_runtime,
        mpaa_rating = EXCLUDED.mpaa_rating,
        movie_language = EXCLUDED.movie_language,
        movie_release_date = EXCLUDED.movie_release_date,
        poster_path = EXCLUDED.poster_path,
        poster_full_url = EXCLUDED.poster_full_url,
        adult_01 = EXCLUDED.adult_01,
        movie_overview = EXCLUDED.movie_overview,
        genre_01 = EXCLUDED.genre_01,
        genre_02 = EXCLUDED.genre_02,
        genre_03 = EXCLUDED.genre_03,
        genre_04 = EXCLUDED.genre_04,
        genre_05 = EXCLUDED.genre_05,
        genre_06 = EXCLUDED.genre_06,
        genre_07 = EXCLUDED.genre_07,
        genre_08 = EXCLUDED.genre_08,
        genre_09 = EXCLUDED.genre_09,
        genre_10 = EXCLUDED.genre_10
    `;

    await db.query(upsertSql, [
      movieData.id,
      movieData.title,
      runtime,
      mpaaRating,
      language,
      releaseDate,
      posterPath,
      posterFullUrl,
      adult,
      overview,
      genre_01,
      genre_02,
      genre_03,
      genre_04,
      genre_05,
      genre_06,
      genre_07,
      genre_08,
      genre_09,
      genre_10
    ]);

    // Determine if this was an ID reuse scenario
    const wasIdReuse = movieExists && titlesDifferSignificantly(oldTitle, movieData.title) &&
      oldReleaseDate && movieData.release_date &&
      Math.abs(new Date(oldReleaseDate).getFullYear() - new Date(movieData.release_date).getFullYear()) > 1;

    if (wasIdReuse) {
      console.log(`[MOVIE DB] ✅ Movie ${movie_id} (${movieData.title}) successfully added after ID reuse cleanup`);
    } else if (movieExists && oldTitle !== movieData.title) {
      console.log(`[MOVIE DB] Movie ${movie_id} UPDATED: "${oldTitle}" → "${movieData.title}"`);
    } else if (movieExists) {
      console.log(`[MOVIE DB] Movie ${movie_id} (${movieData.title}) refreshed with latest data`);
    } else {
      console.log(`[MOVIE DB] Movie ${movie_id} (${movieData.title}) successfully added to database`);
    }

    const genreIdsStr = genreIds.length > 0 ? genreIds.join(', ') : 'None';
    console.log(`[MOVIE DB] Details - Genres: [${genreIdsStr}], Runtime: ${runtime}, MPAA: ${mpaaRating}, Language: ${language}`);
    return true;

  } catch (error) {
    console.error(`[MOVIE DB] Error ensuring movie ${movie_id} in database:`, error);
    console.error(`[MOVIE DB] Error stack:`, error.stack);
    return false;
  }
}

// ============================================================================
// ROUTES — HTML PAGES
// ============================================================================

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "views/index.html"));
});

app.get("/login", (req, res) => {
  res.sendFile(path.join(__dirname, "views/login.html"));
});

app.get("/signup", (req, res) => {
  res.sendFile(path.join(__dirname, "views/signup.html"));
});

// SIGNUP - CREATE NEW ACCOUNT
app.post("/signup", async (req, res) => {
  const { username, display_name, email, password } = req.body;

  // Validate email format
  if (!isValidEmail(email)) {
    return res.redirect("/signup?error=invalid_email");
  }

  // Validate username (no spaces, alphanumeric, max 20)
  const usernameRegex = /^[a-zA-Z0-9]{1,20}$/;
  if (!usernameRegex.test(username)) {
    return res.redirect("/signup?error=invalid_username");
  }

  // Validate display_name (letters and numbers only, max 20)
  const displayNameRegex = /^[a-zA-Z0-9]{1,20}$/;
  if (!display_name || !displayNameRegex.test(display_name)) {
    return res.redirect("/signup?error=invalid_display_name");
  }

  try {
    // Check if email already exists
    const emailCheck = await db.query("SELECT * FROM users WHERE email = $1", [email]);
    if (emailCheck.rows.length > 0) {
      return res.redirect("/signup?error=email_exists");
    }

    // Check if username already exists
    const usernameCheck = await db.query("SELECT * FROM users WHERE username = $1", [username]);
    if (usernameCheck.rows.length > 0) {
      return res.redirect("/signup?error=username_exists");
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert new user with display_name
    const sql = `
      INSERT INTO users (username, display_name, email, password)
      VALUES ($1, $2, $3, $4)
      RETURNING user_id
    `;
    const result = await db.query(sql, [username, display_name, email, hashedPassword]);

    // Log the user in
    req.session.user_id = result.rows[0].user_id;
    res.redirect("/welcome");
  } catch (error) {
    console.error("Signup error:", error);
    res.redirect("/signup?error=server_error");
  }
});

// LOGIN USING EMAIL + PASSWORD
app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  // Validate email format
  if (!isValidEmail(email)) {
    return res.redirect("/login?error=invalid_email");
  }

  // Query user by email only
  const sql = `
    SELECT * FROM users
    WHERE email = $1
  `;

  const result = await db.query(sql, [email]);

  if (result.rows.length === 0) {
    return res.redirect("/login?error=1");
  }

  const user = result.rows[0];

  // Compare hashed password
  const passwordMatch = await bcrypt.compare(password, user.password);

  if (!passwordMatch) {
    return res.redirect("/login?error=1");
  }

  req.session.user_id = user.user_id;
  console.log(`[LOGIN] User logged in - ID: ${user.user_id}, Username: ${user.username}, Email: ${email}`);
  res.redirect("/welcome");
});

app.post("/logout", (req, res) => {
  const user_id = req.session.user_id;
  console.log(`[LOGOUT] User logged out - ID: ${user_id}`);
  req.session.destroy(() => res.redirect("/"));
});

app.get("/welcome", requireLogin, (req, res) => {
  res.sendFile(path.join(__dirname, "views/welcome.html"));
});

app.get("/dashboard", requireLogin, (req, res) => {
  res.sendFile(path.join(__dirname, "views/dashboard.html"));
});

app.get("/watched", requireLogin, (req, res) => {
  res.sendFile(path.join(__dirname, "views/watched.html"));
});

app.get("/watchlist", requireLogin, (req, res) => {
  res.sendFile(path.join(__dirname, "views/watchlist.html"));
});

app.get("/edit-profile", requireLogin, (req, res) => {
  res.sendFile(path.join(__dirname, "views/edit_profile.html"));
});

app.get("/change-password", requireLogin, (req, res) => {
  res.sendFile(path.join(__dirname, "views/change_password.html"));
});

app.get("/rate-movie/:movie_id", requireLogin, (req, res) => {
  res.sendFile(path.join(__dirname, "views/rate_movie.html"));
});

app.get("/update-movie/:watched_id", requireLogin, (req, res) => {
  res.sendFile(path.join(__dirname, "views/update_movie.html"));
});

app.get("/quiz", (req, res) => {
  res.sendFile(path.join(__dirname, "views/quiz.html"));
});

// ============================================================================
// API — DASHBOARD DATA
// ============================================================================
// Get username and display_name (for header tab) - doesn't update popcorn kernels session
app.get("/api/user/username", requireLogin, async (req, res) => {
  const user_id = req.session.user_id;
  const result = await db.query("SELECT username, display_name FROM users WHERE user_id = $1", [user_id]);
  res.json({
    username: result.rows[0].username,
    display_name: result.rows[0].display_name
  });
});

app.get("/api/dashboard", requireLogin, async (req, res) => {
  const user_id = req.session.user_id;

  const userQ = `
    SELECT user_id, username, display_name, title, bio, profile_picture, profile_background_photo, favorite_movie, popcorn_kernels
    FROM users WHERE user_id = $1
  `;
  const user = (await db.query(userQ, [user_id])).rows[0];

  // Calculate popcorn kernels delta
  const currentKernels = user.popcorn_kernels || 0;
  const lastViewedKernels = req.session.last_viewed_popcorn_kernels || currentKernels;
  const kernelsDelta = currentKernels - lastViewedKernels;

  // Update session with current value for next visit
  req.session.last_viewed_popcorn_kernels = currentKernels;

  const followQ = `
    SELECT
      (SELECT COUNT(*) FROM user_follows WHERE following_id = $1) AS follower_count,
      (SELECT COUNT(*) FROM user_follows WHERE follower_id = $1) AS following_count
  `;
  const follow = (await db.query(followQ, [user_id])).rows[0] || {
    follower_count: 0,
    following_count: 0,
  };

  // Calculate follower/following deltas
  const currentFollowerCount = parseInt(follow.follower_count) || 0;
  const currentFollowingCount = parseInt(follow.following_count) || 0;
  const lastViewedFollowerCount = req.session.last_viewed_follower_count || currentFollowerCount;
  const lastViewedFollowingCount = req.session.last_viewed_following_count || currentFollowingCount;
  const followerDelta = currentFollowerCount - lastViewedFollowerCount;
  const followingDelta = currentFollowingCount - lastViewedFollowingCount;

  // Only update session if not a polling request
  const updateSession = req.query.updateSession !== 'false';
  if (updateSession) {
    req.session.last_viewed_follower_count = currentFollowerCount;
    req.session.last_viewed_following_count = currentFollowingCount;
  }

  const statsQ = `
    SELECT COUNT(*) AS total_movies,
           ROUND(AVG(user_rating)::numeric, 2) AS avg_rating,
           COUNT(CASE WHEN user_rating::numeric = 10.0 THEN 1 END) AS ten_star_count
    FROM watched_list
    WHERE user_id = $1
  `;
  const stats = (await db.query(statsQ, [user_id])).rows[0];

  // Calculate 10/10 rating delta
  const currentTenStarCount = parseInt(stats.ten_star_count) || 0;
  const lastViewedTenStarCount = req.session.last_viewed_ten_star_count || currentTenStarCount;
  const tenStarDelta = currentTenStarCount - lastViewedTenStarCount;

  // Update session with current value for next visit
  req.session.last_viewed_ten_star_count = currentTenStarCount;

  const favQ = `
    SELECT wl.watched_id, wl.user_rating, am.movie_title, am.poster_full_url
    FROM users u
    JOIN watched_list wl ON u.user_id = wl.user_id
    JOIN all_movies am ON am.movie_id = wl.movie_id
    WHERE u.user_id = $1
    AND wl.movie_id = u.favorite_movie
  `;
  const fav = await db.query(favQ, [user_id]);
  const favorite = fav.rows.length ? fav.rows[0] : null;

  const lastQ = `
    SELECT wl.watched_id, wl.user_rating, am.movie_title, am.poster_full_url
    FROM watched_list wl
    JOIN all_movies am ON wl.movie_id = am.movie_id
    WHERE wl.user_id = $1
    ORDER BY wl.watched_id DESC LIMIT 1
  `;
  const last = (await db.query(lastQ, [user_id])).rows[0];

  res.json({
    user,
    follower_count: follow.follower_count,
    following_count: follow.following_count,
    follower_delta: followerDelta,
    following_delta: followingDelta,
    total_movies: stats.total_movies,
    avg_rating: stats.avg_rating,
    ten_star_count: stats.ten_star_count,
    ten_star_delta: tenStarDelta,
    favorite,
    last,
    popcorn_kernels_delta: kernelsDelta,
  });
});

// ============================================================================
// API — WATCHED LIST DATA
// ============================================================================
app.get("/api/watched", requireLogin, async (req, res) => {
  const user_id = req.session.user_id;

  const sql = `
    SELECT wl.watched_id, wl.user_rating, am.movie_id, am.movie_title, am.poster_full_url, am.movie_release_date
    FROM watched_list wl
    JOIN all_movies am ON wl.movie_id = am.movie_id
    WHERE wl.user_id = $1
    ORDER BY wl.watched_id DESC
  `;

  const result = await db.query(sql, [user_id]);
  res.json(result.rows);
});

// Get single watched entry by ID
app.get("/api/watched/:watched_id", requireLogin, async (req, res) => {
  const user_id = req.session.user_id;
  const watched_id = req.params.watched_id;

  const sql = `
    SELECT wl.watched_id, wl.user_rating, wl.review,
           am.movie_id, am.movie_title, am.poster_full_url, am.movie_release_date
    FROM watched_list wl
    JOIN all_movies am ON wl.movie_id = am.movie_id
    WHERE wl.user_id = $1 AND wl.watched_id = $2
  `;

  const result = await db.query(sql, [user_id, watched_id]);

  if (result.rows.length === 0) {
    return res.status(404).json({ error: "Watched entry not found" });
  }

  const data = result.rows[0];
  const releaseDate = new Date(data.movie_release_date);

  res.json({
    ...data,
    releaseYear: releaseDate.getFullYear()
  });
});

// ============================================================================
// API — WATCHLIST DATA
// ============================================================================
app.get("/api/watchlist", requireLogin, async (req, res) => {
  const user_id = req.session.user_id;

  const sql = `
    SELECT wl.watch_list_id, wl.priority_01, wl.notes, wl.added_date,
           am.movie_id, am.movie_title, am.poster_full_url, am.movie_release_date
    FROM watch_list wl
    JOIN all_movies am ON wl.movie_id = am.movie_id
    WHERE wl.user_id = $1
    ORDER BY wl.added_date DESC
  `;

  const result = await db.query(sql, [user_id]);
  res.json(result.rows);
});

// Add movie to watchlist
app.post("/api/watchlist/add", requireLogin, async (req, res) => {
  const user_id = req.session.user_id;
  const { movie_id, priority_01, notes } = req.body;

  if (!movie_id) {
    return res.status(400).json({ error: "movie_id is required" });
  }

  try {
    // Ensure movie exists in all_movies table
    const movieAdded = await ensureMovieInDatabase(movie_id);
    if (!movieAdded) {
      return res.status(500).json({ error: "Failed to fetch movie data" });
    }

    // Check if movie already exists in watchlist
    const checkSql = `
      SELECT watch_list_id FROM watch_list
      WHERE user_id = $1 AND movie_id = $2
    `;
    const existing = await db.query(checkSql, [user_id, movie_id]);

    if (existing.rows.length > 0) {
      return res.status(400).json({ error: "Movie already in watchlist" });
    }

    // Add to watchlist
    const insertSql = `
      INSERT INTO watch_list (user_id, movie_id, priority_01, notes)
      VALUES ($1, $2, $3, $4)
      RETURNING watch_list_id
    `;
    const result = await db.query(insertSql, [
      user_id,
      movie_id,
      priority_01 || 0,
      notes || null
    ]);

    res.json({
      success: true,
      watch_list_id: result.rows[0].watch_list_id
    });
  } catch (err) {
    console.error("Error adding to watchlist:", err);
    res.status(500).json({ error: "Failed to add to watchlist" });
  }
});

// Move movie from watched list to watchlist
app.post("/api/watchlist/move-from-watched", requireLogin, async (req, res) => {
  const user_id = req.session.user_id;
  const { watched_id, movie_id } = req.body;

  console.log("[MOVE TO WATCHLIST] Request received:", { user_id, watched_id, movie_id });

  if (!watched_id || !movie_id) {
    console.log("[MOVE TO WATCHLIST] Missing parameters");
    return res.status(400).json({ error: "watched_id and movie_id are required" });
  }

  try {
    // Start a transaction
    await db.query("BEGIN");
    console.log("[MOVE TO WATCHLIST] Transaction started");

    // First, get the watched entry to check if it has a review
    const getEntrySql = `
      SELECT review FROM watched_list
      WHERE watched_id = $1 AND user_id = $2
    `;
    const entryResult = await db.query(getEntrySql, [watched_id, user_id]);

    if (entryResult.rows.length === 0) {
      await db.query("ROLLBACK");
      console.log("[MOVE TO WATCHLIST] No entry found, rolling back");
      return res.status(404).json({ error: "Watched entry not found" });
    }

    const hasReview = entryResult.rows[0].review && entryResult.rows[0].review.trim() !== '';
    const pointsToSubtract = hasReview ? 6 : 1;
    console.log("[MOVE TO WATCHLIST] Has review:", hasReview, "Points to subtract:", pointsToSubtract);

    // Delete from watched_list
    const deleteSql = `
      DELETE FROM watched_list
      WHERE watched_id = $1 AND user_id = $2
    `;
    console.log("[MOVE TO WATCHLIST] Deleting from watched_list:", { watched_id, user_id });
    const deleteResult = await db.query(deleteSql, [watched_id, user_id]);
    console.log("[MOVE TO WATCHLIST] Delete result:", deleteResult.rowCount, "rows deleted");

    // Update popcorn_kernels
    const updateKernelsSql = `
      UPDATE users
      SET popcorn_kernels = GREATEST(0, popcorn_kernels - $1)
      WHERE user_id = $2
    `;
    await db.query(updateKernelsSql, [pointsToSubtract, user_id]);
    console.log("[MOVE TO WATCHLIST] Updated popcorn_kernels, subtracted:", pointsToSubtract);

    // Check if movie already exists in watchlist
    const checkSql = `
      SELECT watch_list_id FROM watch_list
      WHERE user_id = $1 AND movie_id = $2
    `;
    const existing = await db.query(checkSql, [user_id, movie_id]);
    console.log("[MOVE TO WATCHLIST] Existing watchlist entries:", existing.rows.length);

    if (existing.rows.length === 0) {
      // Add to watchlist
      const insertSql = `
        INSERT INTO watch_list (user_id, movie_id, priority_01)
        VALUES ($1, $2, 0)
        RETURNING watch_list_id
      `;
      console.log("[MOVE TO WATCHLIST] Adding to watchlist");
      const insertResult = await db.query(insertSql, [user_id, movie_id]);
      console.log("[MOVE TO WATCHLIST] Inserted with ID:", insertResult.rows[0].watch_list_id);
    } else {
      console.log("[MOVE TO WATCHLIST] Movie already in watchlist, skipping insert");
    }

    // Commit the transaction
    await db.query("COMMIT");
    console.log("[MOVE TO WATCHLIST] Transaction committed successfully");

    res.json({ success: true });
  } catch (err) {
    await db.query("ROLLBACK");
    console.error("[MOVE TO WATCHLIST] Error:", err);
    res.status(500).json({ error: "Failed to move to watchlist", details: err.message });
  }
});

// Check if movie is in watchlist
app.get("/api/watchlist/check/:movie_id", requireLogin, async (req, res) => {
  const user_id = req.session.user_id;
  const { movie_id } = req.params;

  try {
    const sql = `
      SELECT watch_list_id FROM watch_list
      WHERE user_id = $1 AND movie_id = $2
    `;
    const result = await db.query(sql, [user_id, movie_id]);
    res.json({ inWatchlist: result.rows.length > 0 });
  } catch (err) {
    console.error("Error checking watchlist:", err);
    res.status(500).json({ error: "Failed to check watchlist" });
  }
});

// Update watchlist priority
app.patch("/api/watchlist/:watch_list_id/priority", requireLogin, async (req, res) => {
  const user_id = req.session.user_id;
  const { watch_list_id } = req.params;
  const { priority_01 } = req.body;

  if (priority_01 === undefined) {
    return res.status(400).json({ error: "priority_01 is required" });
  }

  try {
    const sql = `
      UPDATE watch_list
      SET priority_01 = $1
      WHERE watch_list_id = $2 AND user_id = $3
    `;
    await db.query(sql, [priority_01, watch_list_id, user_id]);
    res.json({ success: true });
  } catch (err) {
    console.error("Error updating priority:", err);
    res.status(500).json({ error: "Failed to update priority" });
  }
});

// Remove from watchlist
app.delete("/api/watchlist/:movie_id", requireLogin, async (req, res) => {
  const user_id = req.session.user_id;
  const { movie_id } = req.params;

  try {
    const sql = `
      DELETE FROM watch_list
      WHERE user_id = $1 AND movie_id = $2
    `;
    await db.query(sql, [user_id, movie_id]);
    res.json({ success: true });
  } catch (err) {
    console.error("Error removing from watchlist:", err);
    res.status(500).json({ error: "Failed to remove from watchlist" });
  }
});

// ============================================================================
// ⭐⭐⭐ PROFILE IMAGE UPLOAD ROUTES
// ============================================================================

/* ---------------- PROFILE PICTURE ---------------- */
app.post("/api/upload/profile-picture", requireLogin, uploadProfilePic.single("file"), async (req, res) => {
  const user_id = req.session.user_id;
  const filename = req.file.filename;

  await db.query(
    `UPDATE users SET profile_picture = $1 WHERE user_id = $2`,
    [filename, user_id]
  );

  res.json({ success: true, filename });
});

/* ---------------- BACKGROUND PHOTO ---------------- */
app.post("/api/upload/background", requireLogin, uploadBackground.single("file"), async (req, res) => {
  const user_id = req.session.user_id;
  const filename = req.file.filename;

  await db.query(
    `UPDATE users SET profile_background_photo = $1 WHERE user_id = $2`,
    [filename, user_id]
  );

  res.json({ success: true, filename });
});

// ============================================================================
// PROFILE UPDATE
// ============================================================================

app.post("/update-profile", requireLogin, async (req, res) => {
  const user_id = req.session.user_id;
  const { username, display_name, title, bio, favorite_movie } = req.body;

  // Validate display_name if provided
  if (display_name) {
    const displayNameRegex = /^[a-zA-Z0-9]{1,20}$/;
    if (!displayNameRegex.test(display_name)) {
      return res.redirect("/edit-profile?error=invalid_display_name");
    }
  }

  const sql = `
    UPDATE users
    SET username = $1, display_name = $2, title = $3, bio = $4, favorite_movie = $5
    WHERE user_id = $6
  `;

  await db.query(sql, [
    username,
    display_name || username,
    title || null,
    bio || null,
    favorite_movie || null,
    user_id
  ]);

  res.redirect("/dashboard");
});

// CHANGE PASSWORD
app.post("/change-password", requireLogin, async (req, res) => {
  const user_id = req.session.user_id;
  const { currentPassword, newPassword } = req.body;

  try {
    // Get current user's hashed password
    const result = await db.query("SELECT password FROM users WHERE user_id = $1", [user_id]);

    if (result.rows.length === 0) {
      return res.redirect("/change-password?error=server_error");
    }

    const user = result.rows[0];

    // Verify current password
    const passwordMatch = await bcrypt.compare(currentPassword, user.password);

    if (!passwordMatch) {
      return res.redirect("/change-password?error=wrong_password");
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password in database
    await db.query(
      "UPDATE users SET password = $1 WHERE user_id = $2",
      [hashedPassword, user_id]
    );

    res.redirect("/change-password?success=1");
  } catch (error) {
    console.error("Change password error:", error);
    res.redirect("/change-password?error=server_error");
  }
});

// ============================================================================
// MOVIES
// ============================================================================

// Serve Add Movie Page
app.get("/add-movie", requireLogin, (req, res) => {
  res.sendFile(path.join(__dirname, "views/add_movies.html"));
});

// Serve Search Page (same as add movie)
app.get("/search", requireLogin, (req, res) => {
  res.sendFile(path.join(__dirname, "views/add_movies.html"));
});

// SEARCH MOVIES - Using TMDb API
app.get("/api/search-movies", requireLogin, async (req, res) => {
  const q = req.query.q || "";
  const user_id = req.session.user_id;

  // If query is empty, return empty results
  if (!q.trim()) {
    return res.json([]);
  }

  try {
    // Call TMDb search API
    const tmdbUrl = `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(q)}&include_adult=false`;
    const response = await fetch(tmdbUrl);
    const data = await response.json();

    // Transform TMDb results to match our format
    // Filter out movies without posters and adult content
    const movies = data.results
      .filter((movie) => movie.poster_path && !movie.adult)
      .slice(0, 50)
      .map((movie) => {
        const releaseDate = movie.release_date ? new Date(movie.release_date) : null;
        const posterUrl = `https://image.tmdb.org/t/p/w500${movie.poster_path}`;

        return {
          movie_id: movie.id,
          movie_title: movie.title,
          poster_full_url: posterUrl,
          movie_release_date: movie.release_date || null,
          releaseYear: releaseDate ? releaseDate.getFullYear() : null,
          isCurrentYear: releaseDate ? releaseDate.getFullYear() === new Date().getFullYear() : false,
          fullReleaseDate: releaseDate ? releaseDate.toLocaleDateString() : "Unknown",
        };
      });

    // Check which movies the user has already watched and in watchlist
    if (movies.length > 0) {
      const movieIds = movies.map(m => m.movie_id);

      // Check watched list
      const watchedQuery = `
        SELECT movie_id, watched_id
        FROM watched_list
        WHERE user_id = $1 AND movie_id = ANY($2)
      `;
      const watchedResult = await db.query(watchedQuery, [user_id, movieIds]);

      // Check watchlist
      const watchlistQuery = `
        SELECT movie_id
        FROM watch_list
        WHERE user_id = $1 AND movie_id = ANY($2)
      `;
      const watchlistResult = await db.query(watchlistQuery, [user_id, movieIds]);

      // Create maps with both number and string keys to handle type mismatches
      const watchedMap = new Map();
      watchedResult.rows.forEach(row => {
        watchedMap.set(row.movie_id, row.watched_id);
        watchedMap.set(String(row.movie_id), row.watched_id);
        watchedMap.set(Number(row.movie_id), row.watched_id);
      });

      const watchlistMap = new Map();
      watchlistResult.rows.forEach(row => {
        watchlistMap.set(row.movie_id, true);
        watchlistMap.set(String(row.movie_id), true);
        watchlistMap.set(Number(row.movie_id), true);
      });

      // Add isWatched, watched_id, and inWatchlist properties to each movie
      movies.forEach(movie => {
        const watchedId = watchedMap.get(movie.movie_id) || watchedMap.get(String(movie.movie_id)) || watchedMap.get(Number(movie.movie_id));
        if (watchedId) {
          movie.isWatched = true;
          movie.watched_id = watchedId;
        } else {
          movie.isWatched = false;
        }

        const inWatchlist = watchlistMap.get(movie.movie_id) || watchlistMap.get(String(movie.movie_id)) || watchlistMap.get(Number(movie.movie_id));
        movie.inWatchlist = !!inWatchlist;
      });
    }

    res.json(movies);
  } catch (error) {
    console.error("TMDb search error:", error);
    res.status(500).json({ error: "Search failed" });
  }
});

// USER SEARCH - Fuzzy search by username
app.get("/api/search-users", requireLogin, async (req, res) => {
  const q = req.query.q || "";
  const current_user_id = req.session.user_id;

  if (!q.trim()) {
    return res.json([]);
  }

  try {
    // Simple ILIKE search - works without pg_trgm extension
    const sql = `
      SELECT
        u.user_id,
        u.username,
        u.display_name,
        u.profile_picture,
        EXISTS(
          SELECT 1 FROM user_follows
          WHERE follower_id = $1 AND following_id = u.user_id
        ) as is_following
      FROM users u
      WHERE
        u.user_id != $1
        AND u.username ILIKE $2
      ORDER BY u.username ASC
      LIMIT 50
    `;

    const searchPattern = `%${q}%`;
    const result = await db.query(sql, [current_user_id, searchPattern]);

    res.json(result.rows);
  } catch (error) {
    console.error("User search error:", error);
    res.status(500).json({ error: "Search failed" });
  }
});

// GET single movie details (for rate_movie page)
// Checks database first, if not found, fetches from TMDb and inserts
app.get("/api/movie/:movie_id", requireLogin, async (req, res) => {
  const movie_id = req.params.movie_id;

  try {
    // Ensure movie exists in database
    const movieAdded = await ensureMovieInDatabase(movie_id);
    if (!movieAdded) {
      return res.status(404).json({ error: "Movie not found" });
    }

    // Fetch movie from database
    const sql = `
      SELECT movie_id, movie_title, poster_full_url, movie_release_date
      FROM all_movies
      WHERE movie_id = $1
    `;
    const result = await db.query(sql, [movie_id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Movie not found" });
    }

    const movie = result.rows[0];
    const releaseDate = movie.movie_release_date ? new Date(movie.movie_release_date) : null;

    res.json({
      ...movie,
      releaseYear: releaseDate ? releaseDate.getFullYear() : null
    });
  } catch (error) {
    console.error("Error fetching movie:", error);
    res.status(500).json({ error: "Failed to fetch movie" });
  }
});

// ADD movie to watched list
app.post("/add-movie/:movie_id", requireLogin, async (req, res) => {
  const user_id = req.session.user_id;
  const movie_id = req.params.movie_id;
  const { rating, review } = req.body;

  try {
    // Ensure movie exists in all_movies table
    const movieAdded = await ensureMovieInDatabase(movie_id);
    if (!movieAdded) {
      return res.status(500).send("Failed to fetch movie data");
    }

    const sql = `
      INSERT INTO watched_list (user_id, movie_id, user_rating, review)
      VALUES ($1, $2, $3, $4)
    `;

    await db.query(sql, [user_id, movie_id, rating, review || null]);

    // Remove from watchlist if it exists there
    await db.query(
      `DELETE FROM watch_list WHERE user_id = $1 AND movie_id = $2`,
      [user_id, movie_id]
    );

    // Update popcorn kernels: +1 for adding a movie
    let kernelsToAdd = 1;

    // +5 additional if a review is provided
    if (review && review.trim() !== '') {
      kernelsToAdd += 5;
    }

    await db.query(
      `UPDATE users SET popcorn_kernels = COALESCE(popcorn_kernels, 0) + $1 WHERE user_id = $2`,
      [kernelsToAdd, user_id]
    );

    console.log(`[MOVIE ADDED] User ${user_id} added movie ${movie_id} - Rating: ${rating}, Has Review: ${!!(review && review.trim())}, Kernels +${kernelsToAdd}`);

    res.redirect("/watched");
  } catch (err) {
    console.error("Error adding movie to watched list:", err);
    res.status(500).send("Failed to add movie");
  }
});

// UPDATE existing watched entry
app.post("/update-movie/:watched_id", requireLogin, async (req, res) => {
  const user_id = req.session.user_id;
  const watched_id = req.params.watched_id;
  const { rating, review } = req.body;

  // First, get the current review status
  const checkSql = `
    SELECT review FROM watched_list
    WHERE watched_id = $1 AND user_id = $2
  `;
  const currentEntry = await db.query(checkSql, [watched_id, user_id]);

  if (currentEntry.rows.length === 0) {
    return res.status(404).send("Entry not found");
  }

  const oldReview = currentEntry.rows[0].review;
  const hadReview = oldReview && oldReview.trim() !== '';
  const nowHasReview = review && review.trim() !== '';

  // Update the movie entry
  const sql = `
    UPDATE watched_list
    SET user_rating = $1, review = $2
    WHERE watched_id = $3 AND user_id = $4
  `;

  await db.query(sql, [rating, review || null, watched_id, user_id]);

  console.log(`[MOVIE UPDATED] User ${user_id} updated watched_id ${watched_id} - Rating: ${rating}, Had Review: ${hadReview}, Now Has Review: ${nowHasReview}`);

  // Award +5 kernels if a review is being added for the first time
  if (!hadReview && nowHasReview) {
    console.log(`[POPCORN KERNELS] User ${user_id} adding review for first time on watched_id ${watched_id} - awarding +5 kernels`);
    await db.query(
      `UPDATE users SET popcorn_kernels = COALESCE(popcorn_kernels, 0) + 5 WHERE user_id = $1`,
      [user_id]
    );
  }
  // Subtract -5 kernels if a review is being removed
  else if (hadReview && !nowHasReview) {
    console.log(`[POPCORN KERNELS] User ${user_id} removing review on watched_id ${watched_id} - subtracting 5 kernels`);
    await db.query(
      `UPDATE users SET popcorn_kernels = GREATEST(COALESCE(popcorn_kernels, 0) - 5, 0) WHERE user_id = $1`,
      [user_id]
    );
  }

  res.redirect("/watched");
});

// DELETE watched entry
app.post("/delete-movie/:watched_id", requireLogin, async (req, res) => {
  const user_id = req.session.user_id;
  const watched_id = req.params.watched_id;

  // First, get the entry to check if it has a review
  const checkSql = `
    SELECT review FROM watched_list
    WHERE watched_id = $1 AND user_id = $2
  `;
  const entry = await db.query(checkSql, [watched_id, user_id]);

  if (entry.rows.length === 0) {
    return res.status(404).send("Entry not found");
  }

  const hasReview = entry.rows[0].review && entry.rows[0].review.trim() !== '';

  // Calculate kernels to subtract: -1 for movie, -5 for review if exists
  let kernelsToSubtract = 1;
  if (hasReview) {
    kernelsToSubtract += 5; // Total: -6
  }

  // Delete the movie entry
  const deleteSql = `
    DELETE FROM watched_list
    WHERE watched_id = $1 AND user_id = $2
  `;
  await db.query(deleteSql, [watched_id, user_id]);

  // Subtract kernels from user
  await db.query(
    `UPDATE users SET popcorn_kernels = GREATEST(COALESCE(popcorn_kernels, 0) - $1, 0) WHERE user_id = $2`,
    [kernelsToSubtract, user_id]
  );

  console.log(`[MOVIE DELETED] User ${user_id} deleted watched_id ${watched_id} - Had Review: ${hasReview}, Kernels -${kernelsToSubtract}`);

  res.redirect("/watched");
});

// More movie routes … (unchanged)

// ============================================================================
// FOLLOWERS / FOLLOWING
// ============================================================================

// Get list of users who follow a specific user
app.get("/api/user/:user_id/followers", requireLogin, async (req, res) => {
  const target_user_id = req.params.user_id;
  const current_user_id = req.session.user_id;

  console.log(`[FOLLOWERS] Fetching followers for user ${target_user_id}, current user: ${current_user_id}`);

  try {
    const sql = `
      SELECT
        u.user_id,
        u.username,
        u.profile_picture,
        EXISTS(
          SELECT 1 FROM user_follows
          WHERE follower_id = $1 AND following_id = u.user_id
        ) as is_following
      FROM user_follows uf
      JOIN users u ON uf.follower_id = u.user_id
      WHERE uf.following_id = $2
      ORDER BY u.username ASC
    `;
    const result = await db.query(sql, [current_user_id, target_user_id]);
    console.log(`[FOLLOWERS] Found ${result.rows.length} followers`);
    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching followers:", error);
    console.error("Error details:", error.message, error.stack);
    res.status(500).json({ error: "Failed to fetch followers", details: error.message });
  }
});

// Get list of users that a specific user follows
app.get("/api/user/:user_id/following", requireLogin, async (req, res) => {
  const target_user_id = req.params.user_id;
  const current_user_id = req.session.user_id;

  console.log(`[FOLLOWING] Fetching following for user ${target_user_id}, current user: ${current_user_id}`);

  try {
    const sql = `
      SELECT
        u.user_id,
        u.username,
        u.profile_picture,
        EXISTS(
          SELECT 1 FROM user_follows
          WHERE follower_id = $1 AND following_id = u.user_id
        ) as is_following
      FROM user_follows uf
      JOIN users u ON uf.following_id = u.user_id
      WHERE uf.follower_id = $2
      ORDER BY u.username ASC
    `;
    const result = await db.query(sql, [current_user_id, target_user_id]);
    console.log(`[FOLLOWING] Found ${result.rows.length} users`);
    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching following:", error);
    console.error("Error details:", error.message, error.stack);
    res.status(500).json({ error: "Failed to fetch following", details: error.message });
  }
});

// Follow a user
app.post("/api/user/follow/:user_id", requireLogin, async (req, res) => {
  const follower_id = req.session.user_id;
  const following_id = req.params.user_id;

  // Prevent self-follow
  if (follower_id === parseInt(following_id)) {
    return res.status(400).json({ error: "Cannot follow yourself" });
  }

  try {
    const sql = `
      INSERT INTO user_follows (follower_id, following_id)
      VALUES ($1, $2)
      ON CONFLICT DO NOTHING
    `;
    await db.query(sql, [follower_id, following_id]);
    console.log(`[FOLLOW] User ${follower_id} followed user ${following_id}`);
    res.json({ success: true });
  } catch (error) {
    console.error("Error following user:", error);
    res.status(500).json({ error: "Failed to follow user" });
  }
});

// Unfollow a user
app.post("/api/user/unfollow/:user_id", requireLogin, async (req, res) => {
  const follower_id = req.session.user_id;
  const following_id = req.params.user_id;

  try {
    const sql = `
      DELETE FROM user_follows
      WHERE follower_id = $1 AND following_id = $2
    `;
    await db.query(sql, [follower_id, following_id]);
    console.log(`[UNFOLLOW] User ${follower_id} unfollowed user ${following_id}`);
    res.json({ success: true });
  } catch (error) {
    console.error("Error unfollowing user:", error);
    res.status(500).json({ error: "Failed to unfollow user" });
  }
});

// ============================================================================
// START SERVER
// ============================================================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log(`TrueReview running at http://localhost:${PORT}`)
);