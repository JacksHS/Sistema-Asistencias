'use server'

import { db } from '@/src/prisma/db'
import bcrypt from 'bcryptjs'
import { createSession, deleteSession } from '@/lib/session'
import { redirect } from 'next/navigation'

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
  }

  // 4. Crear sesión
  await createSession(usuario.id, usuario.rol)

  // 5. Redirigir según el rol
  if (usuario.rol === 'ADMIN') {
    redirect('/admin/dashboard')
  } else {
    redirect('/empleado/escanear')
  }
}

export async function logout() {
  await deleteSession()
  redirect('/')
}
