import sqlite3
import os

# Database path
DB_PATH = "../../TrueReview.db"

def update_popcorn_kernels():
    """
    Update popcorn_kernels for all users based on:
    - 1 kernel per movie watched
    - 5 kernels per written review
    """

    # Check if database exists
    if not os.path.exists(DB_PATH):
        print(f"❌ Database not found at: {DB_PATH}")
        return

    # Connect to database
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    try:
        # Get all users
        cursor.execute("SELECT user_id, username FROM users")
        users = cursor.fetchall()

        print(f"🎬 Updating popcorn kernels for {len(users)} users...\n")

        total_kernels_awarded = 0

        for user_id, username in users:
            # Count movies watched (1 kernel each)
            cursor.execute("""
                SELECT COUNT(*)
                FROM watched_list
                WHERE user_id = ?
            """, (user_id,))
            movies_watched = cursor.fetchone()[0]

            # Count written reviews (5 kernels each)
            # A review is considered "written" if it's not NULL and not empty
            cursor.execute("""
                SELECT COUNT(*)
                FROM watched_list
                WHERE user_id = ?
                AND review IS NOT NULL
                AND TRIM(review) != ''
            """, (user_id,))
            reviews_written = cursor.fetchone()[0]

            # Calculate total kernels
            total_kernels = (movies_watched * 1) + (reviews_written * 5)

            # Update user's popcorn_kernels
            cursor.execute("""
                UPDATE users
                SET popcorn_kernels = ?
                WHERE user_id = ?
            """, (total_kernels, user_id))

            total_kernels_awarded += total_kernels

            print(f"👤 {username}")
            print(f"   Movies watched: {movies_watched} × 1 = {movies_watched} kernels")
            print(f"   Reviews written: {reviews_written} × 5 = {reviews_written * 5} kernels")
            print(f"   Total: {total_kernels} kernels 🍿\n")

        # Commit changes
        conn.commit()

        print(f"✅ Successfully updated popcorn kernels!")
        print(f"🍿 Total kernels awarded: {total_kernels_awarded}")

    except sqlite3.Error as e:
        print(f"❌ Database error: {e}")
        conn.rollback()
    except Exception as e:
        print(f"❌ Error: {e}")
        conn.rollback()
    finally:
        conn.close()

if __name__ == "__main__":
    print("=" * 60)
    print("🍿 POPCORN KERNELS UPDATE SCRIPT 🍿")
    print("=" * 60)
    print()

    update_popcorn_kernels()

    print()
    print("=" * 60)
