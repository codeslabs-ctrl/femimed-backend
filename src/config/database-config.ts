/**
 * Database Configuration
 * 
 * This system now uses PostgreSQL exclusively.
 * Supabase support has been removed.
 * Generated at: 2025-12-21T16:20:38.656Z
 */

// Always use PostgreSQL
export const USE_POSTGRES: boolean = true;

// Log which database will be used (visible during build)
console.log(`🔧 Database: PostgreSQL`);
