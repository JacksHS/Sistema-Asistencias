'use server'

import { SignJWT } from 'jose'
import { db } from '@/src/prisma/db'

declare global {
  var __LAST_KIOSK_IP__: string | undefined
}

const secretKey = process.env.JWT_SECRET || 'clave-secreta-anti-fraude-12345'
const encodedKey = new TextEncoder().encode(secretKey)

export async function generarTokenKiosco(kioskDeviceId: string) {
  if (!kioskDeviceId) {
    return { error: 'INVALID_DEVICE', message: 'Identificador de dispositivo no proporcionado' }
  }

  const { getSession, getKioskSession, createKioskSession } = await import('@/lib/session')
  const session = await getSession()
  const kioskSession = await getKioskSession()

  // Autorización Híbrida: Permitido si el Admin está presente O si el dispositivo ya fue autorizado como Kiosco
  const isAuthorized = (session && session.rol === 'ADMIN') || (kioskSession && kioskSession.rol === 'KIOSK')
  if (!isAuthorized) {
    return { error: 'UNAUTHORIZED', message: 'No autorizado para operar el kiosco' }
  }

  // Si el Admin abrió el kiosco, otorgamos la cookie persistente de Kiosco para que nunca se cierre cuando expire el Admin
  if (session && session.rol === 'ADMIN') {
    try {
      await createKioskSession(kioskDeviceId)
    } catch (e) {
      // Ignorar si no se puede escribir la cookie en esta invocación
    }
  }

  const { headers } = await import('next/headers')
  const headersList = await headers()
  const forwarded = headersList.get('x-forwarded-for')
  const realIp = headersList.get('x-real-ip')
  
  // IP del kiosco (más confiable x-real-ip en producción)
  const kioskIp = realIp || (forwarded ? forwarded.split(',')[0].trim() : 'unknown')

  // EXCLUSIVIDAD DE KIOSCO: Solo un Kiosco activo en toda la empresa simultáneamente
  const { getKioskLease, updateKioskLease } = await import('@/lib/configManager')
  const currentLease = await getKioskLease()

  // Tiempo de gracia para considerar que un Kiosco abandonó (25 segundos; el ping ocurre cada 10s)
  const KIOSK_TIMEOUT_MS = 25000
  const isAnotherKioskActive = 
    Boolean(currentLease?.deviceId) &&
    currentLease?.deviceId !== kioskDeviceId &&
    (Date.now() - (currentLease?.lastPing || 0) < KIOSK_TIMEOUT_MS)

  if (isAnotherKioskActive) {
    return { 
      error: 'KIOSK_ALREADY_OPEN', 
      message: 'Ya hay un kiosko abierto en otro dispositivo.' 
    }
  }

  // Renovar o reclamar el lease para este dispositivo
  await updateKioskLease({
    deviceId: kioskDeviceId,
    lastPing: Date.now(),
    ip: kioskIp
  })

  const timestamp = Date.now()
  
  // Token encriptado ultra-compacto para QR veloz
  const token = await new SignJWT({ t: 'k', ts: timestamp, ip: kioskIp })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('2m') 
    .sign(encodedKey)

  return { success: true, token }
}

export async function liberarKiosco(kioskDeviceId: string) {
  if (!kioskDeviceId) return { success: false }
  const { releaseKioskLease } = await import('@/lib/configManager')
  await releaseKioskLease(kioskDeviceId)
  return { success: true }
}

export async function obtenerEstadoKiosco() {
  const { getKioskLease } = await import('@/lib/configManager')
  const lease = await getKioskLease()
  const KIOSK_TIMEOUT_MS = 25000
  const isActivo = Boolean(lease?.deviceId) && (Date.now() - (lease?.lastPing || 0) < KIOSK_TIMEOUT_MS)
  return {
    activo: isActivo,
    deviceId: isActivo ? lease?.deviceId : null,
    lastPing: lease?.lastPing || 0
  }
}
