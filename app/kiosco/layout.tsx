import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'

export default async function KioscoLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getSession()
  
  // Si no hay sesión o el usuario no es un administrador, bloqueamos el acceso
  if (!session || session.rol !== 'ADMIN') {
    redirect('/login')
  }

  return <>{children}</>
}
