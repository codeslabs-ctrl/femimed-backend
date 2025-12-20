import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { postgresPool } from '../config/database.js';

export class FirmaService {
  
  /**
   * Guarda la firma digital de un médico
   * @param medicoId ID del médico
   * @param archivo Archivo de firma subido
   * @returns Ruta relativa de la firma guardada
   */
  async guardarFirma(medicoId: number, archivo: Express.Multer.File): Promise<string> {
    try {
      const filename = `medico_${medicoId}_firma${path.extname(archivo.originalname)}`;
      const rutaCompleta = path.join(process.cwd(), 'assets', 'firmas', filename);
      
      // Crear directorio si no existe
      const dir = path.dirname(rutaCompleta);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      // Calcular hash para verificar integridad
      const hash = crypto.createHash('sha256');
      hash.update(fs.readFileSync(archivo.path));
      const hashValue = hash.digest('hex');
      
      // Mover archivo a ubicación final
      fs.renameSync(archivo.path, rutaCompleta);
      
      console.log(`✅ Firma guardada para médico ${medicoId}: ${filename}`);
      console.log(`🔐 Hash de integridad: ${hashValue}`);
      
      return `/assets/firmas/${filename}`;
    } catch (error) {
      console.error('❌ Error guardando firma:', error);
      throw new Error(`Error guardando firma: ${(error as Error).message}`);
    }
  }
  
  /**
   * Obtiene la ruta de la firma digital de un médico
   * @param medicoId ID del médico
   * @returns Ruta de la firma o null si no existe
   */
  async obtenerFirma(medicoId: number): Promise<string | null> {
    try {
      const client = await postgresPool.connect();
      try {
        const result = await client.query(
          'SELECT firma_digital FROM medicos WHERE id = $1 LIMIT 1',
          [medicoId]
        );
        
        if (result.rows.length === 0) {
          return null;
        }
        
        return result.rows[0].firma_digital || null;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('❌ Error en obtenerFirma:', error);
      return null;
    }
  }
  
  /**
   * Elimina la firma digital de un médico
   * @param medicoId ID del médico
   */
  async eliminarFirma(medicoId: number): Promise<void> {
    try {
      const firmaPath = await this.obtenerFirma(medicoId);
      if (firmaPath) {
        const fullPath = path.join(process.cwd(), firmaPath);
        if (fs.existsSync(fullPath)) {
          fs.unlinkSync(fullPath);
          console.log(`✅ Firma eliminada para médico ${medicoId}`);
        }
      }
    } catch (error) {
      console.error('❌ Error eliminando firma:', error);
      throw new Error(`Error eliminando firma: ${(error as Error).message}`);
    }
  }
  
  /**
   * Convierte la firma a base64 para incluir en PDF
   * @param medicoId ID del médico
   * @returns Base64 de la firma o string vacío si no existe
   */
  async obtenerFirmaBase64(medicoId: number): Promise<string> {
    try {
      const firmaPath = await this.obtenerFirma(medicoId);
      if (!firmaPath) {
        return '';
      }
      
      const fullPath = path.join(process.cwd(), firmaPath);
      if (!fs.existsSync(fullPath)) {
        console.warn(`⚠️ Archivo de firma no encontrado: ${fullPath}`);
        return '';
      }
      
      const firmaBuffer = fs.readFileSync(fullPath);
      const base64 = firmaBuffer.toString('base64');
      const ext = path.extname(firmaPath).toLowerCase();
      
      let mimeType = 'image/png';
      if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg';
      else if (ext === '.gif') mimeType = 'image/gif';
      else if (ext === '.webp') mimeType = 'image/webp';
      
      return `data:${mimeType};base64,${base64}`;
    } catch (error) {
      console.error('❌ Error obteniendo firma base64:', error);
      return '';
    }
  }
}
