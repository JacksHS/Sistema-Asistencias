'use server'

import { db } from '@/src/prisma/db'
import bcrypt from 'bcryptjs'
import { createSession, deleteSession } from '@/lib/session'
import { redirect } from 'next/navigation'

declare global {
  var __LAST_KIOSK_IP__: string | undefined
}

// Prevención básica de fuerza bruta (Throttling en memoria)
const failedAttempts = new Map<string, { count: number, lockUntil: number }>()

export async function login(prevState: any, formData: FormData) {
  const usuarioInput = ((formData.get('usuario') as string) || '').trim().replace(/[^a-zA-Z0-9_]/g, '')
  const password = formData.get('password') as string
  
  if (failedAttempts.has(usuarioInput)) {
    const record = failedAttempts.get(usuarioInput)!
    if (Date.now() < record.lockUntil) {
      return { error: 'Demasiados intentos. Por favor espera 30 segundos.' }
    }
  }

  const deviceHash = formData.get('deviceHash') as string | null
  const deviceUuid = formData.get('deviceUuid') as string | null

  if (!usuarioInput || !password) {
    return { error: 'Usuario y contraseña son obligatorios' }
  }

  const recordFailure = () => {
    const current = failedAttempts.get(usuarioInput) || { count: 0, lockUntil: 0 }
    current.count += 1
    if (current.count >= 5) {
      current.lockUntil = Date.now() + 30000 // Bloquea por 30s
    }
    failedAttempts.set(usuarioInput, current)
  }

  // 1. Buscar usuario
  const usuario = await db.orm.public.Usuario.where({ usuario: usuarioInput }).first()
  
  if (!usuario) {
    recordFailure()
    return { error: 'Credenciales inválidas' }
  }

  // 1.1 Validar cuenta activa
  if (usuario.activo === false) {
    return { error: 'Esta cuenta se encuentra inactiva. Comuníquese con la administración.' }
  }

  // 2. Verificar contraseña
  const isValid = await bcrypt.compare(password, usuario.password)
  if (!isValid) {
    recordFailure()
    return { error: 'Credenciales inválidas' }
  }

  // Si login exitoso, resetear fallos
  failedAttempts.delete(usuarioInput)

  // 3. Verificación de Seguridad Híbrida (Solo para USER / Trabajador)
  if (usuario.rol === 'USER') {
    const { getConfig } = await import('@/lib/configManager')
    const config = await getConfig()

    // 3.1 Validación Preventiva de Red (WiFi de la empresa)
    if (config.requerirMismaRed) {
      const { headers } = await import('next/headers')
      const headersList = await headers()
      const forwarded = headersList.get('x-forwarded-for')
      const realIp = headersList.get('x-real-ip')
      const workerIp = realIp || (forwarded ? forwarded.split(',')[0].trim() : 'unknown')

      let kioskIp = globalThis.__LAST_KIOSK_IP__
      if (!kioskIp) {
        const { getKioskLease } = await import('@/lib/configManager')
        const lease = await getKioskLease()
        kioskIp = lease?.ip || undefined
        if (kioskIp) {
          globalThis.__LAST_KIOSK_IP__ = kioskIp
        }
      }

      const isLocalhost = (ip: string) => ip === '127.0.0.1' || ip === '::1' || ip === 'localhost'
      const isMismatch = (isLocalhost(workerIp) && isLocalhost(kioskIp || ''))
        ? false
        : (Boolean(kioskIp) && workerIp !== 'unknown' && workerIp !== kioskIp)

      if (isMismatch) {
        return { error: 'Debes estar conectado a la red WiFi de la empresa para iniciar sesión.' }
      }
    }

    if (!deviceHash || !deviceUuid) {
      return { error: 'No se pudo obtener la huella del dispositivo' }
    }

    if (!usuario.device_hash || !usuario.device_uuid) {
      // EXCLUSIVIDAD DE DISPOSITIVO: Verificar si ESTE dispositivo ya fue reclamado por otro usuario
      if (config.requerirLlaveNavegador) {
        const dispOcupadoPorUUID = await db.orm.public.Usuario.where({ device_uuid: deviceUuid }).first()
        if (dispOcupadoPorUUID && dispOcupadoPorUUID.id !== usuario.id) {
          return { error: 'Este navegador ya está registrado por otro trabajador. Usa tu propio teléfono.' }
        }
      }
      
      if (config.requerirLlaveDispositivo) {
        const dispOcupadoPorHash = await db.orm.public.Usuario.where({ device_hash: deviceHash }).first()
        if (dispOcupadoPorHash && dispOcupadoPorHash.id !== usuario.id) {
          return { error: 'Este dispositivo físico ya está registrado por otro trabajador. Usa tu propio teléfono.' }
        }
      }

      // PRIMER LOGIN: Enlazamos el dispositivo a este usuario
      await db.orm.public.Usuario.where({ id: usuario.id }).update({
        device_hash: deviceHash,
        device_uuid: deviceUuid
      })
    } else {
      // LOGINS POSTERIORES: Validar que coincidan con la base de datos
      if (config.requerirLlaveNavegador && usuario.device_uuid !== deviceUuid) {
        return { error: 'Llave de navegador no reconocida. Contacte al administrador.' }
      }
      if (config.requerirLlaveDispositivo && usuario.device_hash !== deviceHash) {
        return { error: 'Llave de dispositivo no reconocida. Contacte al administrador.' }
      }
    }

    // 4. Crear sesión para USER (3 minutos)
    await createSession(usuario.id, usuario.rol)
    redirect('/empleado/escanear')
  }

  // 3. Verificación de Exclusividad de Sesión para ADMIN (Solo 1 sesión activa a la vez)
  if (usuario.rol === 'ADMIN') {
    if (usuario.device_uuid && usuario.device_uuid.includes('__')) {
      const parts = usuario.device_uuid.split('__')
      const activeExpiresAt = Number(parts[1] || 0)
      
      // Si la sesión guardada aún no ha expirado (10 minutos), bloquear el nuevo login
      if (activeExpiresAt && Date.now() < activeExpiresAt) {
        return { error: 'Hay una sesión activa. Cierre dicha sesión para ingresar.' }
      }
    }

    // Registrar nuevo ID de sesión y tiempo de expiración (10 minutos)
    const newSessionId = crypto.randomUUID()
    const newExpiresAt = Date.now() + 10 * 60 * 1000

    await db.orm.public.Usuario.where({ id: usuario.id }).update({
      device_uuid: `${newSessionId}__${newExpiresAt}`
    })

    // 4. Crear sesión para ADMIN (10 minutos)
    await createSession(usuario.id, usuario.rol, newSessionId)
    redirect('/admin/dashboard')
  }

  return { error: 'Rol no autorizado' }
}

export async function logout() {
  const { getSession, deleteSession } = await import('@/lib/session')
  const session = await getSession()
  
  // Liberar candado exclusivo de sesión para el administrador inmediatamente al salir
  if (session && session.userId && session.rol === 'ADMIN') {
    try {
      await db.orm.public.Usuario.where({ id: session.userId as string }).update({
        device_uuid: null
      })
    } catch (e) {
      console.error("Error liberando sesión de admin:", e)
    }
  }

  await deleteSession()
  redirect('/')
}
