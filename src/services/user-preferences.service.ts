import { postgresPool } from '../config/database.js';

type PreferenceKey = string;

export class UserPreferencesService {
  /**
   * Obtiene todas las preferencias del usuario.
   * Retorna un objeto plano (clave -> valor) para facilitar consumo en frontend.
   */
  async getPreferences(userId: number): Promise<Record<string, any>> {
    const result = await postgresPool.query(
      `SELECT clave, valor
       FROM parametros_usuario
       WHERE usuario_id = $1`,
      [userId]
    );

    const prefs: Record<string, any> = {};
    for (const row of result.rows) {
      const key = String(row.clave);
      const value = row.valor;

      // Normalizar "pagina_principal" a un string (route) si viene como {route:"/x"}
      if (key === 'pagina_principal' && value && typeof value === 'object' && typeof value.route === 'string') {
        prefs[key] = value.route;
      } else {
        prefs[key] = value;
      }
    }

    return prefs;
  }

  /**
   * Guarda/actualiza una preferencia (UPSERT).
   * Para "pagina_principal" aceptamos un string y lo almacenamos como JSONB {route:"/ruta"}.
   */
  async setPreference(userId: number, key: PreferenceKey, value: any): Promise<{ key: string; value: any }> {
    const normalizedKey = String(key).trim();
    if (!normalizedKey) throw new Error('La clave es requerida');
    if (normalizedKey.length > 100) throw new Error('La clave es demasiado larga');

    let valueToStore: any = value;
    let valueToReturn: any = value;

    if (normalizedKey === 'pagina_principal') {
      const route = typeof value === 'string' ? value : value?.route;
      if (typeof route !== 'string' || route.trim().length === 0) {
        throw new Error('pagina_principal debe ser un string con la ruta');
      }
      const trimmed = route.trim();
      if (!trimmed.startsWith('/')) {
        throw new Error('pagina_principal debe iniciar con "/"');
      }
      valueToStore = { route: trimmed };
      valueToReturn = trimmed;
    }

    await postgresPool.query(
      `INSERT INTO parametros_usuario (usuario_id, clave, valor, updated_at)
       VALUES ($1, $2, $3::jsonb, now())
       ON CONFLICT (usuario_id, clave)
       DO UPDATE SET valor = EXCLUDED.valor, updated_at = now()`,
      [userId, normalizedKey, JSON.stringify(valueToStore)]
    );

    return { key: normalizedKey, value: valueToReturn };
  }
}


