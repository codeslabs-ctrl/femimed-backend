import multer from 'multer';
import path from 'path';
import fs from 'fs';

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const uploadPath = path.join(process.cwd(), 'assets', 'firmas');
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const medicoId = req.params['id'];
    const ext = path.extname(file.originalname);
    const filename = `medico_${medicoId}_firma${ext}`;
    cb(null, filename);
  }
});

export const uploadFirma = multer({
  storage,
  limits: { 
    fileSize: 2 * 1024 * 1024, // 2MB max
    files: 1 // Solo un archivo
  },
  fileFilter: (_req, file, cb) => {
    // Solo permitir archivos de imagen
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten archivos de imagen (PNG, JPG, JPEG, GIF, WEBP)'));
    }
  }
});
