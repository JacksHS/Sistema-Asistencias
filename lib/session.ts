import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'

if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  console.warn('⚠️ CRITICAL WARNING: JWT_SECRET is missing in production. Falling back to default insecure key. ⚠️')
}
const secretKey = process.env.JWT_SECRET || 'clave-secreta-anti-fraude-12345'
const encodedKey = new TextEncoder().encode(secretKey)

export async function encrypt(payload: any, expiresIn: string = '8m') {
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
  // Administrador: 10 minutos | Trabajador / Estándar: 2 minutos
  const durationMs = rol === 'ADMIN' ? 10 * 60 * 1000 : 2 * 60 * 1000
  const maxAgeSeconds = Math.floor(durationMs / 1000)
  const expiresInJWT = rol === 'ADMIN' ? '10m' : '2m'

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
