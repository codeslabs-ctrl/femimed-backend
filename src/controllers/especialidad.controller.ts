import { Request, Response } from 'express';
import { supabase } from '../config/database.js';
import { ApiResponse } from '../types/index.js';

export class EspecialidadController {

  async getAllEspecialidades(_req: Request, res: Response<ApiResponse>): Promise<void> {
    try {
      // Obtener solo especialidades activas
      const { data: especialidades, error } = await supabase
        .from('especialidades')
        .select('*')
        .eq('activa', true)
        .order('nombre_especialidad', { ascending: true });

      if (error) {
        throw new Error(`Database error: ${error.message}`);
      }

      const response: ApiResponse = {
        success: true,
        data: especialidades
      };
      res.json(response);
    } catch (error) {
      const response: ApiResponse = {
        success: false,
        error: { message: (error as Error).message }
      };
      res.status(500).json(response);
    }
  }

  async getEspecialidadById(req: Request<{ id: string }, ApiResponse>, res: Response<ApiResponse>): Promise<void> {
    try {
      const { id } = req.params;
      const especialidadId = parseInt(id);

      if (isNaN(especialidadId) || especialidadId <= 0) {
        const response: ApiResponse = {
          success: false,
          error: { message: 'Invalid especialidad ID' }
        };
        res.status(400).json(response);
        return;
      }

      const { data: especialidad, error } = await supabase
        .from('especialidades')
        .select('*')
        .eq('id', especialidadId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') { // No rows found
          const response: ApiResponse = {
            success: false,
            error: { message: 'Especialidad not found' }
          };
          res.status(404).json(response);
          return;
        }
        throw new Error(`Database error: ${error.message}`);
      }

      if (!especialidad) {
        const response: ApiResponse = {
          success: false,
          error: { message: 'Especialidad not found' }
        };
        res.status(404).json(response);
        return;
      }

      const response: ApiResponse = {
        success: true,
        data: especialidad
      };
      res.json(response);
    } catch (error) {
      const response: ApiResponse = {
        success: false,
        error: { message: (error as Error).message }
      };
      res.status(500).json(response);
    }
  }

  async createEspecialidad(req: Request<{}, ApiResponse, { nombre_especialidad: string; descripcion: string }>, res: Response<ApiResponse>): Promise<void> {
    try {
      const { nombre_especialidad, descripcion } = req.body;

      if (!nombre_especialidad || !descripcion) {
        const response: ApiResponse = {
          success: false,
          error: { message: 'Nombre_especialidad and descripcion are required' }
        };
        res.status(400).json(response);
        return;
      }

      const clinicaAlias = process.env['CLINICA_ALIAS'] || 'femimed';
      
      // Crear la especialidad en la tabla especialidades (sin clinica_alias, ese campo está en especialidades_clinicas)
      const { data: newEspecialidad, error: createError } = await supabase
        .from('especialidades')
        .insert({ nombre_especialidad, descripcion })
        .select()
        .single();

      if (createError) {
        throw new Error(`Database error: ${createError.message}`);
      }

      // Crear el registro en especialidades_clinicas
      if (newEspecialidad && newEspecialidad.id) {
        // Verificar si ya existe un registro para evitar duplicados (restricción única)
        const { data: existingRecord, error: checkError } = await supabase
          .from('especialidades_clinicas')
          .select('id')
          .eq('especialidad_id', newEspecialidad.id)
          .eq('clinica_alias', clinicaAlias)
          .single();

        if (checkError && checkError.code !== 'PGRST116') {
          // PGRST116 es "no rows found", cualquier otro error es problemático
          console.error('Error verificando especialidades_clinicas:', checkError);
        }

        // Solo insertar si no existe
        if (!existingRecord) {
          const { error: clinicaError } = await supabase
            .from('especialidades_clinicas')
            .insert({
              especialidad_id: newEspecialidad.id,
              clinica_alias: clinicaAlias,
              activa: true // Activar por defecto
            });

          if (clinicaError) {
            console.error('❌ Error insertando en especialidades_clinicas:', clinicaError);
            // No fallar la creación de la especialidad, pero loguear el error
          } else {
            console.log('✅ Registro creado en especialidades_clinicas para especialidad:', newEspecialidad.id, 'clínica:', clinicaAlias);
          }
        } else {
          console.log('ℹ️ Ya existe un registro en especialidades_clinicas para esta especialidad y clínica');
        }
      }

      const response: ApiResponse = {
        success: true,
        data: newEspecialidad
      };
      res.status(201).json(response);
    } catch (error) {
      const response: ApiResponse = {
        success: false,
        error: { message: (error as Error).message }
      };
      res.status(400).json(response);
    }
  }

  async updateEspecialidad(req: Request<{ id: string }, ApiResponse, { nombre_especialidad?: string; descripcion?: string }>, res: Response<ApiResponse>): Promise<void> {
    try {
      const { id } = req.params;
      const { nombre_especialidad, descripcion } = req.body;
      const especialidadId = parseInt(id);

      if (isNaN(especialidadId) || especialidadId <= 0) {
        const response: ApiResponse = {
          success: false,
          error: { message: 'Invalid especialidad ID' }
        };
        res.status(400).json(response);
        return;
      }

      const updateData: { nombre_especialidad?: string; descripcion?: string } = {};
      if (nombre_especialidad !== undefined) updateData.nombre_especialidad = nombre_especialidad;
      if (descripcion !== undefined) updateData.descripcion = descripcion;

      const { data: updatedEspecialidad, error: updateError } = await supabase
        .from('especialidades')
        .update(updateData)
        .eq('id', especialidadId)
        .select()
        .single();

      if (updateError) {
        throw new Error(`Database error: ${updateError.message}`);
      }

      const response: ApiResponse = {
        success: true,
        data: updatedEspecialidad
      };
      res.json(response);
    } catch (error) {
      const response: ApiResponse = {
        success: false,
        error: { message: (error as Error).message }
      };
      res.status(400).json(response);
    }
  }

  async deleteEspecialidad(req: Request<{ id: string }, ApiResponse>, res: Response<ApiResponse>): Promise<void> {
    try {
      const { id } = req.params;
      const especialidadId = parseInt(id);

      if (isNaN(especialidadId) || especialidadId <= 0) {
        const response: ApiResponse = {
          success: false,
          error: { message: 'ID de especialidad inválido' }
        };
        res.status(400).json(response);
        return;
      }

      // Verificar que la especialidad existe
      const { data: especialidad, error: especialidadError } = await supabase
        .from('especialidades')
        .select('id, nombre_especialidad')
        .eq('id', especialidadId)
        .single();

      if (especialidadError || !especialidad) {
        const response: ApiResponse = {
          success: false,
          error: { message: 'Especialidad no encontrada' }
        };
        res.status(404).json(response);
        return;
      }

      // Verificar si hay médicos asociados a esta especialidad
      const { data: medicos, error: medicosError } = await supabase
        .from('medicos')
        .select('id')
        .eq('especialidad_id', especialidadId)
        .limit(1);

      if (medicosError) {
        console.error('Error verificando médicos:', medicosError);
        const response: ApiResponse = {
          success: false,
          error: { 
            message: `Error al verificar médicos asociados: ${medicosError.message}`,
            code: 'DATABASE_ERROR'
          }
        };
        res.status(500).json(response);
        return;
      }

      if (medicos && medicos.length > 0) {
        // Si hay médicos, verificar si tienen consultas para dar un mensaje más específico
        const medicosIds = medicos.map(m => m.id);
        const { data: consultas, error: consultasError } = await supabase
          .from('consultas_pacientes')
          .select('id')
          .in('medico_id', medicosIds)
          .limit(1);

        if (consultasError) {
          console.error('Error verificando consultas de médicos:', consultasError);
          // Si hay error verificando consultas, igualmente no podemos eliminar porque hay médicos
        }

        // Si hay consultas, mencionarlo en el mensaje
        const tieneConsultas = consultas && consultas.length > 0;
        const mensaje = tieneConsultas
          ? `No se puede eliminar la especialidad "${especialidad.nombre_especialidad}" porque tiene ${medicos.length} médico(s) asociado(s) con consultas registradas. Primero debe reasignar o eliminar los médicos y sus consultas asociadas.`
          : `No se puede eliminar la especialidad "${especialidad.nombre_especialidad}" porque tiene ${medicos.length} médico(s) asociado(s). Primero debe reasignar o eliminar los médicos asociados.`;

        const response: ApiResponse = {
          success: false,
          error: { 
            message: mensaje,
            code: 'HAS_ASSOCIATED_MEDICOS'
          }
        };
        res.status(400).json(response);
        return;
      }

      // Verificar si hay servicios asociados a esta especialidad
      const { data: servicios, error: serviciosError } = await supabase
        .from('servicios')
        .select('id')
        .eq('especialidad_id', especialidadId)
        .limit(1);

      if (serviciosError) {
        console.error('Error verificando servicios:', serviciosError);
        const response: ApiResponse = {
          success: false,
          error: { 
            message: `Error al verificar servicios asociados: ${serviciosError.message}`,
            code: 'DATABASE_ERROR'
          }
        };
        res.status(500).json(response);
        return;
      }

      if (servicios && servicios.length > 0) {
        const response: ApiResponse = {
          success: false,
          error: { 
            message: `No se puede eliminar la especialidad "${especialidad.nombre_especialidad}" porque tiene servicios asociados. Primero debe eliminar o reasignar los servicios.`,
            code: 'HAS_ASSOCIATED_SERVICIOS'
          }
        };
        res.status(400).json(response);
        return;
      }

      // Si no hay relaciones, proceder con la eliminación
      const { error: deleteError } = await supabase
        .from('especialidades')
        .delete()
        .eq('id', especialidadId);

      if (deleteError) {
        // Si hay un error de foreign key, proporcionar un mensaje más claro
        if (deleteError.message.includes('foreign key') || deleteError.message.includes('constraint')) {
          const response: ApiResponse = {
            success: false,
            error: { 
              message: `No se puede eliminar la especialidad "${especialidad.nombre_especialidad}" porque tiene datos asociados (médicos, consultas o servicios).`,
              code: 'FOREIGN_KEY_CONSTRAINT'
            }
          };
          res.status(400).json(response);
          return;
        }
        throw new Error(`Database error: ${deleteError.message}`);
      }

      const response: ApiResponse = {
        success: true,
        data: { 
          message: `Especialidad "${especialidad.nombre_especialidad}" eliminada exitosamente`,
          accion: 'eliminado'
        }
      };
      res.json(response);
    } catch (error) {
      console.error('Error eliminando especialidad:', error);
      const errorMessage = error instanceof Error ? error.message : 'Error desconocido al eliminar la especialidad';
      const response: ApiResponse = {
        success: false,
        error: { 
          message: errorMessage,
          code: 'INTERNAL_ERROR'
        }
      };
      res.status(500).json(response);
    }
  }

  async searchEspecialidades(req: Request<{}, ApiResponse, {}, { q?: string }>, res: Response<ApiResponse>): Promise<void> {
    try {
      const { q } = req.query;

      if (!q || typeof q !== 'string') {
        const response: ApiResponse = {
          success: false,
          error: { message: 'Search query is required' }
        };
        res.status(400).json(response);
        return;
      }

      const { data: especialidades, error } = await supabase
        .from('especialidades')
        .select('*')
        .or(`nombre_especialidad.ilike.%${q}%,descripcion.ilike.%${q}%`)
        .order('nombre_especialidad', { ascending: true });

      if (error) {
        throw new Error(`Database error: ${error.message}`);
      }

      const response: ApiResponse = {
        success: true,
        data: especialidades
      };
      res.json(response);
    } catch (error) {
      const response: ApiResponse = {
        success: false,
        error: { message: (error as Error).message }
      };
      res.status(500).json(response);
    }
  }
}
