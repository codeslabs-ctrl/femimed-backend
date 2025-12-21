const fs = require('fs');
const path = require('path');

const assetsDir = path.join(__dirname, '..', 'assets');
const distAssetsDir = path.join(__dirname, '..', 'dist', 'assets');

// Función para copiar directorios recursivamente
function copyDir(src, dest) {
  if (!fs.existsSync(src)) {
    console.log(`⚠️  Directorio ${src} no existe, saltando copia de assets`);
    return;
  }

  // Crear directorio destino si no existe
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  // Leer contenido del directorio fuente
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      // Copiar subdirectorios recursivamente
      copyDir(srcPath, destPath);
    } else {
      // Copiar archivos
      fs.copyFileSync(srcPath, destPath);
    }
  }

  console.log(`✅ Assets copiados de ${src} a ${dest}`);
}

// Ejecutar copia
try {
  copyDir(assetsDir, distAssetsDir);
  console.log('✅ Proceso de copia de assets completado');
} catch (error) {
  console.error('❌ Error copiando assets:', error.message);
  process.exit(1);
}


