'use server'

import { SignJWT } from 'jose'

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

  const timestamp = Date.now()
  
  // Creamos un token encriptado que contiene exactamente la hora en que fue generado
  // por el servidor, no por el cliente. Le ponemos un TTL de 1 minuto a nivel JWT, 
  // pero la regla estricta de 15 segundos se validará manualmente al escanear.
  const token = await new SignJWT({ type: 'kiosco_qr', timestamp, kioskIp })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1m') 
    .sign(encodedKey)

  return token
}
