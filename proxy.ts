import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { decrypt } from '@/lib/session'

const publicRoutes = ['/']

export default async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname
  const isPublicRoute = publicRoutes.includes(path)

  // Ignorar /kiosco del middleware de auth tradicional, ya que se protegerá
  // con un token específico en la URL para mantenerse vivo sin cookies
  if (path.startsWith('/kiosco')) {
    return NextResponse.next()
  }

  // 1. Obtener y desencriptar la sesión
  const cookie = req.cookies.get('session')?.value
  const session = await decrypt(cookie)

  // 1.1 Si es una invocación de Server Action (Next-Action / POST) y la sesión expiró,
  // permitir que la Server Action responda limpiamente (ej. { sessionExpired: true } o redirect de logout)
  // en lugar de romper el protocolo RSC de Next.js/Vercel con un 307 crudo en el middleware.
  const isServerAction = req.headers.has('next-action') || req.method === 'POST'
  if (!isPublicRoute && !session && isServerAction) {
    return NextResponse.next()
  }

  // 2. Redirigir si no está autenticado y la ruta es privada (con ?expired=1 para mostrar la pantalla amigable)
  if (!isPublicRoute && !session) {
    const expiredUrl = new URL('/', req.nextUrl)
    expiredUrl.searchParams.set('expired', '1')
    const redirectRes = NextResponse.redirect(expiredUrl)
    if (cookie) {
      redirectRes.cookies.delete('session')
    }
    return redirectRes
  }

  // 3. Lógica de redirección basada en roles si hay sesión
  if (session) {
    const rol = session.rol as string

    // Si intenta entrar al login estando autenticado, mandarlo a su área
    if (isPublicRoute) {
      if (rol === 'ADMIN') {
        return NextResponse.redirect(new URL('/admin/dashboard', req.nextUrl))
      } else {
        return NextResponse.redirect(new URL('/empleado/escanear', req.nextUrl))
      }
    }

    // Proteger las rutas de admin: Solo ADMIN
    if (path.startsWith('/admin') && rol !== 'ADMIN') {
      return NextResponse.redirect(new URL('/empleado/escanear', req.nextUrl))
    }

    // Proteger las rutas de empleado: Solo USER
    if (path.startsWith('/empleado') && rol !== 'USER') {
      return NextResponse.redirect(new URL('/admin/dashboard', req.nextUrl))
    }
  }

  return NextResponse.next()
}

// Configurar el matcher para ignorar archivos estáticos y la API
export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|manifest.webmanifest|manifest.json|icon.png).*)'],
}
