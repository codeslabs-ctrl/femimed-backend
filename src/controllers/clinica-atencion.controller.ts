import { Request, Response } from 'express';
import clinicaAtencionService from '../services/clinica-atencion.service.js';
import { ApiResponse } from '../types/index.js';

function parseOptionalCoord(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  if (!Number.isFinite(n)) return null;
  return n;
}

/** null si OK; mensaje de error si inválido. */
function validateCoordPair(lat: number | null, lng: number | null): string | null {
  if ((lat === null) !== (lng === null)) {
    return 'latitud y longitud deben enviarse juntas o omitirse';
  }
  if (lat === null) return null;
  if (lat < -90 || lat > 90) return 'latitud debe estar entre -90 y 90';
  if (lng! < -180 || lng! > 180) return 'longitud debe estar entre -180 y 180';
  return null;
}

export class ClinicaAtencionController {
  list = async (req: Request, res: Response): Promise<void> => {
    try {
      const activosOnly = req.query['activosOnly'] !== 'false';
      const list = await clinicaAtencionService.list(activosOnly);
      res.json({ success: true, data: list } as ApiResponse<typeof list>);
    } catch (error: any) {
      console.error('ClinicaAtencionController.list:', error);
      res.status(500).json({ success: false, error: { message: error.message } });
    }
  };

  getById = async (req: Request, res: Response): Promise<void> => {
    try {
      const id = parseInt(req.params['id'] ?? '', 10);
      if (isNaN(id)) {
        res.status(400).json({ success: false, error: { message: 'ID invalido' } });
        return;
      }
      const item = await clinicaAtencionService.getById(id);
      if (!item) {
        res.status(404).json({ success: false, error: { message: 'No encontrado' } });
        return;
      }
      res.json({ success: true, data: item } as ApiResponse<typeof item>);
    } catch (error: any) {
      console.error('ClinicaAtencionController.getById:', error);
      res.status(500).json({ success: false, error: { message: error.message } });
    }
  };

  create = async (req: Request, res: Response): Promise<void> => {
    try {
      const { nombre_clinica, direccion_clinica, logo_path, logo_path_recipe, activo } = req.body;
      if (!nombre_clinica || typeof nombre_clinica !== 'string' || !nombre_clinica.trim()) {
        res.status(400).json({ success: false, error: { message: 'nombre_clinica es requerido' } });
        return;
      }
      const latitud = parseOptionalCoord(req.body?.latitud);
      const longitud = parseOptionalCoord(req.body?.longitud);
      const coordErr = validateCoordPair(latitud, longitud);
      if (coordErr) {
        res.status(400).json({ success: false, error: { message: coordErr } });
        return;
      }
      const created = await clinicaAtencionService.create({
        nombre_clinica: nombre_clinica.trim(),
        direccion_clinica: direccion_clinica ?? null,
        latitud,
        longitud,
        logo_path: logo_path ?? null,
        logo_path_recipe: logo_path_recipe ?? null,
        activo
      });
      res.status(201).json({ success: true, data: created } as ApiResponse<typeof created>);
    } catch (error: any) {
      console.error('ClinicaAtencionController.create:', error);
      res.status(500).json({ success: false, error: { message: error.message } });
    }
  };

  update = async (req: Request, res: Response): Promise<void> => {
    try {
      const id = parseInt(req.params['id'] ?? '', 10);
      if (isNaN(id)) {
        res.status(400).json({ success: false, error: { message: 'ID invalido' } });
        return;
      }
      const body = req.body as Record<string, unknown>;
      const data: Record<string, unknown> = {};
      const nombre_clinica = body['nombre_clinica'];
      const direccion_clinica = body['direccion_clinica'];
      const logo_path = body['logo_path'];
      const logo_path_recipe = body['logo_path_recipe'];
      const activo = body['activo'];
      if (nombre_clinica !== undefined) data['nombre_clinica'] = typeof nombre_clinica === 'string' ? nombre_clinica.trim() : nombre_clinica;
      if (direccion_clinica !== undefined) data['direccion_clinica'] = direccion_clinica;
      if (logo_path !== undefined) data['logo_path'] = logo_path;
      if (logo_path_recipe !== undefined) data['logo_path_recipe'] = logo_path_recipe;
      if (activo !== undefined) data['activo'] = activo;
      const hasLat = Object.prototype.hasOwnProperty.call(body, 'latitud');
      const hasLng = Object.prototype.hasOwnProperty.call(body, 'longitud');
      if (hasLat || hasLng) {
        if (!hasLat || !hasLng) {
          res.status(400).json({ success: false, error: { message: 'latitud y longitud deben enviarse juntas' } });
          return;
        }
        const latitud = parseOptionalCoord(body['latitud']);
        const longitud = parseOptionalCoord(body['longitud']);
        const coordErr = validateCoordPair(latitud, longitud);
        if (coordErr) {
          res.status(400).json({ success: false, error: { message: coordErr } });
          return;
        }
        data['latitud'] = latitud;
        data['longitud'] = longitud;
      }
      const updated = await clinicaAtencionService.update(id, data as any);
      if (!updated) {
        res.status(404).json({ success: false, error: { message: 'No encontrado' } });
        return;
      }
      res.json({ success: true, data: updated } as ApiResponse<typeof updated>);
    } catch (error: any) {
      console.error('ClinicaAtencionController.update:', error);
      res.status(500).json({ success: false, error: { message: error.message } });
    }
  };

  delete = async (req: Request, res: Response): Promise<void> => {
    try {
      const id = parseInt(req.params['id'] ?? '', 10);
      if (isNaN(id)) {
        res.status(400).json({ success: false, error: { message: 'ID invalido' } });
        return;
      }
      const deleted = await clinicaAtencionService.delete(id);
      if (!deleted) {
        res.status(404).json({ success: false, error: { message: 'No encontrado' } });
        return;
      }
      res.json({ success: true, message: 'Eliminado correctamente' });
    } catch (error: any) {
      console.error('ClinicaAtencionController.delete:', error);
      res.status(500).json({ success: false, error: { message: error.message } });
    }
  };
}
