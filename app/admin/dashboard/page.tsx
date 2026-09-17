import React from 'react'
import { db } from '@/src/prisma/db'
import { logout } from '@/actions/auth'
import { 
  CreateWorkerForm, 
  WorkerActions, 
  SettingsPanel, 
  DateFilter, 
  AdminLiveClock, 
  AutoRefreshTable,
  WorkerListSearch,
  ManualAttendanceButton,
  AvatarCircle 
} from './components/DashboardClient'
import { LogOut, MonitorSmartphone, Clock, Users, ShieldCheck, FilterX } from 'lucide-react'
import Link from 'next/link'
import { getConfig, calcularEsTarde, parsearRegistroManual } from '@/lib/configManager'
import { obtenerEstadoKiosco } from '@/actions/kiosco'

// Fuerza la ruta a ser dinámica para evitar el caché estático
export const dynamic = 'force-dynamic'

export default async function AdminDashboard({ searchParams }: { searchParams: { workerId?: string, desde?: string, hasta?: string } }) {
  const { workerId, desde, hasta } = await searchParams

  // Fetch y Ordenar Trabajadores Alfabéticamente
  const trabajadores = (await db.orm.public.Usuario.where({ rol: 'USER' }).all())
    .sort((a, b) => a.nombre_completo.localeCompare(b.nombre_completo))

  const config = await getConfig()
  const kioskStatus = await obtenerEstadoKiosco()
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
    
    // Si no hay filtro manual de 'desde' ni 'hasta', por defecto se toman los últimos 30 días
    let fechaInicioFiltro: Date | null = null
    if (desde) {
      fechaInicioFiltro = new Date(`${desde}T00:00:00`)
    } else if (!hasta) {
      const hace30Dias = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      hace30Dias.setHours(0, 0, 0, 0)
      fechaInicioFiltro = hace30Dias
    }

    if (fechaInicioFiltro) asistenciasRaw = asistenciasRaw.filter(a => new Date(a.fecha_hora) >= fechaInicioFiltro!)
    if (hasta) asistenciasRaw = asistenciasRaw.filter(a => new Date(a.fecha_hora) <= new Date(`${hasta}T23:59:59.999`))
    
    // Límite de seguridad
    if (asistenciasRaw.length > 5000) asistenciasRaw = asistenciasRaw.slice(-5000)
  } catch (error) {
    console.error("Error cargando asistencias:", error)
    asistenciasRaw = []
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
  const hoyClave = new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date()) // YYYY-MM-DD
  
  rawConFechas.forEach(a => {
    const key = `${a.usuario_id}-${a.fechaDivisor}`
    const u = trabajadores.find(t => t.id === a.usuario_id)
    
    if (!consolidados[key]) {
      const esTarde = calcularEsTarde(a.fecha, a.usuario_id, config, timeZone)
      const fechaClave = new Intl.DateTimeFormat('en-CA', { timeZone }).format(a.fecha)
      const esHoy = fechaClave === hoyClave

      consolidados[key] = {
        id: a.id,
        usuario_id: a.usuario_id,
        nombre_trabajador: u ? u.nombre_completo : 'Usuario Eliminado',
        fechaDivisor: a.fechaDivisor,
        fechaFiltro: a.fecha,
        entrada: a.fecha,
        esTarde,
        esHoy,
        salida: null,
        manualEntrada: parsearRegistroManual(a.id),
        manualSalida: null
      }
    } else if (!consolidados[key].salida) {
      consolidados[key].salida = a.fecha
      consolidados[key].manualSalida = parsearRegistroManual(a.id)
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

        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center py-2.5 sm:py-3 gap-2.5 sm:gap-4">
            
            {/* Fila 1 en móvil / Lado izquierdo en desktop */}
            <div className="flex items-center justify-between sm:justify-start gap-3 w-full sm:w-auto">
              <div className="flex items-center gap-2">
                <ShieldCheck className="text-emerald-400 w-6 h-6 shrink-0" />
                <span className="font-bold text-lg sm:text-xl tracking-tight text-white">AdminPanel</span>
              </div>

              {/* Botones de acción en móvil (Kiosco y Salir alineados a la derecha) */}
              <div className="flex sm:hidden items-center gap-2">
                <Link 
                  href="/kiosco" 
                  target="_blank"
                  className="bg-emerald-600 hover:bg-emerald-500 text-white px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm"
                >
                  <MonitorSmartphone className="w-3.5 h-3.5" />
                  <span>Kiosco</span>
                  {kioskStatus.activo && (
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-300 animate-pulse" title="Kiosco activo en recepción" />
                  )}
                </Link>
                
                <form action={logout}>
                  <button type="submit" className="text-slate-300 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-colors" title="Cerrar sesión">
                    <LogOut className="w-4 h-4" />
                  </button>
                </form>
              </div>

              {/* En desktop: Reloj y botón de Registro Manual van junto al logo */}
              <div className="hidden sm:flex items-center gap-3 ml-2">
                <AdminLiveClock />
                <ManualAttendanceButton trabajadores={trabajadores} />
              </div>
            </div>

            {/* Fila 2 en móvil: Reloj y Registro Manual equilibrados y separados */}
            <div className="flex sm:hidden items-center justify-between gap-2 pt-2 border-t border-slate-800/80 w-full">
              <AdminLiveClock />
              <ManualAttendanceButton trabajadores={trabajadores} />
            </div>

            {/* En desktop: Botones Kiosco y Salir a la derecha */}
            <div className="hidden sm:flex items-center gap-3">
              <Link 
                href="/kiosco" 
                target="_blank"
                className="bg-emerald-600 hover:bg-emerald-500 text-white px-3.5 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 transition-colors shadow-sm group"
              >
                <MonitorSmartphone className="w-4 h-4" />
                <span>Abrir Kiosco Seguro</span>
                {kioskStatus.activo && (
                  <span className="flex h-2 w-2 relative" title="Kiosco activo en recepción">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-200 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-300"></span>
                  </span>
                )}
              </Link>
              
              <form action={logout}>
                <button type="submit" className="text-slate-300 hover:text-white px-3 py-2 flex items-center gap-1.5 text-sm font-medium hover:bg-slate-800 rounded-lg transition-colors">
                  <LogOut className="w-4 h-4" /> <span>Salir</span>
                </button>
              </form>
            </div>

          </div>
        </div>
      </nav>

      {/* CONTENIDO */}
      <main className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Layout Ampliado: Grid adaptativo que otorga todo el ancho restante a la tabla central */}
        <div className="grid grid-cols-1 lg:grid-cols-12 xl:grid-cols-[320px_minmax(0,1fr)_320px] 2xl:grid-cols-[330px_minmax(0,1fr)_330px] gap-6">
          
          {/* COLUMNA 1: TRABAJADORES Y CRUD */}
          <div className="lg:col-span-3 xl:col-auto space-y-6">
            <CreateWorkerForm />

            <WorkerListSearch 
              trabajadores={trabajadores} 
              workerId={workerId} 
              horariosEspeciales={config.horariosEspeciales || {}} 
            />
          </div>

          {/* COLUMNA 2: HISTORIAL DE ASISTENCIAS (AMPLIADO) */}
          <div className="lg:col-span-6 xl:col-auto min-w-0">
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden h-[830px] flex flex-col">
              <AutoRefreshTable intervalSeconds={6} />
              <div className="p-4 bg-gray-50 border-b border-gray-200 flex flex-col 2xl:flex-row 2xl:items-center justify-between gap-3.5 shrink-0">
                <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
                  <div className="bg-white p-2 rounded-lg border border-gray-200 shadow-2xs text-slate-700">
                    <Clock className="w-4 h-4" />
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-bold text-gray-800 text-sm sm:text-base whitespace-nowrap">
                      {trabajadorActivo ? `Asistencias: ${trabajadorActivo.nombre_completo}` : 'Últimas Asistencias'}
                    </h3>
                    {!desde && !hasta && (
                      <span className="text-[10px] font-bold text-slate-600 bg-slate-200/80 px-2 py-0.5 rounded-full border border-slate-300/80 whitespace-nowrap">
                        Últimos 30 días
                      </span>
                    )}
                  </div>
                  {workerId && (
                    <Link href={`?desde=${desde||''}&hasta=${hasta||''}`} className="text-xs flex items-center gap-1 bg-red-100 text-red-700 px-2.5 py-1 rounded-lg hover:bg-red-200 font-semibold transition-colors">
                      <FilterX className="w-3.5 h-3.5" /> Quitar
                    </Link>
                  )}
                </div>

                <div className="w-full 2xl:w-auto flex-shrink-0">
                  <DateFilter workerId={workerId} />
                </div>
              </div>
              
              <div className="overflow-x-auto overflow-y-auto flex-1 pb-10 relative custom-scrollbar">
                <table className="min-w-full w-full">
                  <thead className="bg-gray-50 sticky top-0 shadow-sm z-10 border-b border-gray-200">
                    <tr>
                      <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Trabajador</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Entrada</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Llegada</th>
                      <th className="px-5 pr-7 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Salida</th>
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
                          {records.map((a) => {
                            const esPendienteHoy = !a.salida && a.esHoy
                            const tieneManual = a.manualEntrada?.esManual || a.manualSalida?.esManual
                            
                            let tooltipManual = 'Registro manual por excepción'
                            if (tieneManual) {
                              const partes = []
                              if (a.manualEntrada?.esManual) {
                                partes.push(`Entrada: ${a.manualEntrada.motivoTexto}${a.manualEntrada.detalle ? ` ("${a.manualEntrada.detalle}")` : ''}`)
                              }
                              if (a.manualSalida?.esManual) {
                                partes.push(`Salida: ${a.manualSalida.motivoTexto}${a.manualSalida.detalle ? ` ("${a.manualSalida.detalle}")` : ''}`)
                              }
                              tooltipManual = `Registro manual por excepción:\n• ` + partes.join('\n• ')
                            }

                            return (
                              <tr key={a.id} className={`transition-colors border-b border-gray-100 last:border-none ${
                                esPendienteHoy 
                                  ? 'bg-amber-50/60 hover:bg-amber-50' 
                                  : 'hover:bg-gray-50'
                              }`}>
                                <td className="px-5 py-3 whitespace-nowrap text-sm text-gray-700 font-semibold">
                                  <div className="flex items-center gap-2.5">
                                    <AvatarCircle name={a.nombre_trabajador} size="sm" />
                                    <span className="truncate">{a.nombre_trabajador}</span>
                                    {tieneManual && (
                                      <span 
                                        className="inline-flex items-center gap-1 text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-300 shrink-0 cursor-help" 
                                        title={tooltipManual}
                                      >
                                        Manual ✍️
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-slate-700">
                                  <div className="flex items-center gap-1.5">
                                    <span>
                                      {a.entrada.toLocaleTimeString('es-ES', { 
                                        timeZone, hour: '2-digit', minute: '2-digit', second: '2-digit' 
                                      })}
                                    </span>
                                    {a.manualEntrada?.esManual && (
                                      <span 
                                        className="text-amber-600 text-xs font-bold cursor-help" 
                                        title={`Entrada manual: ${a.manualEntrada.motivoTexto}${a.manualEntrada.detalle ? ` (${a.manualEntrada.detalle})` : ''}`}
                                      >
                                        ✍️
                                      </span>
                                    )}
                                  </div>
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
                                <td className="px-5 pr-7 py-3 whitespace-nowrap text-sm font-medium">
                                  {a.salida ? (
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-blue-600 bg-blue-50 px-2 py-1 rounded">
                                        {a.salida.toLocaleTimeString('es-ES', { 
                                          timeZone, hour: '2-digit', minute: '2-digit', second: '2-digit' 
                                        })}
                                      </span>
                                      {a.manualSalida?.esManual && (
                                        <span 
                                          className="text-amber-600 text-xs font-bold cursor-help" 
                                          title={`Salida manual: ${a.manualSalida.motivoTexto}${a.manualSalida.detalle ? ` (${a.manualSalida.detalle})` : ''}`}
                                        >
                                          ✍️
                                        </span>
                                      )}
                                    </div>
                                  ) : esPendienteHoy ? (
                                    <span className="inline-flex items-center gap-1.5 text-amber-600 font-semibold">
                                      <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse inline-block" />
                                      Pendiente
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium text-gray-500 bg-gray-100 border border-gray-200">
                                      No registrado
                                    </span>
                                  )}
                                </td>
                              </tr>
                            )
                          })}
                        </React.Fragment>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* COLUMNA 3: CONFIGURACIÓN */}
          <div className="lg:col-span-3 xl:col-auto">
            <SettingsPanel initialConfig={config} />
          </div>

        </div>
      </main>
    </div>
  )
}
