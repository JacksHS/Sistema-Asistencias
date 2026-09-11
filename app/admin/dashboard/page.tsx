import React from 'react'
import { db } from '@/src/prisma/db'
import { logout } from '@/actions/auth'
import { CreateWorkerForm, WorkerActions, SettingsPanel, DateFilter, AdminLiveClock, AutoRefreshTable } from './components/DashboardClient'
import { LogOut, MonitorSmartphone, Clock, Users, ShieldCheck, FilterX } from 'lucide-react'
import Link from 'next/link'
import { getConfig } from '@/lib/configManager'

// Fuerza la ruta a ser dinámica para evitar el caché estático
export const dynamic = 'force-dynamic'

export default async function AdminDashboard({ searchParams }: { searchParams: { workerId?: string, desde?: string, hasta?: string } }) {
  const { workerId, desde, hasta } = await searchParams

  // Fetch y Ordenar Trabajadores Alfabéticamente
  const trabajadores = (await db.orm.public.Usuario.where({ rol: 'USER' }).all())
    .sort((a, b) => a.nombre_completo.localeCompare(b.nombre_completo))

  const config = await getConfig()
  const [limiteHora, limiteMin] = (config.horaLimiteTardanza || '09:00').split(':').map(Number)

  // Construir filtros SQL para evitar desbordamiento de memoria
  const whereFilter: any = {}
  if (workerId) whereFilter.usuario_id = workerId

  // Si no hay filtro de fecha, proteger el servidor limitando a los últimos 1000 registros
  // Prisma Composer permite where(filter), usémoslo.
  let asistenciasRaw: any[] = []
  try {
    const query = Object.keys(whereFilter).length > 0 
      ? db.orm.public.Asistencia.where(whereFilter) 
      : db.orm.public.Asistencia
    
    // Obtenemos los datos (si no hay filtro de fecha, limitamos para proteger la RAM)
    // Nota: Prisma Composer no soporta orderBy fácilmente en esta sintaxis básica sin contrato avanzado,
    // pero limit() suele traer los más recientes si el ID es secuencial o por default. 
    // Para asegurar, simplemente evitamos traer 10,000 filtrando por defecto si es muy grande.
    asistenciasRaw = await query.all()
    
    // Refuerzo en memoria por si el conector de Prisma Composer no soporta anidación gte/lte aún
    if (desde) asistenciasRaw = asistenciasRaw.filter(a => new Date(a.fecha_hora) >= new Date(`${desde}T00:00:00`))
    if (hasta) asistenciasRaw = asistenciasRaw.filter(a => new Date(a.fecha_hora) <= new Date(`${hasta}T23:59:59.999`))
    
    // Límite de seguridad
    if (asistenciasRaw.length > 2000) asistenciasRaw = asistenciasRaw.slice(-2000)
  } catch (error) {
    console.error("Error al filtrar asistencias:", error)
  }
  
  // Mapear con fechas procesadas y ordenar de antiguo a nuevo
  const tzEnv = process.env.APP_TIMEZONE || process.env.TZ
  const timeZone = (!tzEnv || tzEnv === ':UTC' || tzEnv.startsWith(':')) ? 'America/Lima' : tzEnv
  const rawConFechas = asistenciasRaw.map(a => {
    const fecha = new Date(a.fecha_hora)
    const fechaDivisor = new Intl.DateTimeFormat('es-ES', { 
      timeZone, weekday: 'long', day: 'numeric', month: 'long' 
    }).format(fecha)
    return { ...a, fecha, fechaDivisor }
  }).sort((a, b) => a.fecha.getTime() - b.fecha.getTime())

  // Consolidar Entrada y Salida por usuario y día en una sola fila
  const consolidados: Record<string, any> = {}
  
  rawConFechas.forEach(a => {
    const key = `${a.usuario_id}-${a.fechaDivisor}`
    const u = trabajadores.find(t => t.id === a.usuario_id)
    
    if (!consolidados[key]) {
      // Extraer hora y minuto en la zona horaria oficial (America/Lima)
      const localTimeParts = new Intl.DateTimeFormat('en-US', {
        timeZone,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      }).formatToParts(a.fecha)
      const localHour = parseInt(localTimeParts.find(p => p.type === 'hour')!.value)
      const localMinute = parseInt(localTimeParts.find(p => p.type === 'minute')!.value)
      const esTarde = (localHour > limiteHora) || (localHour === limiteHora && localMinute > limiteMin)

      consolidados[key] = {
        id: a.id,
        usuario_id: a.usuario_id,
        nombre_trabajador: u ? u.nombre_completo : 'Usuario Eliminado',
        fechaDivisor: a.fechaDivisor,
        fechaFiltro: a.fecha,
        entrada: a.fecha,
        esTarde,
        salida: null
      }
    } else if (!consolidados[key].salida) {
      consolidados[key].salida = a.fecha
    }
  })
  
  // Convertir a array y volver a ordenar descendente para mostrar lo más reciente arriba
  const asistencias = Object.values(consolidados)
  asistencias.sort((a, b) => b.fechaFiltro.getTime() - a.fechaFiltro.getTime())

  // Agrupar asistencias consolidadas por día para la vista
  const groupedAsistencias: Record<string, typeof asistencias> = {}
  asistencias.forEach(a => {
    if (!groupedAsistencias[a.fechaDivisor]) groupedAsistencias[a.fechaDivisor] = []
    groupedAsistencias[a.fechaDivisor].push(a)
  })

  const trabajadorActivo = workerId ? trabajadores.find(t => t.id === workerId) : null

  return (
    <div className="min-h-screen bg-slate-50">
      {/* NAVBAR */}
      <nav className="bg-slate-900 text-white shadow-md relative overflow-hidden">
        {/* Textura de puntos sutil — CSS puro */}
        <div 
          className="absolute inset-0 opacity-[0.45] pointer-events-none z-0"
          style={{
            backgroundImage: 'radial-gradient(circle, #64748b 1.5px, transparent 1.5px)',
            backgroundSize: '24px 24px'
          }}
        />
        {/* Viñeta para suavizar los bordes */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_transparent_30%,_#0f172a_100%)] pointer-events-none z-0 opacity-80" />

        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="flex justify-between min-h-16 py-3 items-center flex-wrap gap-3">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <ShieldCheck className="text-emerald-400 w-6 h-6" />
                <span className="font-bold text-xl tracking-tight">AdminPanel</span>
              </div>
              <AdminLiveClock />
            </div>
            
            <div className="flex items-center gap-2 sm:gap-4">
              <Link 
                href="/kiosco" 
                target="_blank"
                className="bg-emerald-600 hover:bg-emerald-500 px-3 sm:px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 transition-colors"
              >
                <MonitorSmartphone className="w-4 h-4" />
                <span className="hidden sm:inline">Abrir Kiosco Seguro</span>
                <span className="sm:hidden">Kiosco</span>
              </Link>
              
              <form action={logout}>
                <button type="submit" className="text-slate-300 hover:text-white px-3 py-2 flex items-center gap-2 text-sm font-medium transition-colors">
                  <LogOut className="w-4 h-4" /> <span className="hidden sm:inline">Salir</span>
                </button>
              </form>
            </div>
          </div>
        </div>
      </nav>

      {/* CONTENIDO */}
      <main className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Nuevo Layout: 12 columnas en total para dar más espacio a la tabla central */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* COLUMNA 1: TRABAJADORES Y CRUD (Ocupa 3 de 12) */}
          <div className="lg:col-span-3 space-y-6">
            <CreateWorkerForm />

            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col max-h-[500px]">
              <div className="p-4 bg-gray-50 border-b border-gray-200 flex items-center gap-2 shrink-0">
                <Users className="w-5 h-5 text-gray-600" />
                <h3 className="font-bold text-gray-800 flex-1">Trabajadores</h3>
                <span className="bg-blue-100 text-blue-700 text-xs font-bold px-2 py-1 rounded-full">{trabajadores.length}</span>
              </div>
              <ul className="divide-y divide-gray-100 overflow-y-auto overflow-x-hidden scrollbar-thin flex-1">
                {trabajadores.length === 0 ? (
                  <li className="p-4 text-sm text-gray-500 text-center">No hay trabajadores.</li>
                ) : (
                  trabajadores.map((t) => (
                    <li key={t.id} className={`p-4 transition-colors ${workerId === t.id ? 'bg-blue-50 border-l-4 border-blue-500' : 'hover:bg-gray-50 border-l-4 border-transparent'}`}>
                      <div className="flex flex-col gap-1">
                        <Link href={`?workerId=${t.id}`} className="block">
                          <span className="font-semibold text-gray-800 text-sm truncate block hover:text-blue-600 transition-colors cursor-pointer">{t.nombre_completo}</span>
                          <span className="block text-xs text-gray-500">@{t.usuario}</span>
                        </Link>
                        <WorkerActions 
                          id={t.id} 
                          hasDevice={!!(t.device_hash && t.device_uuid)} 
                          currentName={t.nombre_completo}
                          currentUsuario={t.usuario}
                        />
                      </div>
                    </li>
                  ))
                )}
              </ul>
            </div>
          </div>

          {/* COLUMNA 2: HISTORIAL DE ASISTENCIAS (Ocupa 6 de 12, es decir, el 50%) */}
          <div className="lg:col-span-6">
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden h-[830px] flex flex-col">
              <AutoRefreshTable intervalSeconds={6} />
              <div className="p-4 bg-gray-50 border-b border-gray-200 flex flex-col xl:flex-row xl:items-start justify-between gap-4 shrink-0">
                <div className="flex items-center gap-2 mt-2">
                  <Clock className="w-5 h-5 text-gray-600" />
                  <h3 className="font-bold text-gray-800">
                    {trabajadorActivo ? `Asistencias de ${trabajadorActivo.nombre_completo}` : 'Últimas Asistencias'}
                  </h3>
                  {workerId && (
                    <Link href={`?desde=${desde||''}&hasta=${hasta||''}`} className="text-xs flex items-center gap-1 bg-red-100 text-red-700 px-2 py-1.5 rounded-lg hover:bg-red-200 font-medium transition-colors ml-2">
                      <FilterX className="w-3.5 h-3.5" /> Quitar
                    </Link>
                  )}
                </div>

                <div className="w-full xl:w-auto flex-shrink-0">
                  <DateFilter workerId={workerId} />
                </div>
              </div>
              
              <div className="overflow-x-auto overflow-y-auto flex-1 pb-10 relative">
                <table className="min-w-full">
                  <thead className="bg-gray-50 sticky top-0 shadow-sm z-10 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Trabajador</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Entrada</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Llegada</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Salida</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white">
                    {Object.keys(groupedAsistencias).length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-6 py-10 text-center text-gray-500">
                          {workerId ? 'Este trabajador no tiene asistencias.' : 'Nadie ha marcado asistencia aún.'}
                        </td>
                      </tr>
                    ) : (
                      Object.entries(groupedAsistencias).map(([fechaTexto, records]) => (
                        <React.Fragment key={fechaTexto}>
                          {/* DIVISOR DE DÍA */}
                          <tr>
                            <td colSpan={4} className="px-6 py-3">
                              <div className="relative flex items-center py-2">
                                <div className="flex-grow border-t border-slate-200"></div>
                                <span className="flex-shrink-0 mx-4 text-xs font-bold text-slate-500 uppercase tracking-widest bg-slate-50 px-3 py-1 rounded-full border border-slate-200">
                                  {fechaTexto}
                                </span>
                                <div className="flex-grow border-t border-slate-200"></div>
                              </div>
                            </td>
                          </tr>
                          
                          {/* REGISTROS DEL DÍA */}
                          {records.map((a) => (
                            <tr key={a.id} className={`transition-colors border-b border-gray-100 last:border-none ${
                              !a.salida 
                                ? 'bg-amber-50/60 hover:bg-amber-50' 
                                : 'hover:bg-gray-50'
                            }`}>
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700 font-semibold">
                                {a.nombre_trabajador}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-slate-700">
                                {a.entrada.toLocaleTimeString('es-ES', { 
                                  timeZone, hour: '2-digit', minute: '2-digit', second: '2-digit' 
                                })}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap">
                                {a.esTarde ? (
                                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-800">
                                    Tarde
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
                                    Temprano
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm font-medium">
                                {a.salida ? (
                                  <span className="text-blue-600 bg-blue-50 px-2 py-1 rounded">
                                    {a.salida.toLocaleTimeString('es-ES', { 
                                      timeZone, hour: '2-digit', minute: '2-digit', second: '2-digit' 
                                    })}
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1.5 text-amber-600 font-semibold">
                                    <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse inline-block" />
                                    Pendiente
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </React.Fragment>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* COLUMNA 3: CONFIGURACIÓN (Ocupa 3 de 12) */}
          <div className="lg:col-span-3">
            <SettingsPanel initialConfig={config} />
          </div>

        </div>
      </main>
    </div>
  )
}
