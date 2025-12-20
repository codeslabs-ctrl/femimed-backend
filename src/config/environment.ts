import dotenv from 'dotenv';
import { Config } from '../types/index.js';
import path from 'path';

// Determine which config file to use based on NODE_ENV
// Default to 'production' when running compiled code (dist/)
const nodeEnv = process.env['NODE_ENV'] || (process.env['npm_lifecycle_event'] === 'start' ? 'production' : 'development');
// Use process.cwd() which points to the project root when running npm start
const configDir = process.cwd();
const configFile = nodeEnv === 'production' 
  ? path.join(configDir, 'config.env')
  : path.join(configDir, 'config.dev.env');

// Load environment variables
const dotenvResult = dotenv.config({ path: configFile });
if (dotenvResult.error) {
  console.error(`❌ Error loading config file: ${configFile}`);
  console.error(`   Error: ${dotenvResult.error.message}`);
} else {
  console.log(`📋 Loading config from: ${configFile} (NODE_ENV: ${nodeEnv})`);
  console.log(`   File exists: ${dotenvResult.parsed ? 'Yes' : 'No'}`);
}

export const config: Config = {
  // Server configuration
  port: parseInt(process.env['PORT'] || '3001'),
  nodeEnv: process.env['NODE_ENV'] || 'development',
  
  // PostgreSQL direct connection configuration
  postgres: {
    enabled: true, // Always enabled (Supabase removed)
    host: process.env['POSTGRES_HOST'] || 'localhost',
    port: parseInt(process.env['POSTGRES_PORT'] || '5432'),
    database: process.env['POSTGRES_DB'] || '',
    user: process.env['POSTGRES_USER'] || '',
    password: process.env['POSTGRES_PASSWORD'] || ''
  },
  
  // API configuration
  api: {
    version: process.env['API_VERSION'] || 'v1',
    rateLimit: {
      windowMs: parseInt(process.env['RATE_LIMIT_WINDOW_MS'] || '900000'), // 15 minutes
      maxRequests: parseInt(process.env['RATE_LIMIT_MAX_REQUESTS'] || '100')
    }
  },
  
  // CORS configuration
  cors: {
    origin: process.env['CORS_ORIGIN'] || 'http://localhost:4200',
    credentials: process.env['CORS_CREDENTIALS'] === 'true'
  },
  
  // Email configuration
  email: {
    user: process.env['EMAIL_USER'] || '',
    password: process.env['EMAIL_PASSWORD'] || '',
    service: process.env['EMAIL_SERVICE'] || 'gmail',
    from: process.env['EMAIL_FROM'] || 'DemoMed <codes.labs.rc@gmail.com>'
  },
  
  // System configuration
  sistema: {
    nombre: process.env['SISTEMA_NOMBRE'] || 'Sistema de Gestión Médica',
    clinicaNombre: process.env['CLINICA_NOMBRE'] || 'DemoMed',
    clinicaAlias: process.env['CLINICA_ALIAS'] || 'demomed'
  }
};

// Validate required PostgreSQL environment variables
const requiredPostgresVars: string[] = ['POSTGRES_HOST', 'POSTGRES_DB', 'POSTGRES_USER', 'POSTGRES_PASSWORD'];
for (const envVar of requiredPostgresVars) {
  if (!process.env[envVar]) {
    console.error(`❌ Missing environment variable: ${envVar}`);
    console.error(`   Current working directory: ${process.cwd()}`);
    console.error(`   Config file path: ${configFile}`);
    console.error(`   Available env vars starting with POSTGRES:`, 
      Object.keys(process.env).filter(k => k.startsWith('POSTGRES')));
    throw new Error(`Missing required environment variable: ${envVar}`);
  }
}
