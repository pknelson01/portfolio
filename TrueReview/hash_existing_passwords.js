// ============================================================================
//  HASH EXISTING PASSWORDS - ONE-TIME SCRIPT
// ============================================================================
// This script hashes all existing plain-text passwords in the users table
// Run this once to migrate existing passwords to bcrypt hashes

import pg from "pg";
import bcrypt from "bcrypt";

const db = new pg.Pool({
  connectionString:
    "postgresql://truereview_admin:TrNMyIlmWQqxTBtiownOkjAPiNGT6bK6@dpg-d4qhtuh5pdvs738o9d90-a.oregon-postgres.render.com/truereview",
  ssl: { rejectUnauthorized: false },
});

const SALT_ROUNDS = 10;

async function hashExistingPasswords() {
  try {
    console.log("Starting to hash existing passwords...");

    // Get all users with their current passwords
    const result = await db.query("SELECT user_id, email, password FROM users");
    const users = result.rows;

    console.log(`Found ${users.length} users to process`);

    for (const user of users) {
      // Check if password is already hashed (bcrypt hashes start with $2b$ or $2a$)
      if (user.password && user.password.startsWith("$2")) {
        console.log(`User ${user.email} already has a hashed password, skipping...`);
        continue;
      }

      // Hash the plain-text password
      const hashedPassword = await bcrypt.hash(user.password, SALT_ROUNDS);

      // Update the user's password
      await db.query(
        "UPDATE users SET password = $1 WHERE user_id = $2",
        [hashedPassword, user.user_id]
      );

      console.log(`✓ Hashed password for user: ${user.email}`);
    }

    console.log("\n✓ All passwords have been hashed successfully!");
    process.exit(0);
  } catch (error) {
    console.error("Error hashing passwords:", error);
    process.exit(1);
  }
}

hashExistingPasswords();
