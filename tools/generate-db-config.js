/**
 * Script para generar la configuración de base de datos en tiempo de build.
 * Este script crea un archivo TypeScript con la constante USE_POSTGRES
 * que se compila directamente en el código.
 *
 * Nota: Este sistema usa PostgreSQL exclusivamente (Supabase removido).
 */

const fs = require('fs');
const path = require('path');

// Always use PostgreSQL (Supabase support removed)
const usePostgres = true;

const configContent = `/**
 * Database Configuration
 *
 * This system now uses PostgreSQL exclusively.
 * Supabase support has been removed.
 */

// Always use PostgreSQL
export const USE_POSTGRES: boolean = ${usePostgres};

// Log which database will be used (visible during build)
console.log(\`🔧 Database: PostgreSQL\`);
`;

const configPath = path.join(__dirname, '../src/config/database-config.ts');

fs.writeFileSync(configPath, configContent, 'utf8');

console.log(`✅ Generated database config: USE_POSTGRES = ${usePostgres} (PostgreSQL only)`);


