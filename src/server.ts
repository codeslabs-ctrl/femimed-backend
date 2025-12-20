import express from 'express';
import morgan from 'morgan';
import compression from 'compression';
import { config } from './config/environment.js';
import { testConnection } from './config/database.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { 
  securityHeaders, 
  corsMiddleware
} from './middleware/security.js';
// import { ApiResponse } from './types/index.js';

// Import routes
import apiRoutes from './routes/index.js';
import healthRoutes from './routes/health.js';

const app = express();

// Aplicar middlewares de seguridad
app.use(securityHeaders);
app.use(corsMiddleware);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static files from uploads directory
app.use('/uploads', express.static('uploads'));

// Serve static files from assets directory
app.use('/assets', express.static('assets'));

// Compression middleware
app.use(compression());

// Logging middleware
if (config.nodeEnv === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// Health check endpoints
app.use('/health', healthRoutes);

// API routes
app.use(`/api/${config.api.version}`, apiRoutes);

// 404 handler
app.use(notFound);

// Error handling middleware
app.use(errorHandler);

// Start server
const startServer = async (): Promise<void> => {
  try {
    // Test database connection
    await testConnection();
    
    app.listen(config.port, () => {
      console.log(`🚀 Server running on port ${config.port}`);
      console.log(`📊 Environment: ${config.nodeEnv}`);
      
      // Mostrar URL apropiada según el entorno
      if (config.nodeEnv === 'production') {
        const productionUrl = process.env['API_URL'] || `https://api.demomed.codes-labs.com:${config.port}`;
        console.log(`🔗 API Base URL: ${productionUrl}/api/${config.api.version}`);
      } else {
        console.log(`🔗 API Base URL: http://localhost:${config.port}/api/${config.api.version}`);
      }
    });
  } catch (error) {
    console.error('❌ Failed to start server:', (error as Error).message);
    process.exit(1);
  }
};

// Handle uncaught exceptions
process.on('uncaughtException', (err: Error) => {
  console.error('Uncaught Exception:', err);
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err: Error) => {
  console.error('Unhandled Rejection:', err);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  process.exit(0);
});

startServer();
