import { db } from '@/src/prisma/db'

export interface AppConfig {
  requerirLlaveNavegador: boolean
  requerirLlaveDispositivo: boolean
  horaLimiteTardanza: string
  requerirMismaRed: boolean
}

const defaultConfig: AppConfig = {
  requerirLlaveNavegador: true,
  requerirLlaveDispositivo: true,
  horaLimiteTardanza: '09:00',
  requerirMismaRed: false
}

export const getConfig = async (): Promise<AppConfig> => {
  try {
    const row = await db.orm.public.Configuracion.where({ id: 'singleton' }).first()
    
    if (!row) {
      // Primera vez: crear la fila con defaults
      await db.orm.public.Configuracion.create({
        id: 'singleton',
        requerir_llave_navegador: defaultConfig.requerirLlaveNavegador,
        requerir_llave_dispositivo: defaultConfig.requerirLlaveDispositivo,
        hora_limite_tardanza: defaultConfig.horaLimiteTardanza,
        requerir_misma_red: defaultConfig.requerirMismaRed,
      })
      return defaultConfig
    }

    // Mapear de snake_case (BD) a camelCase (App)
    return {
      requerirLlaveNavegador: row.requerir_llave_navegador,
      requerirLlaveDispositivo: row.requerir_llave_dispositivo,
      horaLimiteTardanza: row.hora_limite_tardanza || '09:00',
      requerirMismaRed: row.requerir_misma_red,
    }
  } catch (e) {
    console.error("Error reading config from DB:", e)
    return defaultConfig
  }
}

export const setConfig = async (newConfig: Partial<AppConfig>): Promise<AppConfig> => {
  try {
    const current = await getConfig()
    const updated = { ...current, ...newConfig }

    // Verificar si la fila existe
    const existing = await db.orm.public.Configuracion.where({ id: 'singleton' }).first()
    
    if (existing) {
      await db.orm.public.Configuracion.where({ id: 'singleton' }).update({
        requerir_llave_navegador: updated.requerirLlaveNavegador,
        requerir_llave_dispositivo: updated.requerirLlaveDispositivo,
        hora_limite_tardanza: updated.horaLimiteTardanza,
        requerir_misma_red: updated.requerirMismaRed,
      })
    } else {
      await db.orm.public.Configuracion.create({
        id: 'singleton',
        requerir_llave_navegador: updated.requerirLlaveNavegador,
        requerir_llave_dispositivo: updated.requerirLlaveDispositivo,
        hora_limite_tardanza: updated.horaLimiteTardanza,
        requerir_misma_red: updated.requerirMismaRed,
      })
    }

    return updated
  } catch (e) {
    console.error("Error writing config to DB:", e)
    const current = await getConfig()
    return current
  }
}
