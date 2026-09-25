import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'

const secret = process.env.JWT_SECRET

// Validación estricta de seguridad: En producción (especialmente en Vercel)
// no se permite arrancar ni operar con una clave fallback por defecto.
if (process.env.NODE_ENV === 'production') {
  if (!secret) {
    if (process.env.VERCEL) {
      throw new Error('FATAL SECURITY ERROR: JWT_SECRET debe estar configurado en las variables de entorno de Vercel.')
    } else {
      console.warn('⚠️ CRITICAL WARNING: JWT_SECRET no está configurado en producción. Configure esta variable antes de desplegar.')
    }
  } else if (secret.length < 32) {
    console.warn('⚠️ ADVERTENCIA: JWT_SECRET tiene menos de 32 caracteres. Se recomienda una clave de 256 bits.')
  }
}

export const JWT_SECRET_KEY = new TextEncoder().encode(secret || 'dev-only-insecure-secret-key-conver-32chars!!')
const encodedKey = JWT_SECRET_KEY

export async function encrypt(payload: any, expiresIn: string = '8m') {
  if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
    throw new Error('FATAL SECURITY ERROR: No se pueden emitir tokens JWT sin la variable de entorno JWT_SECRET definida.')
  }
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(encodedKey)
}

export async function decrypt(session: string | undefined = '') {
  try {
    const { payload } = await jwtVerify(session, encodedKey, {
      algorithms: ['HS256'],
    })
    return payload
  } catch (error) {
    return null
  }
}

export async function createSession(userId: string, rol: string, sessionId?: string) {
  // Administrador: 10 minutos | Trabajador / Estándar: 3 minutos
  const durationMs = rol === 'ADMIN' ? 10 * 60 * 1000 : 3 * 60 * 1000
  const maxAgeSeconds = Math.floor(durationMs / 1000)
  const expiresInJWT = rol === 'ADMIN' ? '10m' : '3m'

  const expiresAt = new Date(Date.now() + durationMs)
  const session = await encrypt({ userId, rol, sessionId, expiresAt }, expiresInJWT)

  const cookieStore = await cookies()
  cookieStore.set('session', session, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    expires: expiresAt,
    maxAge: maxAgeSeconds,
    sameSite: 'lax',
    path: '/',
  })
}

export async function createKioskSession(kioskDeviceId: string) {
  // Sesión persistente para la pantalla del Kiosco (30 días de validez en el dispositivo)
  const durationMs = 30 * 24 * 60 * 60 * 1000
  const expiresAt = new Date(Date.now() + durationMs)
  const maxAgeSeconds = Math.floor(durationMs / 1000)
  const kioskSession = await encrypt({ rol: 'KIOSK', kioskDeviceId, expiresAt }, '30d')

  const cookieStore = await cookies()
  cookieStore.set('kiosk_session', kioskSession, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    expires: expiresAt,
    maxAge: maxAgeSeconds,
    sameSite: 'lax',
    path: '/',
  })
}

export async function getKioskSession() {
  const cookieStore = await cookies()
  const cookie = cookieStore.get('kiosk_session')?.value
  const session = await decrypt(cookie)
  return session
}

export async function deleteKioskSession() {
  const cookieStore = await cookies()
  cookieStore.delete('kiosk_session')
}

export async function getSession() {
  const cookieStore = await cookies()
  const cookie = cookieStore.get('session')?.value
  const session = await decrypt(cookie)
  return session
}

export async function deleteSession() {
  const cookieStore = await cookies()
  cookieStore.delete('session')
}
