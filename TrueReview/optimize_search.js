// ============================================================================
//  OPTIMIZE SEARCH - ONE-TIME SCRIPT
// ============================================================================
// This script adds database indexes and extensions to improve search performance

import pg from "pg";

const db = new pg.Pool({
  connectionString:
    "postgresql://truereview_admin:TrNMyIlmWQqxTBtiownOkjAPiNGT6bK6@dpg-d4qhtuh5pdvs738o9d90-a.oregon-postgres.render.com/truereview",
  ssl: { rejectUnauthorized: false },
});

async function optimizeSearch() {
  try {
    console.log("Starting search optimization...\n");

    // 1. Enable trigram extension for fuzzy search
    console.log("1. Enabling pg_trgm extension...");
    await db.query("CREATE EXTENSION IF NOT EXISTS pg_trgm;");
    console.log("✓ pg_trgm extension enabled\n");

    // 2. Create trigram index for fuzzy matching
    console.log("2. Creating trigram index on movie_title...");
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_movie_title_trgm
      ON all_movies USING gin (movie_title gin_trgm_ops);
    `);
    console.log("✓ Trigram index created\n");

    // 3. Create regular index for exact and prefix matches
    console.log("3. Creating standard index on movie_title...");
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_movie_title
      ON all_movies (movie_title);
    `);
    console.log("✓ Standard index created\n");

    // 4. Get table statistics
    console.log("4. Checking database statistics...");
    const stats = await db.query(`
      SELECT
        COUNT(*) as total_movies,
        pg_size_pretty(pg_total_relation_size('all_movies')) as table_size
      FROM all_movies;
    `);
    console.log(`✓ Total movies: ${stats.rows[0].total_movies}`);
    console.log(`✓ Table size: ${stats.rows[0].table_size}\n`);

    console.log("✓ Search optimization completed successfully!");
    console.log("\nSearch queries should now be much faster and more accurate.");
    process.exit(0);
  } catch (error) {
    console.error("Error optimizing search:", error);
    process.exit(1);
  }
}

optimizeSearch();
