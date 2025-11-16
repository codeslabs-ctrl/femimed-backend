import { Request, Response } from 'express';
import { supabase } from '../config/database.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

interface AuthenticatedRequest extends Request {
  user?: {
    userId: number;
    username: string;
    rol: string;
    medico_id?: number;
  };
}

// Configuración de multer para subida de archivos
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const uploadDir = 'uploads/historias';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const uniqueName = `${uuidv4()}-${Date.now()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB límite por archivo
    files: 5 // Máximo 5 archivos
  },
  fileFilter: (_req, file, cb) => {
    // Permitir solo ciertos tipos de archivos
    const allowedTypes = /jpeg|jpg|png|gif|pdf|doc|docx|xls|xlsx|txt/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Tipo de archivo no permitido'));
    }
  }
});

export const uploadMiddleware = upload.array('archivos', 5); // Máximo 5 archivos

export class ArchivoController {
  // Subir archivos (múltiples)
  static async uploadArchivo(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const files = req.files as Express.Multer.File[];
      
      if (!files || files.length === 0) {
        res.status(400).json({
          success: false,
          error: { message: 'No se proporcionaron archivos' }
        });
        return;
      }

      if (files.length > 5) {
        res.status(400).json({
          success: false,
          error: { message: 'Máximo 5 archivos permitidos' }
        });
        return;
      }

      const { historia_id, descripciones } = req.body;

      if (!historia_id) {
        res.status(400).json({
          success: false,
          error: { message: 'historia_id es requerido' }
        });
        return;
      }

      // Verificar que la historia existe y obtener información del médico
      const { data: historia, error: historiaError } = await supabase
        .from('historico_pacientes')
        .select('id, medico_id')
        .eq('id', historia_id)
        .single();

      if (historiaError || !historia) {
        res.status(404).json({
          success: false,
          error: { message: 'Historia no encontrada' }
        });
        return;
      }

      // Verificar permisos: solo el médico dueño de la historia, administrador o secretaria pueden subir archivos
      const user = req.user;
      const userRol = user?.rol;
      const userMedicoId = user?.medico_id;
      const historiaMedicoId = historia.medico_id;

      // Permitir a administradores y secretarias
      if (userRol !== 'administrador' && userRol !== 'secretaria') {
        // Si es médico, verificar que es el dueño de la historia
        if (userRol === 'medico') {
          if (!userMedicoId || userMedicoId !== historiaMedicoId) {
            res.status(403).json({
              success: false,
              error: { message: 'No tiene permisos para subir archivos a esta historia médica. Solo el médico que creó la historia puede agregar archivos.' }
            });
            return;
          }
        } else {
          // Otros roles no tienen permiso
          res.status(403).json({
            success: false,
            error: { message: 'No tiene permisos para subir archivos' }
          });
          return;
        }
      }

      // Parsear descripciones si vienen como JSON string
      let descripcionesArray: string[] = [];
      if (descripciones) {
        try {
          descripcionesArray = typeof descripciones === 'string' 
            ? JSON.parse(descripciones) 
            : descripciones;
        } catch (e) {
          descripcionesArray = [descripciones];
        }
      }

      // Preparar datos para insertar
      const clinicaAlias = process.env['CLINICA_ALIAS'];
      const archivosData = files.map((file, index) => ({
        historia_id: parseInt(historia_id),
        nombre_original: file.originalname,
        nombre_archivo: file.filename,
        ruta_archivo: file.path,
        tipo_mime: file.mimetype,
        tamano_bytes: file.size,
        descripcion: descripcionesArray[index] || null,
        clinica_alias: clinicaAlias
      }));

      // Insertar todos los archivos en la base de datos
      const { data, error } = await supabase
        .from('archivos_anexos')
        .insert(archivosData)
        .select();

      if (error) {
        console.error('Error inserting archivos:', error);
        res.status(500).json({
          success: false,
          error: { message: 'Error al guardar los archivos en la base de datos' }
        });
        return;
      }

      res.json({
        success: true,
        data: data,
        message: `${files.length} archivo(s) subido(s) exitosamente`
      });

    } catch (error) {
      console.error('Error uploading archivos:', error);
      res.status(500).json({
        success: false,
        error: { message: 'Error interno del servidor' }
      });
    }
  }

  // Obtener archivos por historia
  static async getArchivosByHistoria(req: Request, res: Response): Promise<void> {
    try {
      const { historiaId } = req.params;

      const { data, error } = await supabase
        .from('archivos_anexos')
        .select('*')
        .eq('historia_id', historiaId)
        .eq('activo', true)
        .order('fecha_subida', { ascending: false });

      if (error) {
        console.error('Error fetching archivos:', error);
        res.status(500).json({
          success: false,
          error: { message: 'Error al obtener los archivos' }
        });
        return;
      }

      res.json({
        success: true,
        data: data || []
      });

    } catch (error) {
      console.error('Error getting archivos:', error);
      res.status(500).json({
        success: false,
        error: { message: 'Error interno del servidor' }
      });
    }
  }

  // Obtener archivo por ID
  static async getArchivoById(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      const { data, error } = await supabase
        .from('archivos_anexos')
        .select('*')
        .eq('id', id)
        .eq('activo', true)
        .single();

      if (error || !data) {
        res.status(404).json({
          success: false,
          error: { message: 'Archivo no encontrado' }
        });
        return;
      }

      res.json({
        success: true,
        data: data
      });

    } catch (error) {
      console.error('Error getting archivo:', error);
      res.status(500).json({
        success: false,
        error: { message: 'Error interno del servidor' }
      });
    }
  }

  // Actualizar archivo
  static async updateArchivo(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { descripcion } = req.body;

      // Obtener el archivo y su historia asociada
      const { data: archivo, error: archivoError } = await supabase
        .from('archivos_anexos')
        .select('id, historia_id')
        .eq('id', id)
        .eq('activo', true)
        .single();

      if (archivoError || !archivo) {
        res.status(404).json({
          success: false,
          error: { message: 'Archivo no encontrado' }
        });
        return;
      }

      // Obtener la historia para verificar permisos
      const { data: historia, error: historiaError } = await supabase
        .from('historico_pacientes')
        .select('medico_id')
        .eq('id', archivo.historia_id)
        .single();

      if (historiaError || !historia) {
        res.status(404).json({
          success: false,
          error: { message: 'Historia no encontrada' }
        });
        return;
      }

      // Verificar permisos
      const user = req.user;
      const userRol = user?.rol;
      const userMedicoId = user?.medico_id;
      const historiaMedicoId = historia.medico_id;

      if (userRol !== 'administrador' && userRol !== 'secretaria') {
        if (userRol === 'medico') {
          if (!userMedicoId || userMedicoId !== historiaMedicoId) {
            res.status(403).json({
              success: false,
              error: { message: 'No tiene permisos para actualizar este archivo' }
            });
            return;
          }
        } else {
          res.status(403).json({
            success: false,
            error: { message: 'No tiene permisos para actualizar archivos' }
          });
          return;
        }
      }

      const { data, error } = await supabase
        .from('archivos_anexos')
        .update({
          descripcion: descripcion,
          fecha_actualizacion: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single();

      if (error) {
        console.error('Error updating archivo:', error);
        res.status(500).json({
          success: false,
          error: { message: 'Error al actualizar el archivo' }
        });
        return;
      }

      res.json({
        success: true,
        data: data
      });

    } catch (error) {
      console.error('Error updating archivo:', error);
      res.status(500).json({
        success: false,
        error: { message: 'Error interno del servidor' }
      });
    }
  }

  // Eliminar archivo (marcar como inactivo)
  static async deleteArchivo(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      // Obtener el archivo y su historia asociada
      const { data: archivo, error: archivoError } = await supabase
        .from('archivos_anexos')
        .select('id, historia_id')
        .eq('id', id)
        .eq('activo', true)
        .single();

      if (archivoError || !archivo) {
        res.status(404).json({
          success: false,
          error: { message: 'Archivo no encontrado' }
        });
        return;
      }

      // Obtener la historia para verificar permisos
      const { data: historia, error: historiaError } = await supabase
        .from('historico_pacientes')
        .select('medico_id')
        .eq('id', archivo.historia_id)
        .single();

      if (historiaError || !historia) {
        res.status(404).json({
          success: false,
          error: { message: 'Historia no encontrada' }
        });
        return;
      }

      // Verificar permisos
      const user = req.user;
      const userRol = user?.rol;
      const userMedicoId = user?.medico_id;
      const historiaMedicoId = historia.medico_id;

      if (userRol !== 'administrador' && userRol !== 'secretaria') {
        if (userRol === 'medico') {
          if (!userMedicoId || userMedicoId !== historiaMedicoId) {
            res.status(403).json({
              success: false,
              error: { message: 'No tiene permisos para eliminar este archivo' }
            });
            return;
          }
        } else {
          res.status(403).json({
            success: false,
            error: { message: 'No tiene permisos para eliminar archivos' }
          });
          return;
        }
      }

      const { error } = await supabase
        .from('archivos_anexos')
        .update({
          activo: false,
          fecha_actualizacion: new Date().toISOString()
        })
        .eq('id', id);

      if (error) {
        console.error('Error deleting archivo:', error);
        res.status(500).json({
          success: false,
          error: { message: 'Error al eliminar el archivo' }
        });
        return;
      }

      res.json({
        success: true
      });

    } catch (error) {
      console.error('Error deleting archivo:', error);
      res.status(500).json({
        success: false,
        error: { message: 'Error interno del servidor' }
      });
    }
  }

  // Descargar archivo
  static async downloadArchivo(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      // Obtener información del archivo
      const { data: archivo, error } = await supabase
        .from('archivos_anexos')
        .select('*')
        .eq('id', id)
        .eq('activo', true)
        .single();

      if (error || !archivo) {
        res.status(404).json({
          success: false,
          error: { message: 'Archivo no encontrado' }
        });
        return;
      }

      // Verificar que el archivo existe en el sistema de archivos
      if (!fs.existsSync(archivo.ruta_archivo)) {
        res.status(404).json({
          success: false,
          error: { message: 'Archivo no encontrado en el servidor' }
        });
        return;
      }

      // Configurar headers para descarga
      res.setHeader('Content-Disposition', `attachment; filename="${archivo.nombre_original}"`);
      res.setHeader('Content-Type', archivo.tipo_mime);

      // Enviar archivo
      const fileStream = fs.createReadStream(archivo.ruta_archivo);
      fileStream.pipe(res);

    } catch (error) {
      console.error('Error downloading archivo:', error);
      res.status(500).json({
        success: false,
        error: { message: 'Error interno del servidor' }
      });
    }
  }
}
