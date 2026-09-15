import { db } from '@/src/prisma/db'

export interface AppConfig {
  requerirLlaveNavegador: boolean
  requerirLlaveDispositivo: boolean
  horaLimiteTardanza: string
  toleranciaMinutos: number
  horariosEspeciales: Record<string, string> // { [usuarioId]: "10:30" }
  requerirMismaRed: boolean
}

const defaultConfig: AppConfig = {
  requerirLlaveNavegador: true,
  requerirLlaveDispositivo: true,
  horaLimiteTardanza: '09:00',
  toleranciaMinutos: 0,
  horariosEspeciales: {},
  requerirMismaRed: false
}

export const getConfig = async (): Promise<AppConfig> => {
  try {
    const row = await db.orm.public.Configuracion.where({ id: 'singleton' }).first()
    
    if (!row) {
      const rawHora = JSON.stringify({
        hora: defaultConfig.horaLimiteTardanza,
        tolerancia: defaultConfig.toleranciaMinutos,
        horarios: defaultConfig.horariosEspeciales
      })

      await db.orm.public.Configuracion.create({
        id: 'singleton',
        requerir_llave_navegador: defaultConfig.requerirLlaveNavegador,
        requerir_llave_dispositivo: defaultConfig.requerirLlaveDispositivo,
        hora_limite_tardanza: rawHora,
        requerir_misma_red: defaultConfig.requerirMismaRed,
      })
      return defaultConfig
    }

    let horaLimite = '09:00'
    let tolerancia = 0
    let horarios: Record<string, string> = {}

    if (row.hora_limite_tardanza) {
      if (row.hora_limite_tardanza.startsWith('{')) {
        try {
          const parsed = JSON.parse(row.hora_limite_tardanza)
          horaLimite = parsed.hora || '09:00'
          tolerancia = Number(parsed.tolerancia) || 0
          horarios = parsed.horarios || {}
        } catch (e) {
          horaLimite = '09:00'
        }
      } else {
        horaLimite = row.hora_limite_tardanza
      }
    }

    return {
      requerirLlaveNavegador: row.requerir_llave_navegador,
      requerirLlaveDispositivo: row.requerir_llave_dispositivo,
      horaLimiteTardanza: horaLimite,
      toleranciaMinutos: tolerancia,
      horariosEspeciales: horarios,
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

    const rawHora = JSON.stringify({
      hora: updated.horaLimiteTardanza || '09:00',
      tolerancia: Number(updated.toleranciaMinutos) || 0,
      horarios: updated.horariosEspeciales || {}
    })

    const existing = await db.orm.public.Configuracion.where({ id: 'singleton' }).first()
    
    if (existing) {
      await db.orm.public.Configuracion.where({ id: 'singleton' }).update({
        requerir_llave_navegador: updated.requerirLlaveNavegador,
        requerir_llave_dispositivo: updated.requerirLlaveDispositivo,
        hora_limite_tardanza: rawHora,
        requerir_misma_red: updated.requerirMismaRed,
      })
    } else {
      await db.orm.public.Configuracion.create({
        id: 'singleton',
        requerir_llave_navegador: updated.requerirLlaveNavegador,
        requerir_llave_dispositivo: updated.requerirLlaveDispositivo,
        hora_limite_tardanza: rawHora,
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

// Función unificada para calcular si una marca de asistencia es Tardanza
export function calcularEsTarde(
  fechaHora: Date,
  usuarioId: string,
  config: AppConfig,
  timeZone: string = 'America/Lima'
): boolean {
  // 1. Horario oficial (especial si el trabajador lo tiene, o general)
  const horaOficial = config.horariosEspeciales?.[usuarioId] || config.horaLimiteTardanza || '09:00'
  const [limiteH, limiteM] = horaOficial.split(':').map(Number)
  const tolerancia = Number(config.toleranciaMinutos) || 0

  // Minuto del día límite (ej: 09:00 + 5 = 545 min)
  const minutosLimite = limiteH * 60 + limiteM + tolerancia

  // 2. Extraer hora y minuto en la zona horaria destino
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(fechaHora)

  const h = parseInt(parts.find(p => p.type === 'hour')!.value)
  const m = parseInt(parts.find(p => p.type === 'minute')!.value)
  const minutosLlegada = h * 60 + m

  return minutosLlegada > minutosLimite
}
