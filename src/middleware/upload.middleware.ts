import multer from 'multer';
import path from 'path';
import fs from 'fs';

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const uploadPath = path.join(process.cwd(), 'assets', 'firmas');
    console.log(`📤 [Multer] Destino de upload: ${uploadPath}`);
    if (!fs.existsSync(uploadPath)) {
      console.log(`📁 [Multer] Creando directorio: ${uploadPath}`);
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const medicoId = req.params['id'];
    const ext = path.extname(file.originalname);
    const filename = `medico_${medicoId}_firma${ext}`;
    console.log(`📤 [Multer] Nombre de archivo generado: ${filename}`);
    console.log(`📤 [Multer] Archivo original: ${file.originalname}, MIME: ${file.mimetype}, Tamaño: ${file.size}`);
    cb(null, filename);
  }
});

const storageSello = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const uploadPath = path.join(process.cwd(), 'assets', 'firmas');
    if (!fs.existsSync(uploadPath)) fs.mkdirSync(uploadPath, { recursive: true });
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const medicoId = req.params['id'];
    const ext = path.extname(file.originalname);
    cb(null, `medico_${medicoId}_sello${ext}`);
  }
});

export const uploadFirma = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Solo se permiten archivos de imagen (PNG, JPG, JPEG, GIF, WEBP)'));
  }
});

export const uploadSello = multer({
  storage: storageSello,
  limits: { fileSize: 2 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Solo se permiten archivos de imagen (PNG, JPG, JPEG, GIF, WEBP)'));
  }
});
