import { Request, Response } from 'express';
import { postgresPool } from '../config/database.js';
import { ApiResponse } from '../types/index.js';
import { ExcelService } from '../services/excel.service.js';
import { FinanzasPDFService } from '../services/finanzas-pdf.service.js';

export class FinanzasController {
  
  // Obtener consultas financieras con filtros y paginación
  static async getConsultasFinancieras(req: Request, res: Response): Promise<void> {
    try {
      const { filtros, paginacion, moneda } = req.body;

      let consultas: any[] = [];

      // PostgreSQL implementation
      const client = await postgresPool.connect();
      try {
        // Construir query SQL con JOINs
          let sqlQuery = `
            SELECT 
              c.id,
              c.fecha_pautada,
              c.hora_pautada,
              c.estado_consulta,
              c.fecha_pago,
              c.metodo_pago,
              c.observaciones_financieras,
              p.nombres as paciente_nombres,
              p.apellidos as paciente_apellidos,
              p.cedula as paciente_cedula,
              m.nombres as medico_nombres,
              m.apellidos as medico_apellidos,
              e.nombre_especialidad,
              sc.id as servicio_consulta_id,
              sc.monto_pagado,
              sc.moneda_pago,
              sc.tipo_cambio,
              sc.observaciones as servicio_observaciones,
              s.id as servicio_id,
              s.nombre_servicio,
              s.monto_base,
              s.moneda as servicio_moneda,
              s.descripcion as servicio_descripcion
            FROM consultas_pacientes c
            INNER JOIN pacientes p ON c.paciente_id = p.id
            INNER JOIN medicos m ON c.medico_id = m.id
            LEFT JOIN especialidades e ON m.especialidad_id = e.id
            LEFT JOIN servicios_consulta sc ON c.id = sc.consulta_id
            LEFT JOIN servicios s ON sc.servicio_id = s.id
            WHERE 1=1
          `;
          
          const params: any[] = [];
          let paramIndex = 1;

          // Aplicar filtros
          if (filtros.fecha_desde) {
            sqlQuery += ` AND c.fecha_pautada >= $${paramIndex}`;
            params.push(filtros.fecha_desde);
            paramIndex++;
          }
          if (filtros.fecha_hasta) {
            sqlQuery += ` AND c.fecha_pautada <= $${paramIndex}`;
            params.push(filtros.fecha_hasta);
            paramIndex++;
          }
          if (filtros.medico_id) {
            sqlQuery += ` AND c.medico_id = $${paramIndex}`;
            params.push(filtros.medico_id);
            paramIndex++;
          }
          if (filtros.paciente_cedula) {
            sqlQuery += ` AND p.cedula = $${paramIndex}`;
            params.push(filtros.paciente_cedula);
            paramIndex++;
          }
          if (filtros.estado_pago && filtros.estado_pago !== 'todos') {
            if (filtros.estado_pago === 'pagado') {
              sqlQuery += ` AND c.fecha_pago IS NOT NULL`;
            } else if (filtros.estado_pago === 'pendiente') {
              sqlQuery += ` AND c.fecha_pago IS NULL`;
            }
          }

          sqlQuery += ` ORDER BY c.fecha_pautada DESC, c.id`;

          // Aplicar paginación
          if (paginacion) {
            const { pagina = 1, limite = 10 } = paginacion;
            const offset = (pagina - 1) * limite;
            sqlQuery += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
            params.push(limite, offset);
          }

          const result = await client.query(sqlQuery, params);
          
          // Agrupar resultados por consulta
          const consultasMap = new Map();
          result.rows.forEach((row: any) => {
            if (!consultasMap.has(row.id)) {
              consultasMap.set(row.id, {
                id: row.id,
                fecha_pautada: row.fecha_pautada,
                hora_pautada: row.hora_pautada,
                estado_consulta: row.estado_consulta,
                fecha_pago: row.fecha_pago,
                metodo_pago: row.metodo_pago,
                observaciones_financieras: row.observaciones_financieras,
                paciente: {
                  nombres: row.paciente_nombres,
                  apellidos: row.paciente_apellidos,
                  cedula: row.paciente_cedula
                },
                medico: {
                  nombres: row.medico_nombres,
                  apellidos: row.medico_apellidos,
                  especialidades: {
                    nombre_especialidad: row.nombre_especialidad
                  }
                },
                servicios_consulta: []
              });
            }
            
            // Agregar servicio si existe
            if (row.servicio_consulta_id) {
              const consulta = consultasMap.get(row.id);
              consulta.servicios_consulta.push({
                id: row.servicio_consulta_id,
                monto_pagado: row.monto_pagado,
                moneda_pago: row.moneda_pago,
                tipo_cambio: row.tipo_cambio,
                observaciones: row.servicio_observaciones,
                servicios: {
                  id: row.servicio_id,
                  nombre_servicio: row.nombre_servicio,
                  monto_base: row.monto_base,
                  moneda: row.servicio_moneda,
                  descripcion: row.servicio_descripcion
                }
              });
            }
          });

          consultas = Array.from(consultasMap.values());
        } finally {
          client.release();
        }

      // Filtrar consultas por moneda si se especifica
      let consultasFiltradas = consultas || [];
      if (moneda && moneda !== 'TODAS') {
        consultasFiltradas = consultasFiltradas.filter((consulta: any) => {
          // Verificar si la consulta tiene al menos un servicio con la moneda especificada
          const tieneServicioConMoneda = consulta.servicios_consulta?.some((servicio: any) => 
            servicio.moneda_pago === moneda
          );
          return tieneServicioConMoneda;
        });
      }


      // Transformar datos para el frontend
      const consultasTransformadas = consultasFiltradas?.map((consulta: any) => {
        // Calcular total de la consulta sumando servicios (se actualizará después del filtro)

        // Filtrar servicios por moneda si se especifica
        let serviciosFiltrados = consulta.servicios_consulta || [];
        if (moneda && moneda !== 'TODAS') {
          serviciosFiltrados = serviciosFiltrados.filter((servicio: any) => 
            servicio.moneda_pago === moneda
          );
        }

        // Calcular total de la consulta sumando solo los servicios filtrados
        const totalConsulta = serviciosFiltrados.reduce((sum: number, servicio: any) => {
          return sum + (servicio.monto_pagado || 0);
        }, 0);

        // Transformar servicios para el frontend
        const serviciosTransformados = serviciosFiltrados.map((servicio: any) => ({
          id: servicio.id,
          nombre_servicio: (servicio.servicios as any)?.nombre_servicio || '',
          descripcion: (servicio.servicios as any)?.descripcion || '',
          precio_unitario: (servicio.servicios as any)?.monto_base || 0,
          cantidad: 1, // Por defecto 1 servicio
          subtotal: servicio.monto_pagado,
          descuento: 0, // Por defecto sin descuento
          total_servicio: servicio.monto_pagado,
          moneda_pago: servicio.moneda_pago,
          tipo_cambio: servicio.tipo_cambio,
          observaciones: servicio.observaciones
        }));

        // Determinar la moneda principal de los servicios filtrados
        const monedas = serviciosFiltrados.map((s: any) => s.moneda_pago);
        const monedaPrincipal = monedas.length > 0 ? monedas[0] : 'COP';

        return {
          id: consulta.id,
          paciente_nombre: (consulta.paciente as any)?.nombres || '',
          paciente_apellidos: (consulta.paciente as any)?.apellidos || '',
          paciente_cedula: (consulta.paciente as any)?.cedula || '',
          medico_nombre: (consulta.medico as any)?.nombres || '',
          medico_apellidos: (consulta.medico as any)?.apellidos || '',
          especialidad_nombre: (consulta.medico as any)?.especialidades?.nombre_especialidad || '',
          fecha_consulta: consulta.fecha_pautada,
          hora_consulta: consulta.hora_pautada,
          estado_consulta: consulta.fecha_pago ? 'pagado' : 'pendiente',
          servicios: serviciosTransformados,
          total_consulta: totalConsulta,
          moneda_principal: monedaPrincipal,
          fecha_pago: consulta.fecha_pago,
          metodo_pago: consulta.metodo_pago,
          observaciones_financieras: consulta.observaciones_financieras
        };
      }) || [];

      // Obtener total de registros para paginación
      let totalRegistros = consultas.length;
      if (paginacion) {
        // PostgreSQL implementation
        const client = await postgresPool.connect();
        try {
          let countQuery = `
            SELECT COUNT(DISTINCT c.id)
            FROM consultas_pacientes c
            INNER JOIN pacientes p ON c.paciente_id = p.id
            WHERE 1=1
          `;
          
          const params: any[] = [];
          let paramIndex = 1;

          if (filtros.fecha_desde) {
            countQuery += ` AND c.fecha_pautada >= $${paramIndex}`;
            params.push(filtros.fecha_desde);
            paramIndex++;
          }
          if (filtros.fecha_hasta) {
            countQuery += ` AND c.fecha_pautada <= $${paramIndex}`;
            params.push(filtros.fecha_hasta);
            paramIndex++;
          }
          if (filtros.medico_id) {
            countQuery += ` AND c.medico_id = $${paramIndex}`;
            params.push(filtros.medico_id);
            paramIndex++;
          }
          if (filtros.paciente_cedula) {
            countQuery += ` AND p.cedula = $${paramIndex}`;
            params.push(filtros.paciente_cedula);
            paramIndex++;
          }
          if (filtros.estado_pago && filtros.estado_pago !== 'todos') {
            if (filtros.estado_pago === 'pagado') {
              countQuery += ` AND c.fecha_pago IS NOT NULL`;
            } else if (filtros.estado_pago === 'pendiente') {
              countQuery += ` AND c.fecha_pago IS NULL`;
            }
          }

          const countResult = await client.query(countQuery, params);
          totalRegistros = parseInt(countResult.rows[0].count) || 0;
        } finally {
          client.release();
        }
      }
      
      // Aplicar filtro de moneda al conteo si es necesario
      if (moneda && moneda !== 'TODAS') {
        const consultasParaContar = consultas.filter(consulta => {
          return consulta.servicios_consulta?.some((servicio: any) => 
            servicio.moneda_pago === moneda
          );
        });
        totalRegistros = consultasParaContar.length;
      }
      
      console.log('📊 Total registros calculado:', totalRegistros);

      const paginacionInfo = paginacion ? {
        pagina_actual: paginacion.pagina || 1,
        limite: paginacion.limite || 10,
        total_registros: totalRegistros,
        total_paginas: Math.ceil(totalRegistros / (paginacion.limite || 10)),
        tiene_siguiente: (paginacion.pagina || 1) < Math.ceil(totalRegistros / (paginacion.limite || 10)),
        tiene_anterior: (paginacion.pagina || 1) > 1
      } : null;

      res.json({
        success: true,
        data: consultasTransformadas,
        paginacion: paginacionInfo
      } as ApiResponse<any>);
    } catch (error) {
      console.error('Error in getConsultasFinancieras:', error);
      res.status(500).json({
        success: false,
        error: { message: 'Error interno del servidor' }
      } as ApiResponse<null>);
    }
  }

