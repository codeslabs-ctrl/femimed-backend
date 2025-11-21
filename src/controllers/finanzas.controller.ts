import { Request, Response } from 'express';
import { supabase } from '../config/database.js';
import { ApiResponse } from '../types/index.js';
import { ExcelService } from '../services/excel.service.js';
import { FinanzasPDFService } from '../services/finanzas-pdf.service.js';

export class FinanzasController {
  
  // Obtener consultas financieras con filtros y paginación
  static async getConsultasFinancieras(req: Request, res: Response): Promise<void> {
    try {
      const { filtros, paginacion, moneda } = req.body;

      // Construir query base
      let query = supabase
        .from('consultas_pacientes')
        .select(`
          id,
          fecha_pautada,
          hora_pautada,
          estado_consulta,
          fecha_pago,
          metodo_pago,
          observaciones_financieras,
          paciente:pacientes!inner(
            nombres,
            apellidos,
            cedula
          ),
          medico:medicos!fk_consultas_medico(
            nombres,
            apellidos,
            especialidades!inner(
              nombre_especialidad
            )
          ),
          servicios_consulta(
            id,
            monto_pagado,
            moneda_pago,
            tipo_cambio,
            observaciones,
            servicios!inner(
              id,
              nombre_servicio,
              monto_base,
              moneda,
              descripcion
            )
          )
        `);

      // Aplicar filtros
      if (filtros.fecha_desde) {
        query = query.gte('fecha_pautada', filtros.fecha_desde);
      }
      if (filtros.fecha_hasta) {
        query = query.lte('fecha_pautada', filtros.fecha_hasta);
      }
      if (filtros.medico_id) {
        query = query.eq('medico_id', filtros.medico_id);
      }
      if (filtros.paciente_cedula) {
        // Filtrar por cédula del paciente usando la relación
        query = query.eq('paciente:cedula', filtros.paciente_cedula);
      }
      if (filtros.estado_pago && filtros.estado_pago !== 'todos') {
        if (filtros.estado_pago === 'pagado') {
          query = query.not('fecha_pago', 'is', null);
        } else if (filtros.estado_pago === 'pendiente') {
          query = query.is('fecha_pago', null);
        }
      }

      // Aplicar filtro por moneda - REMOVIDO TEMPORALMENTE
      // El filtro de Supabase no funciona correctamente con relaciones
      // Se aplicará después en la transformación de datos

      // Aplicar paginación
      if (paginacion) {
        const { pagina = 1, limite = 10 } = paginacion;
        const offset = (pagina - 1) * limite;
        query = query.range(offset, offset + limite - 1);
      }

      const { data: consultas, error } = await query;

      if (error) {
        console.error('Error fetching consultas financieras:', error);
        res.status(500).json({
          success: false,
          error: { message: 'Error al obtener consultas financieras' }
        } as ApiResponse<null>);
        return;
      }

      // Filtrar consultas por moneda si se especifica
      let consultasFiltradas = consultas || [];
      if (moneda && moneda !== 'TODAS') {
        consultasFiltradas = consultasFiltradas.filter(consulta => {
          // Verificar si la consulta tiene al menos un servicio con la moneda especificada
          const tieneServicioConMoneda = consulta.servicios_consulta?.some(servicio => 
            servicio.moneda_pago === moneda
          );
          return tieneServicioConMoneda;
        });
      }


      // Transformar datos para el frontend
      const consultasTransformadas = consultasFiltradas?.map(consulta => {
        // Calcular total de la consulta sumando servicios (se actualizará después del filtro)

        // Filtrar servicios por moneda si se especifica
        let serviciosFiltrados = consulta.servicios_consulta || [];
        if (moneda && moneda !== 'TODAS') {
          serviciosFiltrados = serviciosFiltrados.filter(servicio => 
            servicio.moneda_pago === moneda
          );
        }

        // Calcular total de la consulta sumando solo los servicios filtrados
        const totalConsulta = serviciosFiltrados.reduce((sum, servicio) => {
          return sum + (servicio.monto_pagado || 0);
        }, 0);

        // Transformar servicios para el frontend
        const serviciosTransformados = serviciosFiltrados.map(servicio => ({
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
        // Priorizar VES sobre otras monedas, y convertir COP a VES
        const monedas = serviciosFiltrados.map(s => {
          // Convertir COP a VES (legacy)
          const moneda = s.moneda_pago;
          return moneda === 'COP' ? 'VES' : moneda;
        });
        let monedaPrincipal = 'VES'; // Valor por defecto
        
        if (monedas.length > 0) {
          // Si hay VES, usar VES como moneda principal
          if (monedas.includes('VES')) {
            monedaPrincipal = 'VES';
          } 
          // Si hay USD, usar USD
          else if (monedas.includes('USD')) {
            monedaPrincipal = 'USD';
          } 
          // Si no hay VES ni USD, usar VES por defecto (en lugar de la primera moneda)
          else {
            monedaPrincipal = 'VES';
          }
        }

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
      let totalRegistros = 0;
      if (paginacion) {
        const countQuery = supabase
          .from('consultas_pacientes')
          .select('id', { count: 'exact', head: true });
        
        // Aplicar los mismos filtros para el conteo
        if (filtros.fecha_desde) countQuery.gte('fecha_pautada', filtros.fecha_desde);
        if (filtros.fecha_hasta) countQuery.lte('fecha_pautada', filtros.fecha_hasta);
        if (filtros.medico_id) countQuery.eq('medico_id', filtros.medico_id);
        if (filtros.paciente_cedula) countQuery.eq('paciente:cedula', filtros.paciente_cedula);
        if (filtros.estado_pago && filtros.estado_pago !== 'todos') {
          if (filtros.estado_pago === 'pagado') {
            countQuery.not('fecha_pago', 'is', null);
          } else if (filtros.estado_pago === 'pendiente') {
            countQuery.is('fecha_pago', null);
          }
        }
        // No aplicar filtro de moneda en el conteo, se aplicará después
        const { count } = await countQuery;
        let totalRegistros = count || 0;
        
        // Aplicar filtro de moneda al conteo si es necesario
        if (moneda && moneda !== 'TODAS') {
          // Contar solo las consultas que tienen servicios con la moneda especificada
          const consultasParaContar = consultas?.filter(consulta => {
            return consulta.servicios_consulta?.some(servicio => 
              servicio.moneda_pago === moneda
            );
          }) || [];
          totalRegistros = consultasParaContar.length;
        }
        
        // Usar totalRegistros en la paginación
        console.log('📊 Total registros calculado:', totalRegistros);
      }

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

      // Construir query base para estadísticas
      let baseQuery = supabase
        .from('consultas_pacientes')
        .select(`
          id,
          fecha_pago,
          medico_id,
          medico:medicos!fk_consultas_medico(
            nombres,
            apellidos,
            especialidades!inner(
              nombre_especialidad
            )
          ),
          servicios_consulta(
            monto_pagado,
            moneda_pago
          )
        `);

      // Aplicar filtros de fecha
      if (filtros.fecha_desde) {
        baseQuery = baseQuery.gte('fecha_pautada', filtros.fecha_desde);
      }
      if (filtros.fecha_hasta) {
        baseQuery = baseQuery.lte('fecha_pautada', filtros.fecha_hasta);
      }
      if (filtros.medico_id) {
        baseQuery = baseQuery.eq('medico_id', filtros.medico_id);
      }

      // No aplicar filtro de moneda directamente en Supabase para el resumen
      // Se aplicará post-query como en getConsultasFinancieras
      const { data: consultas, error } = await baseQuery;

      if (error) {
        console.error('Error fetching resumen:', error);
        res.status(500).json({
          success: false,
          error: { message: 'Error al obtener resumen financiero' }
        } as ApiResponse<null>);
        return;
      }

      // Aplicar filtro de moneda post-query
      let consultasFiltradas = consultas || [];
      if (moneda && moneda !== 'TODAS') {
        consultasFiltradas = consultas?.filter(consulta => 
          consulta.servicios_consulta?.some(servicio => servicio.moneda_pago === moneda)
        ) || [];
      }

      // Calcular estadísticas con datos filtrados
      const totalConsultas = consultasFiltradas.length;
      
      // Calcular total de ingresos sumando servicios (solo de la moneda filtrada)
      const totalIngresos = consultasFiltradas.reduce((sum, consulta) => {
        const totalConsulta = consulta.servicios_consulta?.reduce((servicioSum, servicio) => {
          // Solo sumar servicios de la moneda seleccionada
          if (moneda && moneda !== 'TODAS' && servicio.moneda_pago !== moneda) {
            return servicioSum;
          }
          return servicioSum + (servicio.monto_pagado || 0);
        }, 0) || 0;
        return sum + totalConsulta;
      }, 0);
      
      const consultasPagadas = consultasFiltradas.filter(c => c.fecha_pago).length;
      const consultasPendientes = totalConsultas - consultasPagadas;

      // Calcular totales por especialidad
      const totalPorEspecialidad: { [key: string]: number } = {};
      consultasFiltradas.forEach(consulta => {
        const especialidad = (consulta.medico as any)?.especialidades?.nombre_especialidad || 'Sin especialidad';
        const totalConsulta = consulta.servicios_consulta?.reduce((sum, servicio) => {
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
      consultasFiltradas.forEach(consulta => {
        const medico = `${(consulta.medico as any)?.nombres || ''} ${(consulta.medico as any)?.apellidos || ''}`.trim() || 'Sin médico';
        const totalConsulta = consulta.servicios_consulta?.reduce((sum, servicio) => {
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
      const monedas = [...new Set(consultas?.flatMap(c => 
        c.servicios_consulta?.map(s => s.moneda_pago).filter(Boolean) || []
      ) || [])];

      monedas.forEach(monedaItem => {
        const consultasMoneda = consultas?.filter(consulta => 
          consulta.servicios_consulta?.some(servicio => servicio.moneda_pago === monedaItem)
        ) || [];

        const totalConsultasMoneda = consultasMoneda.length;
        const totalIngresosMoneda = consultasMoneda.reduce((sum, consulta) => {
          const totalConsulta = consulta.servicios_consulta?.reduce((servicioSum, servicio) => {
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

      const { error } = await supabase
        .from('consultas_pacientes')
        .update({
          fecha_pago,
          metodo_pago,
          observaciones_financieras: observaciones || null
        })
        .eq('id', id)
        .select()
        .single();

      if (error) {
        console.error('Error updating consulta:', error);
        res.status(500).json({
          success: false,
          error: { message: 'Error al marcar consulta como pagada' }
        } as ApiResponse<null>);
        return;
      }

      res.json({
        success: true,
        data: { message: 'Consulta marcada como pagada exitosamente' }
      } as ApiResponse<any>);
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
      let query = supabase
        .from('consultas_pacientes')
        .select(`
          id,
          fecha_pautada,
          fecha_pago,
          paciente:pacientes!inner(
            nombres,
            apellidos,
            cedula
          ),
          medico:medicos!fk_consultas_medico(
            nombres,
            apellidos,
            especialidad:especialidades!inner(
              nombre_especialidad
            )
          ),
          servicios_consulta(
            id,
            monto_pagado,
            moneda_pago,
            servicios!inner(
              nombre_servicio,
              descripcion
            )
          )
        `);

      // Aplicar filtros (igual que en getConsultasFinancieras)
      if (filtros?.fecha_desde) {
        query = query.gte('fecha_pautada', filtros.fecha_desde);
      }
      if (filtros?.fecha_hasta) {
        query = query.lte('fecha_pautada', filtros.fecha_hasta);
      }
      if (filtros?.medico_id) {
        query = query.eq('medico_id', filtros.medico_id);
      }
      if (filtros?.paciente_cedula) {
        query = query.eq('paciente:cedula', filtros.paciente_cedula);
      }
      if (filtros?.estado_pago && filtros.estado_pago !== 'todos') {
        if (filtros.estado_pago === 'pagado') {
          query = query.not('fecha_pago', 'is', null);
        } else if (filtros.estado_pago === 'pendiente') {
          query = query.is('fecha_pago', null);
        }
      }

      // Agregar límite explícito para obtener todas las consultas
      const { data: consultas, error } = await query.limit(1000);

      if (error) {
        console.error('Error fetching data for export:', error);
        res.status(500).json({
          success: false,
          error: { message: 'Error al obtener datos para exportar' }
        } as ApiResponse<null>);
        return;
      }

      console.log('📊 CONSULTAS OBTENIDAS PARA EXPORTACIÓN:', consultas?.length || 0);
      console.log('🔍 PRIMERAS 3 CONSULTAS:', consultas?.slice(0, 3).map(c => ({ id: c.id, servicios: c.servicios_consulta?.length || 0 })));

      // Aplicar filtro de moneda si se especifica (igual que en getConsultasFinancieras)
      let consultasFiltradas = consultas || [];
      if (filtros?.moneda && filtros.moneda !== 'TODAS') {
        console.log('🔍 APLICANDO FILTRO DE MONEDA EN EXPORTACIÓN:', filtros.moneda);
        consultasFiltradas = consultasFiltradas.filter(consulta => {
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
      let query = supabase
        .from('consultas_pacientes')
        .select(`
          id,
          fecha_pautada,
          fecha_pago,
          paciente:pacientes!inner(
            nombres,
            apellidos,
            cedula
          ),
          medico:medicos!fk_consultas_medico(
            nombres,
            apellidos,
            especialidad:especialidades!inner(
              nombre_especialidad
            )
          ),
          servicios_consulta(
            id,
            monto_pagado,
            moneda_pago,
            servicios!inner(
              nombre_servicio,
              descripcion
            )
          )
        `);

      // Aplicar filtros (igual que en getConsultasFinancieras)
      if (filtros?.fecha_desde) {
        query = query.gte('fecha_pautada', filtros.fecha_desde);
      }
      if (filtros?.fecha_hasta) {
        query = query.lte('fecha_pautada', filtros.fecha_hasta);
      }
      if (filtros?.medico_id) {
        query = query.eq('medico_id', filtros.medico_id);
      }
      if (filtros?.paciente_cedula) {
        query = query.eq('paciente:cedula', filtros.paciente_cedula);
      }
      if (filtros?.estado_pago && filtros.estado_pago !== 'todos') {
        if (filtros.estado_pago === 'pagado') {
          query = query.not('fecha_pago', 'is', null);
        } else if (filtros.estado_pago === 'pendiente') {
          query = query.is('fecha_pago', null);
        }
      }

      // Agregar límite explícito para obtener todas las consultas
      const { data: consultas, error } = await query.limit(1000);

      if (error) {
        console.error('Error fetching data for advanced export:', error);
        res.status(500).json({
          success: false,
          error: { message: 'Error al obtener datos para exportación avanzada' }
        } as ApiResponse<null>);
        return;
      }

      console.log('📊 CONSULTAS OBTENIDAS PARA EXPORTACIÓN AVANZADA:', consultas?.length || 0);

      // Aplicar filtro de moneda si se especifica (post-consulta, igual que en getConsultasFinancieras)
      let consultasFiltradas = consultas || [];
      if (opciones?.moneda && opciones.moneda !== 'TODAS') {
        console.log('🔍 APLICANDO FILTRO DE MONEDA EN EXPORTACIÓN AVANZADA:', opciones.moneda);
        consultasFiltradas = consultasFiltradas.filter(consulta => {
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
    } catch (error) {
      console.error('Error in exportarReporteAvanzado:', error);
      res.status(500).json({
        success: false,
        error: { message: 'Error interno del servidor' }
      } as ApiResponse<null>);
    }
  }
}
