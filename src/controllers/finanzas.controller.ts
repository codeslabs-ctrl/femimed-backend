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
      
      console.log('🔍 ========== INICIO getConsultasFinancieras ==========');
      console.log('🔍 Filtros recibidos:', JSON.stringify(filtros, null, 2));
      console.log('🔍 Paginación:', JSON.stringify(paginacion, null, 2));
      console.log('🔍 Moneda:', moneda);

      let consultas: any[] = [];

      // PostgreSQL implementation
      const client = await postgresPool.connect();
      try {
        // Construir query SQL con JOINs
        // Obtener todas las consultas finalizadas (sin DISTINCT ON ya que obtenemos servicios por separado)
          let sqlQuery = `
            SELECT DISTINCT
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
              e.nombre_especialidad
            FROM consultas_pacientes c
            INNER JOIN pacientes p ON c.paciente_id = p.id
            INNER JOIN medicos m ON c.medico_id = m.id
            LEFT JOIN especialidades e ON m.especialidad_id = e.id
            WHERE LOWER(TRIM(c.estado_consulta)) = 'finalizada'
          `;
          
          // Agregar filtros de fecha, médico, etc.
          const params: any[] = [];
          let paramIndex = 1;

          // Aplicar filtros
          // Para consultas finalizadas, usar fecha_culminacion si existe, sino fecha_pautada
          if (filtros.fecha_desde) {
            sqlQuery += ` AND COALESCE(c.fecha_culminacion::date, c.fecha_pautada) >= $${paramIndex}::date`;
            params.push(filtros.fecha_desde);
            paramIndex++;
          }
          if (filtros.fecha_hasta) {
            sqlQuery += ` AND COALESCE(c.fecha_culminacion::date, c.fecha_pautada) <= $${paramIndex}::date`;
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

          sqlQuery += ` ORDER BY c.fecha_pautada DESC, c.id DESC`;

          // Aplicar paginación ANTES de obtener servicios
          if (paginacion) {
            const { pagina = 1, limite = 10 } = paginacion;
            const offset = (pagina - 1) * limite;
            sqlQuery += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
            params.push(limite, offset);
            paramIndex += 2;
          }

          // Ejecutar consulta de consultas
          console.log('🔍 SQL Query:', sqlQuery);
          console.log('🔍 Parámetros:', params);
          const consultasResult = await client.query(sqlQuery, params);
          
          console.log('📊 Consultas encontradas con estado finalizada:', consultasResult.rows.length);
          
          // Verificar específicamente la consulta con ID 4
          const consulta4Query = `
            SELECT 
              c.id,
              c.estado_consulta,
              LOWER(TRIM(c.estado_consulta)) as estado_trimmed,
              c.fecha_pautada,
              c.fecha_culminacion,
              c.fecha_pago,
              COUNT(sc.id) as total_servicios,
              STRING_AGG(sc.moneda_pago, ', ') as monedas
            FROM consultas_pacientes c
            LEFT JOIN servicios_consulta sc ON c.id = sc.consulta_id
            WHERE c.id = 4
            GROUP BY c.id, c.estado_consulta, c.fecha_pautada, c.fecha_culminacion, c.fecha_pago
          `;
          const consulta4Result = await client.query(consulta4Query);
          console.log('🔍 Consulta ID 4 (detalle completo):', JSON.stringify(consulta4Result.rows[0] || 'No encontrada', null, 2));
          
          // Verificar si pasa el filtro de estado
          if (consulta4Result.rows[0]) {
            const estado = consulta4Result.rows[0].estado_consulta;
            const estadoTrimmed = consulta4Result.rows[0].estado_trimmed;
            console.log('🔍 Estado consulta 4:', estado, '| Trimmed:', estadoTrimmed, '| Coincide con "finalizada":', estadoTrimmed === 'finalizada');
            
            // Verificar filtros de fecha
            const fechaPautada = consulta4Result.rows[0].fecha_pautada;
            const fechaCulminacion = consulta4Result.rows[0].fecha_culminacion;
            const fechaComparar = fechaCulminacion ? new Date(fechaCulminacion).toISOString().split('T')[0] : fechaPautada;
            const pasaFiltroDesde = !filtros.fecha_desde || fechaComparar >= filtros.fecha_desde;
            const pasaFiltroHasta = !filtros.fecha_hasta || fechaComparar <= filtros.fecha_hasta;
            console.log('🔍 Fechas consulta 4:', {
              fecha_pautada: fechaPautada,
              fecha_culminacion: fechaCulminacion,
              fecha_comparar: fechaComparar,
              filtro_desde: filtros.fecha_desde,
              filtro_hasta: filtros.fecha_hasta,
              pasa_filtro_desde: pasaFiltroDesde,
              pasa_filtro_hasta: pasaFiltroHasta,
              pasa_ambos_filtros: pasaFiltroDesde && pasaFiltroHasta
            });
            
            if (!pasaFiltroDesde || !pasaFiltroHasta) {
              console.log('⚠️ Consulta 4 NO pasa los filtros de fecha');
            } else {
              console.log('✅ Consulta 4 SÍ pasa los filtros de fecha');
            }
          }
          
          // Verificar todas las consultas finalizadas sin filtros
          const todasFinalizadasQuery = `
            SELECT 
              c.id,
              c.estado_consulta,
              LOWER(TRIM(c.estado_consulta)) as estado_trimmed,
              c.fecha_pautada,
              c.fecha_culminacion,
              COUNT(sc.id) as total_servicios
            FROM consultas_pacientes c
            LEFT JOIN servicios_consulta sc ON c.id = sc.consulta_id
            WHERE LOWER(TRIM(c.estado_consulta)) = 'finalizada'
            GROUP BY c.id, c.estado_consulta, c.fecha_pautada, c.fecha_culminacion
            ORDER BY c.fecha_pautada DESC
          `;
          const todasFinalizadasResult = await client.query(todasFinalizadasQuery);
          console.log('📊 Total consultas finalizadas en BD (sin filtros):', todasFinalizadasResult.rows.length);
          console.log('📊 IDs de consultas finalizadas:', todasFinalizadasResult.rows.map((r: any) => ({ 
            id: r.id, 
            estado: r.estado_consulta,
            estado_trimmed: r.estado_trimmed,
            fecha_pautada: r.fecha_pautada, 
            fecha_culminacion: r.fecha_culminacion,
            servicios: r.total_servicios 
          })));
          
          // Verificar consulta 4 específicamente con servicios
          const serviciosConsulta4Query = `
            SELECT 
              sc.id,
              sc.consulta_id,
              sc.servicio_id,
              sc.monto_pagado,
              sc.moneda_pago,
              s.nombre_servicio
            FROM servicios_consulta sc
            LEFT JOIN servicios s ON sc.servicio_id = s.id
            WHERE sc.consulta_id = 4
          `;
          const serviciosConsulta4Result = await client.query(serviciosConsulta4Query);
          console.log('🔍 Servicios de consulta ID 4:', serviciosConsulta4Result.rows.length, 'servicios encontrados');
          console.log('🔍 Detalle servicios consulta 4:', JSON.stringify(serviciosConsulta4Result.rows, null, 2));
          
          // Obtener servicios para todas las consultas encontradas
          const consultaIds = consultasResult.rows.map((row: any) => row.id);
          let serviciosResult = { rows: [] };
          
          if (consultaIds.length > 0) {
            const serviciosQuery = `
              SELECT 
                sc.consulta_id,
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
              FROM servicios_consulta sc
              LEFT JOIN servicios s ON sc.servicio_id = s.id
              WHERE sc.consulta_id = ANY($1::int[])
            `;
            serviciosResult = await client.query(serviciosQuery, [consultaIds]);
          }
          
          // Crear un mapa de servicios por consulta
          const serviciosPorConsulta = new Map();
          serviciosResult.rows.forEach((row: any) => {
            if (!serviciosPorConsulta.has(row.consulta_id)) {
              serviciosPorConsulta.set(row.consulta_id, []);
            }
            const servicio = {
              id: row.servicio_consulta_id,
              monto_pagado: row.monto_pagado,
              moneda_pago: (row.moneda_pago || 'VES').toUpperCase().trim(),
              tipo_cambio: row.tipo_cambio,
              observaciones: row.servicio_observaciones,
              servicios: {
                id: row.servicio_id,
                nombre_servicio: row.nombre_servicio,
                monto_base: row.monto_base,
                moneda: row.servicio_moneda,
                descripcion: row.servicio_descripcion
              }
            };
            serviciosPorConsulta.get(row.consulta_id).push(servicio);
            
            // Log para consulta 4
            if (row.consulta_id === 4) {
              console.log('🔍 Servicio obtenido de BD para consulta 4:', {
                consulta_id: row.consulta_id,
                servicio_consulta_id: row.servicio_consulta_id,
                monto_pagado: row.monto_pagado,
                moneda_pago: row.moneda_pago,
                nombre_servicio: row.nombre_servicio
              });
            }
          });
          
          // Log total de servicios por consulta 4
          const serviciosConsulta4 = serviciosPorConsulta.get(4) || [];
          if (serviciosConsulta4.length > 0) {
            console.log('📊 Total servicios obtenidos para consulta 4:', serviciosConsulta4.length);
            console.log('📊 Servicios consulta 4:', serviciosConsulta4.map((s: any) => ({
              monto: s.monto_pagado,
              moneda: s.moneda_pago
            })));
          } else {
            console.log('⚠️ No se encontraron servicios para consulta 4');
          }
          
          if (consultasResult.rows.length > 0) {
            console.log('📊 Primera consulta:', {
              id: consultasResult.rows[0].id,
              estado: consultasResult.rows[0].estado_consulta,
              tiene_servicios: (serviciosPorConsulta.get(consultasResult.rows[0].id)?.length || 0) > 0
            });
          }
          
          // Convertir el resultado a formato de consultas
          consultas = consultasResult.rows.map((row: any) => ({
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
            servicios_consulta: serviciosPorConsulta.get(row.id) || []
          }));
          
          // Verificar si la consulta 4 está en la lista después de obtener servicios
          const consulta4EnLista = consultas.find((c: any) => c.id === 4);
          console.log('🔍 Consulta 4 después de obtener servicios:', consulta4EnLista ? {
            id: consulta4EnLista.id,
            estado: consulta4EnLista.estado_consulta,
            total_servicios: consulta4EnLista.servicios_consulta?.length || 0,
            servicios: consulta4EnLista.servicios_consulta?.map((s: any) => ({ moneda: s.moneda_pago, monto: s.monto_pagado }))
          } : 'NO ENCONTRADA');
          
          console.log('📊 IDs de consultas obtenidas:', consultas.map((c: any) => c.id));
        } finally {
          client.release();
        }

      // Filtrar consultas por moneda si se especifica
      let consultasFiltradas = consultas || [];
      console.log('📊 Total consultas antes de filtrar por moneda:', consultasFiltradas.length);
      console.log('📊 IDs antes de filtrar por moneda:', consultasFiltradas.map((c: any) => c.id));
      
      if (moneda && moneda !== 'TODAS') {
        consultasFiltradas = consultasFiltradas.filter((consulta: any) => {
          // Si la consulta no tiene servicios, no la incluimos cuando se filtra por moneda específica
          if (!consulta.servicios_consulta || consulta.servicios_consulta.length === 0) {
            if (consulta.id === 4) {
              console.log('❌ Consulta 4 eliminada: no tiene servicios');
            }
            return false;
          }
          // Verificar si la consulta tiene al menos un servicio con la moneda especificada
          const tieneServicioConMoneda = consulta.servicios_consulta?.some((servicio: any) => {
            const monedaServicio = (servicio.moneda_pago || '').toUpperCase().trim();
            const monedaFiltro = moneda.toUpperCase().trim();
            return monedaServicio === monedaFiltro;
          });
          if (consulta.id === 4) {
            console.log('🔍 Consulta 4 - Tiene servicios:', consulta.servicios_consulta.length);
            console.log('🔍 Consulta 4 - Monedas:', consulta.servicios_consulta.map((s: any) => s.moneda_pago));
            console.log('🔍 Consulta 4 - Moneda filtro:', moneda);
            console.log('🔍 Consulta 4 - Pasa filtro:', tieneServicioConMoneda);
          }
          return tieneServicioConMoneda;
        });
        console.log('📊 Consultas después de filtrar por moneda', moneda, ':', consultasFiltradas.length);
        console.log('📊 IDs después de filtrar por moneda:', consultasFiltradas.map((c: any) => c.id));
      } else {
        // Si es "TODAS", incluir todas las consultas finalizadas, incluso sin servicios
        console.log('📊 Mostrando todas las monedas, incluyendo consultas sin servicios');
        // Asegurarnos de que las consultas sin servicios también se incluyan
        // (ya están incluidas porque no las filtramos)
      }


      // Transformar datos para el frontend
      const consultasTransformadas = consultasFiltradas?.map((consulta: any) => {
        // Filtrar servicios por moneda si se especifica
        let serviciosFiltrados = consulta.servicios_consulta || [];
        
        if (consulta.id === 4) {
          console.log('🔍 Antes de filtrar servicios - Consulta 4:', {
            total_servicios: serviciosFiltrados.length,
            servicios: serviciosFiltrados.map((s: any) => ({
              monto: s.monto_pagado,
              moneda: s.moneda_pago
            })),
            moneda_filtro: moneda
          });
        }
        
        if (moneda && moneda !== 'TODAS') {
          serviciosFiltrados = serviciosFiltrados.filter((servicio: any) => {
            const monedaServicio = (servicio.moneda_pago || '').toUpperCase().trim();
            const monedaFiltro = moneda.toUpperCase().trim();
            return monedaServicio === monedaFiltro;
          });
          
          if (consulta.id === 4) {
            console.log('🔍 Después de filtrar servicios - Consulta 4:', {
              total_servicios_filtrados: serviciosFiltrados.length,
              servicios_filtrados: serviciosFiltrados.map((s: any) => ({
                monto: s.monto_pagado,
                moneda: s.moneda_pago
              }))
            });
          }
        }

        // Función auxiliar para parsear valores numéricos
        const parsearNumero = (valor: any): number => {
          if (valor === null || valor === undefined) return 0;
          if (typeof valor === 'number') return valor;
          if (typeof valor === 'string') {
            const limpio = valor.trim().replace(/[^\d.,-]/g, '');
            return parseFloat(limpio.replace(',', '.')) || 0;
          }
          return Number(valor) || 0;
        };
        
        // Calcular total de la consulta sumando solo los servicios filtrados
        console.log(`🔍 Calculando total para consulta ${consulta.id}:`, {
          total_servicios_originales: consulta.servicios_consulta?.length || 0,
          total_servicios_filtrados: serviciosFiltrados.length,
          moneda_filtro: moneda,
          servicios_filtrados: serviciosFiltrados.map((s: any) => ({
            id: s.id,
            monto_pagado: s.monto_pagado,
            monto_pagado_tipo: typeof s.monto_pagado,
            moneda: s.moneda_pago
          }))
        });
        
        const totalConsulta = serviciosFiltrados.reduce((sum: number, servicio: any) => {
          const monto = parsearNumero(servicio.monto_pagado);
          const nuevaSuma = sum + monto;
          
          if (consulta.id === 4) {
            console.log('💰 Servicio para consulta 4:', {
              servicio_id: servicio.id,
              monto_pagado_original: servicio.monto_pagado,
              monto_pagado_tipo: typeof servicio.monto_pagado,
              monto_parseado: monto,
              moneda: servicio.moneda_pago,
              suma_anterior: sum,
              nueva_suma: nuevaSuma
            });
          }
          
          return nuevaSuma;
        }, 0);
        
        console.log(`💰 Total calculado para consulta ${consulta.id}:`, {
          total_servicios: serviciosFiltrados.length,
          total_consulta: totalConsulta,
          total_consulta_tipo: typeof totalConsulta,
          moneda_filtro: moneda
        });

        // Transformar servicios para el frontend (usando la función parsearNumero definida arriba)
        const serviciosTransformados = serviciosFiltrados.map((servicio: any) => {
          const montoPagado = parsearNumero(servicio.monto_pagado);
          const montoBase = parsearNumero((servicio.servicios as any)?.monto_base);
          
          return {
            id: servicio.id,
            nombre_servicio: (servicio.servicios as any)?.nombre_servicio || '',
            descripcion: (servicio.servicios as any)?.descripcion || '',
            precio_unitario: montoBase,
            cantidad: 1, // Por defecto 1 servicio
            subtotal: montoPagado,
            descuento: 0, // Por defecto sin descuento
            total_servicio: montoPagado,
            moneda_pago: servicio.moneda_pago || 'VES',
            tipo_cambio: servicio.tipo_cambio,
            observaciones: servicio.observaciones
          };
        });

        // Determinar la moneda principal de los servicios filtrados
        // Si no hay servicios, usar VES por defecto
        const monedas = serviciosFiltrados.map((s: any) => s.moneda_pago).filter(Boolean);
        const monedaPrincipal = monedas.length > 0 ? monedas[0] : 'VES';
        
        // Asegurar que totalConsulta sea un número válido
        const totalConsultaFinal = isNaN(totalConsulta) ? 0 : totalConsulta;

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
          total_consulta: totalConsultaFinal,
          moneda_principal: monedaPrincipal || 'VES',
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
            WHERE LOWER(TRIM(c.estado_consulta)) = 'finalizada'
          `;
          
          const params: any[] = [];
          let paramIndex = 1;

          if (filtros.fecha_desde) {
            countQuery += ` AND COALESCE(c.fecha_culminacion::date, c.fecha_pautada) >= $${paramIndex}::date`;
            params.push(filtros.fecha_desde);
            paramIndex++;
          }
          if (filtros.fecha_hasta) {
            countQuery += ` AND COALESCE(c.fecha_culminacion::date, c.fecha_pautada) <= $${paramIndex}::date`;
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

      console.log('🔍 ========== FIN getConsultasFinancieras ==========');
      console.log('🔍 Total consultas transformadas:', consultasTransformadas.length);
      console.log('🔍 IDs de consultas en respuesta:', consultasTransformadas.map((c: any) => c.id));
      console.log('🔍 Consulta 4 en respuesta:', consultasTransformadas.find((c: any) => c.id === 4) ? 'SÍ' : 'NO');
      
      res.json({
        success: true,
        data: consultasTransformadas,
        paginacion: paginacionInfo
      } as ApiResponse<any>);
    } catch (error) {
      console.error('❌ Error in getConsultasFinancieras:', error);
      console.error('❌ Stack trace:', error instanceof Error ? error.stack : 'No stack trace');
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
          WHERE LOWER(TRIM(c.estado_consulta)) = 'finalizada'
        `;
        
        const params: any[] = [];
        let paramIndex = 1;

        // Aplicar filtros de fecha
        // Para consultas finalizadas, usar fecha_culminacion si existe, sino fecha_pautada
        if (filtros.fecha_desde) {
          sqlQuery += ` AND COALESCE(c.fecha_culminacion::date, c.fecha_pautada) >= $${paramIndex}::date`;
          params.push(filtros.fecha_desde);
          paramIndex++;
        }
        if (filtros.fecha_hasta) {
          sqlQuery += ` AND COALESCE(c.fecha_culminacion::date, c.fecha_pautada) <= $${paramIndex}::date`;
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
              moneda_pago: (row.moneda_pago || 'VES').toUpperCase().trim()
            });
          }
        });

        consultas = Array.from(consultasMap.values());
      } finally {
        client.release();
      }

      // Función auxiliar para parsear valores numéricos
      const parsearNumero = (valor: any): number => {
        if (valor === null || valor === undefined) return 0;
        if (typeof valor === 'number') return valor;
        if (typeof valor === 'string') {
          const limpio = valor.trim().replace(/[^\d.,-]/g, '');
          return parseFloat(limpio.replace(',', '.')) || 0;
        }
        return Number(valor) || 0;
      };

      // Aplicar filtro de moneda post-query
      let consultasFiltradas = consultas || [];
      if (moneda && moneda !== 'TODAS') {
        const monedaFiltro = moneda.toUpperCase().trim();
        consultasFiltradas = consultas?.filter((consulta: any) => 
          consulta.servicios_consulta?.some((servicio: any) => {
            const monedaServicio = (servicio.moneda_pago || '').toUpperCase().trim();
            return monedaServicio === monedaFiltro;
          })
        ) || [];
      }

      // Calcular estadísticas con datos filtrados
      const totalConsultas = consultasFiltradas.length;
      
      // Calcular total de ingresos sumando servicios (solo de la moneda filtrada)
      const totalIngresos = consultasFiltradas.reduce((sum: number, consulta: any) => {
        const totalConsulta = consulta.servicios_consulta?.reduce((servicioSum: number, servicio: any) => {
          // Solo sumar servicios de la moneda seleccionada
          if (moneda && moneda !== 'TODAS') {
            const monedaServicio = (servicio.moneda_pago || '').toUpperCase().trim();
            const monedaFiltro = moneda.toUpperCase().trim();
            if (monedaServicio !== monedaFiltro) {
              return servicioSum;
            }
          }
          const monto = parsearNumero(servicio.monto_pagado);
          return servicioSum + monto;
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
          if (moneda && moneda !== 'TODAS') {
            const monedaServicio = (servicio.moneda_pago || '').toUpperCase().trim();
            const monedaFiltro = moneda.toUpperCase().trim();
            if (monedaServicio !== monedaFiltro) {
              return sum;
            }
          }
          const monto = parsearNumero(servicio.monto_pagado);
          return sum + monto;
        }, 0) || 0;
        totalPorEspecialidad[especialidad] = (totalPorEspecialidad[especialidad] || 0) + totalConsulta;
      });

      // Calcular totales por médico
      const totalPorMedico: { [key: string]: number } = {};
      consultasFiltradas.forEach((consulta: any) => {
        const medico = `${(consulta.medico as any)?.nombres || ''} ${(consulta.medico as any)?.apellidos || ''}`.trim() || 'Sin médico';
        const totalConsulta = consulta.servicios_consulta?.reduce((sum: number, servicio: any) => {
          // Solo sumar servicios de la moneda seleccionada
          if (moneda && moneda !== 'TODAS') {
            const monedaServicio = (servicio.moneda_pago || '').toUpperCase().trim();
            const monedaFiltro = moneda.toUpperCase().trim();
            if (monedaServicio !== monedaFiltro) {
              return sum;
            }
          }
          const monto = parsearNumero(servicio.monto_pagado);
          return sum + monto;
        }, 0) || 0;
        totalPorMedico[medico] = (totalPorMedico[medico] || 0) + totalConsulta;
      });

      // Calcular estadísticas por moneda
      const estadisticasPorMoneda: { [key: string]: any } = {};
      const monedas = [...new Set(consultas?.flatMap((c: any) => 
        c.servicios_consulta?.map((s: any) => (s.moneda_pago || 'VES').toUpperCase().trim()).filter(Boolean) || []
      ) || [])];

      monedas.forEach(monedaItem => {
        const monedaItemNormalizada = monedaItem.toUpperCase().trim();
        const consultasMoneda = consultas?.filter((consulta: any) => 
          consulta.servicios_consulta?.some((servicio: any) => {
            const monedaServicio = (servicio.moneda_pago || 'VES').toUpperCase().trim();
            return monedaServicio === monedaItemNormalizada;
          })
        ) || [];

        const totalConsultasMoneda = consultasMoneda.length;
        const totalIngresosMoneda = consultasMoneda.reduce((sum: number, consulta: any) => {
          const totalConsulta = consulta.servicios_consulta?.reduce((servicioSum: number, servicio: any) => {
            const monedaServicio = (servicio.moneda_pago || 'VES').toUpperCase().trim();
            if (monedaServicio === monedaItemNormalizada) {
              const monto = parsearNumero(servicio.monto_pagado);
              return servicioSum + monto;
            }
            return servicioSum;
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
          WHERE c.estado_consulta = 'finalizada'
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
          WHERE c.estado_consulta = 'finalizada'
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
