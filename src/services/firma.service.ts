import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { supabase } from '../config/database.js';

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
      
      // Guardar siempre en assets/ de la raíz del proyecto (no en dist/)
      // Esto asegura que el script copy-assets.js pueda copiarlo a dist/ durante el build
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
      console.log(`📁 Ubicación: ${rutaCompleta}`);
      console.log(`🔐 Hash de integridad: ${hashValue}`);
      
      // Nota: La ruta retornada es relativa y será copiada a dist/assets/firmas/ durante el build
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
      const { data: medico, error } = await supabase
        .from('medicos')
        .select('firma_digital')
        .eq('id', medicoId)
        .single();
      
      if (error) {
        console.error('❌ Error obteniendo firma:', error);
        return null;
      }
      
      return medico?.firma_digital || null;
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
        console.warn(`⚠️ No se encontró ruta de firma para médico ${medicoId}`);
        return '';
      }
      
      // Resolver la ruta considerando que el código puede estar en dist/ o en src/
      // firmaPath viene como "/assets/firmas/medico_112_firma.png"
      let fullPath: string;
      
      // Si __dirname está en dist/, buscar en dist/assets
      // Si __dirname está en src/, buscar en assets (raíz del proyecto)
      const isCompiled = __dirname.includes('dist');
      
      if (isCompiled) {
        // Código compilado: buscar en dist/assets/firmas/
        const distPath = path.join(__dirname, '..', 'assets', 'firmas', path.basename(firmaPath));
        fullPath = distPath;
      } else {
        // Código fuente: buscar en assets/ (raíz del proyecto)
        fullPath = path.join(process.cwd(), firmaPath);
      }
      
      // Si no existe en la ubicación esperada, intentar en la otra ubicación como fallback
      if (!fs.existsSync(fullPath)) {
        const fallbackPath = isCompiled 
          ? path.join(process.cwd(), 'assets', 'firmas', path.basename(firmaPath))
          : path.join(__dirname, '..', '..', 'assets', 'firmas', path.basename(firmaPath));
        
        if (fs.existsSync(fallbackPath)) {
          console.log(`✅ Firma encontrada en ubicación alternativa: ${fallbackPath}`);
          fullPath = fallbackPath;
        } else {
          console.warn(`⚠️ Archivo de firma no encontrado en ninguna ubicación:`);
          console.warn(`   - Intento 1: ${fullPath}`);
          console.warn(`   - Intento 2: ${fallbackPath}`);
          return '';
        }
      }
      
      console.log(`✅ Leyendo firma desde: ${fullPath}`);
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
