import fs from 'fs'
import path from 'path'

const CONFIG_PATH = path.join(process.cwd(), 'config.json')

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

export const getConfig = (): AppConfig => {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const parsed = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'))
      // Validación básica
      if (typeof parsed.horaLimiteTardanza !== 'string' || !/^\d{2}:\d{2}$/.test(parsed.horaLimiteTardanza)) {
        parsed.horaLimiteTardanza = '09:00'
      }
      return { ...defaultConfig, ...parsed }
    }
  } catch (e) {
    console.error("Error reading config", e)
  }
  return defaultConfig
}

export const setConfig = (newConfig: Partial<AppConfig>): AppConfig => {
  const current = getConfig()
  const updated = { ...current, ...newConfig }
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(updated, null, 2))
  } catch (e) {
    console.error("Error writing config", e)
  }
  return updated
}