  // Obtener resumen financiero con separación por moneda
  static async getResumenFinanciero(req: Request, res: Response): Promise<void> {
    try {
      const { filtros, moneda } = req.body;

      let consultas: any[] = [];

      // PostgreSQL implementation
      const client = await postgresPool.connect();
      try {
        // Construir query SQL con JOINs para obtener datos necesarios
        let sqlQuery = `
          SELECT 
            c.id,
            c.fecha_pago,
            m.nombres as medico_nombres,
            m.apellidos as medico_apellidos,
            e.nombre_especialidad,
            sc.monto_pagado,
            sc.moneda_pago
          FROM consultas_pacientes c
          INNER JOIN medicos m ON c.medico_id = m.id
          LEFT JOIN especialidades e ON m.especialidad_id = e.id
          LEFT JOIN servicios_consulta sc ON c.id = sc.consulta_id
          WHERE 1=1
        `;
        
        const params: any[] = [];
        let paramIndex = 1;

        // Aplicar filtros de fecha
        if (filtros.fecha_desde) {
          sqlQuery += ` AND c.fecha_pautada >= $${paramIndex}`;
          params.push(filtros.fecha_desde);
          paramIndex++;
        }
        if (filtros.fecha_hasta) {
          sqlQuery += ` AND c.fecha_pautada <= $${paramIndex}`;
          params.push(filtros.fecha_hasta);
          paramIndex++;
        }
        if (filtros.medico_id) {
          sqlQuery += ` AND c.medico_id = $${paramIndex}`;
          params.push(filtros.medico_id);
          paramIndex++;
        }

        const result = await client.query(sqlQuery, params);
        
        // Agrupar resultados por consulta
        const consultasMap = new Map();
        result.rows.forEach((row: any) => {
          if (!consultasMap.has(row.id)) {
            consultasMap.set(row.id, {
              id: row.id,
              fecha_pago: row.fecha_pago,
              medico: {
                nombres: row.medico_nombres,
                apellidos: row.medico_apellidos,
                especialidades: {
                  nombre_especialidad: row.nombre_especialidad
                }
              },
              servicios_consulta: []
            });
          }
          
          // Agregar servicio si existe
          if (row.monto_pagado !== null) {
            const consulta = consultasMap.get(row.id);
            consulta.servicios_consulta.push({
              monto_pagado: row.monto_pagado,
              moneda_pago: row.moneda_pago
            });
          }
        });

        consultas = Array.from(consultasMap.values());
      } finally {
        client.release();
      }

      // Aplicar filtro de moneda post-query
      let consultasFiltradas = consultas || [];
      if (moneda && moneda !== 'TODAS') {
        consultasFiltradas = consultas?.filter((consulta: any) => 
          consulta.servicios_consulta?.some((servicio: any) => servicio.moneda_pago === moneda)
        ) || [];
      }

      // Calcular estadísticas con datos filtrados
      const totalConsultas = consultasFiltradas.length;
      
      // Calcular total de ingresos sumando servicios (solo de la moneda filtrada)
      const totalIngresos = consultasFiltradas.reduce((sum: number, consulta: any) => {
        const totalConsulta = consulta.servicios_consulta?.reduce((servicioSum: number, servicio: any) => {
          // Solo sumar servicios de la moneda seleccionada
          if (moneda && moneda !== 'TODAS' && servicio.moneda_pago !== moneda) {
            return servicioSum;
          }
          return servicioSum + (servicio.monto_pagado || 0);
        }, 0) || 0;
        return sum + totalConsulta;
      }, 0);
      
      const consultasPagadas = consultasFiltradas.filter((c: any) => c.fecha_pago).length;
      const consultasPendientes = totalConsultas - consultasPagadas;

      // Calcular totales por especialidad
      const totalPorEspecialidad: { [key: string]: number } = {};
      consultasFiltradas.forEach((consulta: any) => {
        const especialidad = (consulta.medico as any)?.especialidades?.nombre_especialidad || 'Sin especialidad';
        const totalConsulta = consulta.servicios_consulta?.reduce((sum: number, servicio: any) => {
          // Solo sumar servicios de la moneda seleccionada
          if (moneda && moneda !== 'TODAS' && servicio.moneda_pago !== moneda) {
            return sum;
          }
          return sum + (servicio.monto_pagado || 0);
        }, 0) || 0;
        totalPorEspecialidad[especialidad] = (totalPorEspecialidad[especialidad] || 0) + totalConsulta;
      });

      // Calcular totales por médico
      const totalPorMedico: { [key: string]: number } = {};
      consultasFiltradas.forEach((consulta: any) => {
        const medico = `${(consulta.medico as any)?.nombres || ''} ${(consulta.medico as any)?.apellidos || ''}`.trim() || 'Sin médico';
        const totalConsulta = consulta.servicios_consulta?.reduce((sum: number, servicio: any) => {
          // Solo sumar servicios de la moneda seleccionada
          if (moneda && moneda !== 'TODAS' && servicio.moneda_pago !== moneda) {
            return sum;
          }
          return sum + (servicio.monto_pagado || 0);
        }, 0) || 0;
        totalPorMedico[medico] = (totalPorMedico[medico] || 0) + totalConsulta;
      });

      // Calcular estadísticas por moneda
      const estadisticasPorMoneda: { [key: string]: any } = {};
      const monedas = [...new Set(consultas?.flatMap((c: any) => 
        c.servicios_consulta?.map((s: any) => s.moneda_pago).filter(Boolean) || []
      ) || [])];

      monedas.forEach(monedaItem => {
        const consultasMoneda = consultas?.filter((consulta: any) => 
          consulta.servicios_consulta?.some((servicio: any) => servicio.moneda_pago === monedaItem)
        ) || [];

        const totalConsultasMoneda = consultasMoneda.length;
        const totalIngresosMoneda = consultasMoneda.reduce((sum: number, consulta: any) => {
          const totalConsulta = consulta.servicios_consulta?.reduce((servicioSum: number, servicio: any) => {
            return servicioSum + (servicio.moneda_pago === monedaItem ? (servicio.monto_pagado || 0) : 0);
          }, 0) || 0;
          return sum + totalConsulta;
        }, 0);

        const consultasPagadasMoneda = consultasMoneda.filter(c => c.fecha_pago).length;
        const consultasPendientesMoneda = totalConsultasMoneda - consultasPagadasMoneda;

        estadisticasPorMoneda[monedaItem] = {
          total_consultas: totalConsultasMoneda,
          total_ingresos: totalIngresosMoneda,
          consultas_pagadas: consultasPagadasMoneda,
          consultas_pendientes: consultasPendientesMoneda,
          promedio_por_consulta: totalConsultasMoneda > 0 ? totalIngresosMoneda / totalConsultasMoneda : 0
        };
      });

      const resumen = {
        total_consultas: totalConsultas,
        total_ingresos: totalIngresos,
        total_por_especialidad: totalPorEspecialidad,
        total_por_medico: totalPorMedico,
        consultas_pagadas: consultasPagadas,
        consultas_pendientes: consultasPendientes,
        estadisticas_por_moneda: estadisticasPorMoneda,
        moneda_filtrada: moneda || 'TODAS'
      };

      res.json({
        success: true,
        data: resumen
      } as ApiResponse<any>);
    } catch (error) {
      console.error('Error in getResumenFinanciero:', error);
      res.status(500).json({
        success: false,
        error: { message: 'Error interno del servidor' }
      } as ApiResponse<null>);
    }
  }

