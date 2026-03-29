import { postgresPool } from '../config/database.js';

/** Límites desde parametros_clinicas (solo una clínica configurada). */
export interface LimitesClinica {
  maximo_medicos: number;
  maximo_pacientes: number;
}

/**
 * Obtiene maximo_medicos y maximo_pacientes de parametros_clinicas.
 * No usa alias: la tabla tiene los parámetros de la clínica configurada.
 */
export async function getLimitesConfigurada(): Promise<LimitesClinica | null> {
  const client = await postgresPool.connect();
  try {
    const result = await client.query(
      `SELECT maximo_medicos, maximo_pacientes
       FROM parametros_clinicas
       WHERE estatus = 'activo'
         AND (fecha_fin IS NULL OR fecha_fin >= CURRENT_DATE)
       LIMIT 1`
    );
    if (result.rows.length === 0) return null;
    return {
      maximo_medicos: Number(result.rows[0].maximo_medicos),
      maximo_pacientes: Number(result.rows[0].maximo_pacientes)
    };
  } finally {
    client.release();
  }
}

/**
 * Conteo de médicos (medicos_clinicas).
 */
export async function getConteoMedicosConfigurada(): Promise<number> {
  const client = await postgresPool.connect();
  try {
    const result = await client.query(
      `SELECT COUNT(*)::int AS total FROM medicos_clinicas`
    );
    return Number(result.rows[0]?.total ?? 0);
  } finally {
    client.release();
  }
}

/**
 * Conteo de pacientes (pacientes).
 */
export async function getConteoPacientesConfigurada(): Promise<number> {
  const client = await postgresPool.connect();
  try {
    const result = await client.query(
      `SELECT COUNT(*)::int AS total FROM pacientes`
    );
    return Number(result.rows[0]?.total ?? 0);
  } finally {
    client.release();
  }
}

/**
 * Valida si se puede agregar un médico según límites de parametros_clinicas.
 * Lanza error si se alcanzó el máximo.
 */
export async function checkLimiteMedicos(): Promise<void> {
  const limites = await getLimitesConfigurada();
  if (!limites) return;
  const actual = await getConteoMedicosConfigurada();
  if (actual >= limites.maximo_medicos) {
    throw new Error(
      `No se puede agregar más médicos. Límite del plan: ${limites.maximo_medicos}. Actual: ${actual}.`
    );
  }
}

/**
 * Valida si se puede agregar un paciente según límites de parametros_clinicas.
 * Lanza error si se alcanzó el máximo.
 */
export async function checkLimitePacientes(): Promise<void> {
  const limites = await getLimitesConfigurada();
  if (!limites) return;
  const actual = await getConteoPacientesConfigurada();
  if (actual >= limites.maximo_pacientes) {
    throw new Error(
      `No se puede agregar más pacientes. Límite del plan: ${limites.maximo_pacientes}. Actual: ${actual}.`
    );
  }
}
