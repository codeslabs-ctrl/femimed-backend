import { Request, Response } from 'express';
import { AntecedenteTipoService } from '../services/antecedente-tipo.service.js';
import { ApiResponse } from '../types/index.js';

export class AntecedenteTipoController {
  private service: AntecedenteTipoService;

  constructor() {
    this.service = new AntecedenteTipoService();
  }

  async getAll(_req: Request, res: Response<ApiResponse>): Promise<void> {
    try {
      const data = await this.service.getAll();
      res.json({ success: true, data });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: { message: (error as Error).message }
      });
    }
  }

  async getByTipo(req: Request<{}, ApiResponse, {}, { tipo?: string; activo?: string }>, res: Response<ApiResponse>): Promise<void> {
    try {
      const tipo = (req.query.tipo || '').trim();
      if (!tipo) {
        res.status(400).json({ success: false, error: { message: 'Query "tipo" es requerido.' } });
        return;
      }
      const soloActivos = req.query.activo !== 'false';
      const data = await this.service.getByTipo(tipo, soloActivos);
      res.json({ success: true, data });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: { message: (error as Error).message }
      });
    }
  }

  async getById(req: Request<{ id: string }>, res: Response<ApiResponse>): Promise<void> {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        res.status(400).json({ success: false, error: { message: 'ID inválido.' } });
        return;
      }
      const data = await this.service.getById(id);
      if (!data) {
        res.status(404).json({ success: false, error: { message: 'No encontrado.' } });
        return;
      }
      res.json({ success: true, data });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: { message: (error as Error).message }
      });
    }
  }

  async create(req: Request, res: Response<ApiResponse>): Promise<void> {
    try {
      const data = await this.service.create(req.body);
      res.status(201).json({ success: true, data });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: { message: (error as Error).message }
      });
    }
  }

  async update(req: Request<{ id: string }>, res: Response<ApiResponse>): Promise<void> {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        res.status(400).json({ success: false, error: { message: 'ID inválido.' } });
        return;
      }
      const data = await this.service.update(id, req.body);
      res.json({ success: true, data });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: { message: (error as Error).message }
      });
    }
  }

  async delete(req: Request<{ id: string }>, res: Response<ApiResponse>): Promise<void> {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        res.status(400).json({ success: false, error: { message: 'ID inválido.' } });
        return;
      }
      const deleted = await this.service.delete(id);
      if (!deleted) {
        res.status(404).json({ success: false, error: { message: 'No encontrado.' } });
        return;
      }
      res.json({ success: true, data: { message: 'Eliminado.' } });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: { message: (error as Error).message }
      });
    }
  }
}