  // Marcar consulta como pagada
  static async marcarConsultaPagada(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { fecha_pago, metodo_pago, observaciones } = req.body;

      if (!fecha_pago || !metodo_pago) {
        res.status(400).json({
          success: false,
          error: { message: 'Fecha de pago y método de pago son requeridos' }
        } as ApiResponse<null>);
        return;
      }

      const client = await postgresPool.connect();
      try {
        const result = await client.query(
          `UPDATE consultas_pacientes 
           SET fecha_pago = $1,
               metodo_pago = $2,
               observaciones_financieras = $3
           WHERE id = $4
           RETURNING *`,
          [fecha_pago, metodo_pago, observaciones || null, id]
        );

        if (result.rows.length === 0) {
          res.status(404).json({
            success: false,
            error: { message: 'Consulta no encontrada' }
          } as ApiResponse<null>);
          return;
        }

        res.json({
          success: true,
          data: { message: 'Consulta marcada como pagada exitosamente' }
        } as ApiResponse<any>);
      } catch (dbError) {
        console.error('Error updating consulta:', dbError);
        res.status(500).json({
          success: false,
          error: { message: 'Error al marcar consulta como pagada' }
        } as ApiResponse<null>);
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Error in marcarConsultaPagada:', error);
      res.status(500).json({
        success: false,
        error: { message: 'Error interno del servidor' }
      } as ApiResponse<null>);
    }
  }

