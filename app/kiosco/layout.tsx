import { redirect } from 'next/navigation'
import { getSession, getKioskSession } from '@/lib/session'

export default async function KioscoLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getSession()
  const kioskSession = await getKioskSession()
  
  // Acceso autorizado si el Administrador está activo o si el Kiosco ya cuenta con su sesión propia
  const isAuthorized = (session && session.rol === 'ADMIN') || (kioskSession && kioskSession.rol === 'KIOSK')
  if (!isAuthorized) {
    redirect('/')
  }

  return <>{children}</>
}
