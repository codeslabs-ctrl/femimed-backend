import { Request, Response } from 'express';
import { FirmaService } from '../services/firma.service.js';
import { postgresPool } from '../config/database.js';
import { ApiResponse } from '../types/index.js';

export class FirmaController {
  private firmaService: FirmaService;
  
  constructor() {
    this.firmaService = new FirmaService();
  }
  
  /**
   * Sube la firma digital de un médico
   */
  async subirFirma(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      if (!id) {
        res.status(400).json({
          success: false,
          error: { message: 'ID de médico requerido' }
        } as ApiResponse<null>);
        return;
      }
      const medicoId = parseInt(id);
      
      if (isNaN(medicoId) || medicoId <= 0) {
        res.status(400).json({
          success: false,
          error: { message: 'ID de médico inválido' }
        } as ApiResponse<null>);
        return;
      }
      
      if (!req.file) {
        res.status(400).json({
          success: false,
          error: { message: 'No se proporcionó archivo de firma' }
        } as ApiResponse<null>);
        return;
      }
      
      // Verificar que el médico existe (PostgreSQL)
      const client = await postgresPool.connect();
      let medico: any;
      try {
        const result = await client.query(
          'SELECT id, nombres, apellidos FROM medicos WHERE id = $1 LIMIT 1',
          [medicoId]
        );
        
        if (result.rows.length === 0) {
          res.status(404).json({
            success: false,
            error: { message: 'Médico no encontrado' }
          } as ApiResponse<null>);
          return;
        }
        
        medico = result.rows[0];
      } finally {
        client.release();
      }
      
      // Eliminar firma anterior si existe
      await this.firmaService.eliminarFirma(medicoId);
      
      // Guardar nueva firma
      const rutaFirma = await this.firmaService.guardarFirma(medicoId, req.file);
      
      // Actualizar en base de datos (PostgreSQL)
      const updateClient = await postgresPool.connect();
      try {
        await updateClient.query(
          'UPDATE medicos SET firma_digital = $1 WHERE id = $2',
          [rutaFirma, medicoId]
        );
      } finally {
        updateClient.release();
      }
      
      res.json({
        success: true,
        data: { 
          firma_digital: rutaFirma,
          medico: {
            id: medico.id,
            nombres: medico.nombres,
            apellidos: medico.apellidos
          }
        },
        message: 'Firma digital subida exitosamente'
      } as ApiResponse<any>);
      
    } catch (error) {
      console.error('❌ Error en subirFirma:', error);
      res.status(500).json({
        success: false,
        error: { message: (error as Error).message }
      } as ApiResponse<null>);
    }
  }
  
  /**
   * Obtiene la firma digital de un médico
   */
  async obtenerFirma(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      if (!id) {
        res.status(400).json({
          success: false,
          error: { message: 'ID de médico requerido' }
        } as ApiResponse<null>);
        return;
      }
      const medicoId = parseInt(id);
      
      if (isNaN(medicoId) || medicoId <= 0) {
        res.status(400).json({
          success: false,
          error: { message: 'ID de médico inválido' }
        } as ApiResponse<null>);
        return;
      }
      
      const rutaFirma = await this.firmaService.obtenerFirma(medicoId);
      
      if (!rutaFirma) {
        res.status(404).json({
          success: false,
          error: { message: 'Firma digital no encontrada' }
        } as ApiResponse<null>);
        return;
      }
      
      res.json({
        success: true,
        data: { firma_digital: rutaFirma }
      } as ApiResponse<any>);
      
    } catch (error) {
      console.error('❌ Error en obtenerFirma:', error);
      res.status(500).json({
        success: false,
        error: { message: (error as Error).message }
      } as ApiResponse<null>);
    }
  }
  
  /**
   * Elimina la firma digital de un médico
   */
  async eliminarFirma(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      if (!id) {
        res.status(400).json({
          success: false,
          error: { message: 'ID de médico requerido' }
        } as ApiResponse<null>);
        return;
      }
      const medicoId = parseInt(id);
      
      if (isNaN(medicoId) || medicoId <= 0) {
        res.status(400).json({
          success: false,
          error: { message: 'ID de médico inválido' }
        } as ApiResponse<null>);
        return;
      }
      
      // Eliminar archivo físico
      await this.firmaService.eliminarFirma(medicoId);
      
      // Actualizar en base de datos (PostgreSQL)
      const client = await postgresPool.connect();
      try {
        await client.query(
          'UPDATE medicos SET firma_digital = NULL WHERE id = $1',
          [medicoId]
        );
      } finally {
        client.release();
      }
      
      res.json({
        success: true,
        message: 'Firma digital eliminada exitosamente'
      } as ApiResponse<null>);
      
    } catch (error) {
      console.error('❌ Error en eliminarFirma:', error);
      res.status(500).json({
        success: false,
        error: { message: (error as Error).message }
      } as ApiResponse<null>);
    }
  }
}