  // Exportar reporte financiero
  static async exportarReporte(req: Request, res: Response): Promise<void> {
    try {
      const { formato, filtros } = req.body;
      console.log('🔍 FILTROS RECIBIDOS EN EXPORTACIÓN:', filtros);
      
      
      // Obtener datos para el reporte con los mismos filtros que las consultas
      const client = await postgresPool.connect();
      try {
        // Construir query SQL con JOINs (igual que getConsultasFinancieras)
        let sqlQuery = `
          SELECT 
            c.id,
            c.fecha_pautada,
            c.hora_pautada,
            c.estado_consulta,
            c.fecha_pago,
            c.metodo_pago,
            c.observaciones_financieras,
            p.nombres as paciente_nombres,
            p.apellidos as paciente_apellidos,
            p.cedula as paciente_cedula,
            m.nombres as medico_nombres,
            m.apellidos as medico_apellidos,
            e.nombre_especialidad,
            sc.id as servicio_consulta_id,
            sc.monto_pagado,
            sc.moneda_pago,
            sc.tipo_cambio,
            sc.observaciones as servicio_observaciones,
            s.id as servicio_id,
            s.nombre_servicio,
            s.monto_base,
            s.moneda as servicio_moneda,
            s.descripcion as servicio_descripcion
          FROM consultas_pacientes c
          INNER JOIN pacientes p ON c.paciente_id = p.id
          INNER JOIN medicos m ON c.medico_id = m.id
          LEFT JOIN especialidades e ON m.especialidad_id = e.id
          LEFT JOIN servicios_consulta sc ON c.id = sc.consulta_id
          LEFT JOIN servicios s ON sc.servicio_id = s.id
          WHERE 1=1
        `;
        
        const params: any[] = [];
        let paramIndex = 1;

        // Aplicar filtros (igual que en getConsultasFinancieras)
        if (filtros?.fecha_desde) {
          sqlQuery += ` AND c.fecha_pautada >= $${paramIndex}`;
          params.push(filtros.fecha_desde);
          paramIndex++;
        }
        if (filtros?.fecha_hasta) {
          sqlQuery += ` AND c.fecha_pautada <= $${paramIndex}`;
          params.push(filtros.fecha_hasta);
          paramIndex++;
        }
        if (filtros?.medico_id) {
          sqlQuery += ` AND c.medico_id = $${paramIndex}`;
          params.push(filtros.medico_id);
          paramIndex++;
        }
        if (filtros?.paciente_cedula) {
          sqlQuery += ` AND p.cedula = $${paramIndex}`;
          params.push(filtros.paciente_cedula);
          paramIndex++;
        }
        if (filtros?.estado_pago && filtros.estado_pago !== 'todos') {
          if (filtros.estado_pago === 'pagado') {
            sqlQuery += ` AND c.fecha_pago IS NOT NULL`;
          } else if (filtros.estado_pago === 'pendiente') {
            sqlQuery += ` AND c.fecha_pago IS NULL`;
          }
        }

        sqlQuery += ` ORDER BY c.fecha_pautada DESC, c.id LIMIT 1000`;

        const result = await client.query(sqlQuery, params);
        
        // Agrupar resultados por consulta (igual que getConsultasFinancieras)
        const consultasMap = new Map();
        result.rows.forEach((row: any) => {
          if (!consultasMap.has(row.id)) {
            consultasMap.set(row.id, {
              id: row.id,
              fecha_pautada: row.fecha_pautada,
              hora_pautada: row.hora_pautada,
              estado_consulta: row.estado_consulta,
              fecha_pago: row.fecha_pago,
              metodo_pago: row.metodo_pago,
              observaciones_financieras: row.observaciones_financieras,
              paciente: {
                nombres: row.paciente_nombres,
                apellidos: row.paciente_apellidos,
                cedula: row.paciente_cedula
              },
              medico: {
                nombres: row.medico_nombres,
                apellidos: row.medico_apellidos,
                especialidades: {
                  nombre_especialidad: row.nombre_especialidad
                }
              },
              servicios_consulta: []
            });
          }
          
          // Agregar servicio si existe
          if (row.servicio_consulta_id) {
            const consulta = consultasMap.get(row.id);
            consulta.servicios_consulta.push({
              id: row.servicio_consulta_id,
              monto_pagado: row.monto_pagado,
              moneda_pago: row.moneda_pago,
              tipo_cambio: row.tipo_cambio,
              observaciones: row.servicio_observaciones,
              servicios: {
                id: row.servicio_id,
                nombre_servicio: row.nombre_servicio,
                monto_base: row.monto_base,
                moneda: row.servicio_moneda,
                descripcion: row.servicio_descripcion
              }
            });
          }
        });

        const consultas = Array.from(consultasMap.values());

        console.log('📊 CONSULTAS OBTENIDAS PARA EXPORTACIÓN:', consultas?.length || 0);
        console.log('🔍 PRIMERAS 3 CONSULTAS:', consultas?.slice(0, 3).map((c: any) => ({ id: c.id, servicios: c.servicios_consulta?.length || 0 })));

        // Aplicar filtro de moneda si se especifica (igual que en getConsultasFinancieras)
        let consultasFiltradas = consultas || [];
        if (filtros?.moneda && filtros.moneda !== 'TODAS') {
          console.log('🔍 APLICANDO FILTRO DE MONEDA EN EXPORTACIÓN:', filtros.moneda);
          consultasFiltradas = consultasFiltradas.filter((consulta: any) => {
            const tieneServicioConMoneda = consulta.servicios_consulta?.some((servicio: any) => 
              servicio.moneda_pago === filtros.moneda
            );
            return tieneServicioConMoneda;
          });
          console.log('📊 CONSULTAS DESPUÉS DEL FILTRO DE MONEDA:', consultasFiltradas.length);
        } else {
          console.log('🔍 SIN FILTRO DE MONEDA - USANDO TODAS LAS CONSULTAS');
        }

        // Generar archivo según el formato solicitado
        if (formato === 'pdf') {
          const pdfService = new FinanzasPDFService();
          // Crear opciones básicas para el filtro de moneda
          const opciones = {
            moneda: filtros?.moneda || 'TODAS',
            formato: formato
          };
          const pdfBuffer = await pdfService.generarPDFReporteFinanciero(consultasFiltradas, filtros, opciones);
          
          // Configurar headers para descarga de PDF
          const timestamp = new Date().getTime();
          res.setHeader('Content-Type', 'application/pdf');
          res.setHeader('Content-Disposition', `attachment; filename="reporte-financiero-${timestamp}.pdf"`);
          res.setHeader('Content-Length', pdfBuffer.length);
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          res.setHeader('Pragma', 'no-cache');
          res.setHeader('Expires', '0');
          
          res.send(pdfBuffer);
        } else if (formato === 'excel') {
          const excelService = new ExcelService();
          // Crear opciones básicas para el filtro de moneda
          const opciones = {
            moneda: filtros?.moneda || 'TODAS',
            formato: formato
          };
          const excelBuffer = await excelService.generarExcelReporteFinanciero(consultasFiltradas, filtros, opciones);
          
          // Configurar headers para mostrar Excel en el navegador
          const timestamp = new Date().getTime();
          res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
          res.setHeader('Content-Disposition', `inline; filename="reporte-financiero-${timestamp}.xlsx"`);
          res.setHeader('Content-Length', excelBuffer.length);
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          res.setHeader('Pragma', 'no-cache');
          res.setHeader('Expires', '0');
          res.setHeader('X-Content-Type-Options', 'nosniff');
          res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
          
          res.send(excelBuffer);
        } else {
          res.status(400).json({
            success: false,
            error: { message: 'Formato no soportado. Use "pdf" o "excel"' }
          } as ApiResponse<null>);
        }
      } catch (dbError) {
        console.error('Error fetching data for export:', dbError);
        res.status(500).json({
          success: false,
          error: { message: 'Error al obtener datos para exportar' }
        } as ApiResponse<null>);
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Error in exportarReporte:', error);
      res.status(500).json({
        success: false,
        error: { message: 'Error interno del servidor' }
      } as ApiResponse<null>);
    }
  }

  // Exportar reporte avanzado con opciones
  static async exportarReporteAvanzado(req: Request, res: Response): Promise<void> {
    try {
      console.log('🔍 EXPORTACIÓN AVANZADA - BODY COMPLETO:', JSON.stringify(req.body, null, 2));
      
      const { filtros, opciones } = req.body;
      
      // Validar que los datos requeridos estén presentes
      if (!filtros) {
        console.error('❌ Filtros no encontrados en el body');
        res.status(400).json({
          success: false,
          error: { message: 'Filtros son requeridos' }
        } as ApiResponse<null>);
        return;
      }
      
      if (!opciones) {
        console.error('❌ Opciones no encontradas en el body');
        res.status(400).json({
          success: false,
          error: { message: 'Opciones son requeridas' }
        } as ApiResponse<null>);
        return;
      }
      
      const formato = opciones?.formato || 'pdf'; // Extraer formato de las opciones
      console.log('🔍 EXPORTACIÓN AVANZADA - DATOS RECIBIDOS:');
      console.log('📋 Formato:', formato);
      console.log('📋 Filtros:', filtros);
      console.log('📋 Opciones:', opciones);
      
      
      // Obtener datos para el reporte con filtros avanzados
      const client = await postgresPool.connect();
      try {
        // Construir query SQL con JOINs (igual que getConsultasFinancieras)
        let sqlQuery = `
          SELECT 
            c.id,
            c.fecha_pautada,
            c.hora_pautada,
            c.estado_consulta,
            c.fecha_pago,
            c.metodo_pago,
            c.observaciones_financieras,
            p.nombres as paciente_nombres,
            p.apellidos as paciente_apellidos,
            p.cedula as paciente_cedula,
            m.nombres as medico_nombres,
            m.apellidos as medico_apellidos,
            e.nombre_especialidad,
            sc.id as servicio_consulta_id,
            sc.monto_pagado,
            sc.moneda_pago,
            sc.tipo_cambio,
            sc.observaciones as servicio_observaciones,
            s.id as servicio_id,
            s.nombre_servicio,
            s.monto_base,
            s.moneda as servicio_moneda,
            s.descripcion as servicio_descripcion
          FROM consultas_pacientes c
          INNER JOIN pacientes p ON c.paciente_id = p.id
          INNER JOIN medicos m ON c.medico_id = m.id
          LEFT JOIN especialidades e ON m.especialidad_id = e.id
          LEFT JOIN servicios_consulta sc ON c.id = sc.consulta_id
          LEFT JOIN servicios s ON sc.servicio_id = s.id
          WHERE 1=1
        `;
        
        const params: any[] = [];
        let paramIndex = 1;

        // Aplicar filtros (igual que en getConsultasFinancieras)
        if (filtros?.fecha_desde) {
          sqlQuery += ` AND c.fecha_pautada >= $${paramIndex}`;
          params.push(filtros.fecha_desde);
          paramIndex++;
        }
        if (filtros?.fecha_hasta) {
          sqlQuery += ` AND c.fecha_pautada <= $${paramIndex}`;
          params.push(filtros.fecha_hasta);
          paramIndex++;
        }
        if (filtros?.medico_id) {
          sqlQuery += ` AND c.medico_id = $${paramIndex}`;
          params.push(filtros.medico_id);
          paramIndex++;
        }
        if (filtros?.paciente_cedula) {
          sqlQuery += ` AND p.cedula = $${paramIndex}`;
          params.push(filtros.paciente_cedula);
          paramIndex++;
        }
        if (filtros?.estado_pago && filtros.estado_pago !== 'todos') {
          if (filtros.estado_pago === 'pagado') {
            sqlQuery += ` AND c.fecha_pago IS NOT NULL`;
          } else if (filtros.estado_pago === 'pendiente') {
            sqlQuery += ` AND c.fecha_pago IS NULL`;
          }
        }

        sqlQuery += ` ORDER BY c.fecha_pautada DESC, c.id LIMIT 1000`;

        const result = await client.query(sqlQuery, params);
        
        // Agrupar resultados por consulta (igual que getConsultasFinancieras)
        const consultasMap = new Map();
        result.rows.forEach((row: any) => {
          if (!consultasMap.has(row.id)) {
            consultasMap.set(row.id, {
              id: row.id,
              fecha_pautada: row.fecha_pautada,
              hora_pautada: row.hora_pautada,
              estado_consulta: row.estado_consulta,
              fecha_pago: row.fecha_pago,
              metodo_pago: row.metodo_pago,
              observaciones_financieras: row.observaciones_financieras,
              paciente: {
                nombres: row.paciente_nombres,
                apellidos: row.paciente_apellidos,
                cedula: row.paciente_cedula
              },
              medico: {
                nombres: row.medico_nombres,
                apellidos: row.medico_apellidos,
                especialidades: {
                  nombre_especialidad: row.nombre_especialidad
                }
              },
              servicios_consulta: []
            });
          }
          
          // Agregar servicio si existe
          if (row.servicio_consulta_id) {
            const consulta = consultasMap.get(row.id);
            consulta.servicios_consulta.push({
              id: row.servicio_consulta_id,
              monto_pagado: row.monto_pagado,
              moneda_pago: row.moneda_pago,
              tipo_cambio: row.tipo_cambio,
              observaciones: row.servicio_observaciones,
              servicios: {
                id: row.servicio_id,
                nombre_servicio: row.nombre_servicio,
                monto_base: row.monto_base,
                moneda: row.servicio_moneda,
                descripcion: row.servicio_descripcion
              }
            });
          }
        });

        const consultas = Array.from(consultasMap.values());

        console.log('📊 CONSULTAS OBTENIDAS PARA EXPORTACIÓN AVANZADA:', consultas?.length || 0);

        // Aplicar filtro de moneda si se especifica (post-consulta, igual que en getConsultasFinancieras)
        let consultasFiltradas = consultas || [];
        if (opciones?.moneda && opciones.moneda !== 'TODAS') {
          console.log('🔍 APLICANDO FILTRO DE MONEDA EN EXPORTACIÓN AVANZADA:', opciones.moneda);
          consultasFiltradas = consultasFiltradas.filter((consulta: any) => {
            const tieneServicioConMoneda = consulta.servicios_consulta?.some((servicio: any) => 
              servicio.moneda_pago === opciones.moneda
            );
            return tieneServicioConMoneda;
          });
          console.log('📊 CONSULTAS DESPUÉS DEL FILTRO DE MONEDA:', consultasFiltradas.length);
        } else {
          console.log('🔍 SIN FILTRO DE MONEDA - USANDO TODAS LAS CONSULTAS');
        }

        // Generar archivo según el formato solicitado
        if (formato === 'pdf') {
          const pdfService = new FinanzasPDFService();
          const pdfBuffer = await pdfService.generarPDFReporteFinanciero(consultasFiltradas, filtros, opciones);
          
          // Configurar headers para descarga de PDF
          const timestamp = new Date().getTime();
          res.setHeader('Content-Type', 'application/pdf');
          res.setHeader('Content-Disposition', `attachment; filename="reporte-financiero-avanzado-${timestamp}.pdf"`);
          res.setHeader('Content-Length', pdfBuffer.length);
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          res.setHeader('Pragma', 'no-cache');
          res.setHeader('Expires', '0');
          
          res.send(pdfBuffer);
        } else if (formato === 'excel') {
          const excelService = new ExcelService();
          const excelBuffer = await excelService.generarExcelReporteFinanciero(consultasFiltradas, filtros, opciones);
          
          // Configurar headers para mostrar Excel en el navegador
          const timestamp = new Date().getTime();
          res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
          res.setHeader('Content-Disposition', `inline; filename="reporte-financiero-avanzado-${timestamp}.xlsx"`);
          res.setHeader('Content-Length', excelBuffer.length);
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          res.setHeader('Pragma', 'no-cache');
          res.setHeader('Expires', '0');
          res.setHeader('X-Content-Type-Options', 'nosniff');
          res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
          
          res.send(excelBuffer);
        } else {
          res.status(400).json({
            success: false,
            error: { message: 'Formato no soportado. Use "pdf" o "excel"' }
          } as ApiResponse<null>);
        }
      } catch (dbError) {
        console.error('Error fetching data for advanced export:', dbError);
        res.status(500).json({
          success: false,
          error: { message: 'Error al obtener datos para exportación avanzada' }
        } as ApiResponse<null>);
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Error in exportarReporteAvanzado:', error);
      res.status(500).json({
        success: false,
        error: { message: 'Error interno del servidor' }
      } as ApiResponse<null>);
    }
  }
}
