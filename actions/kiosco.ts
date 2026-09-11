'use server'

import { SignJWT } from 'jose'
import { db } from '@/src/prisma/db'

declare global {
  var __LAST_KIOSK_IP__: string | undefined
}

const secretKey = process.env.JWT_SECRET || 'clave-secreta-anti-fraude-12345'
const encodedKey = new TextEncoder().encode(secretKey)

export async function generarTokenKiosco() {
  const { getSession } = await import('@/lib/session')
  const session = await getSession()
  if (!session || session.rol !== 'ADMIN') throw new Error('No autorizado')

  const { headers } = await import('next/headers')
  const headersList = await headers()
  const forwarded = headersList.get('x-forwarded-for')
  const realIp = headersList.get('x-real-ip')
  
  // IP del kiosco (más confiable x-real-ip en producción)
  const kioskIp = realIp || (forwarded ? forwarded.split(',')[0].trim() : 'unknown')

  // Registrar la IP actual del Kiosco para validación preventiva en el Login de trabajadores
  if (kioskIp && kioskIp !== 'unknown') {
    globalThis.__LAST_KIOSK_IP__ = kioskIp
    const adminId = session.userId as string
    if (adminId) {
      try {
        const adminUser = await db.orm.public.Usuario.where({ id: adminId }).first()
        const lastUpdate = Number(adminUser?.device_uuid || 0)
        if (adminUser && (adminUser.device_hash !== kioskIp || Date.now() - lastUpdate > 300000)) {
          await db.orm.public.Usuario.where({ id: adminId }).update({
            device_hash: kioskIp,
            device_uuid: Date.now().toString()
          })
        }
      } catch (dbError) {
        console.error("Error al registrar IP del Kiosco:", dbError)
      }
    }
  }

  const timestamp = Date.now()
  
  // Creamos un token encriptado compacto para reducir el tamaño del QR al mínimo
  // y permitir que las cámaras enfoquen al instante con píxeles mucho más grandes.
  const token = await new SignJWT({ t: 'k', ts: timestamp, ip: kioskIp })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('2m') 
    .sign(encodedKey)

  return token
}
