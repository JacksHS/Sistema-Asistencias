import { NextResponse } from 'next/server'
import { db } from '@/src/prisma/db'
import { getSession } from '@/lib/session'
import { getConfig } from '@/lib/configManager'
import * as XLSX from 'xlsx'

export async function GET(request: Request) {
  // 1. Validar sesión
  const session = await getSession()
  if (!session || session.rol !== 'ADMIN') {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  // 2. Extraer parámetros de búsqueda
  const { searchParams } = new URL(request.url)
  const workerId = searchParams.get('workerId')
  const desde = searchParams.get('desde')
  const hasta = searchParams.get('hasta')

  // 3. Obtener configuración (hora límite de tardanza)
  const config = await getConfig()
  const [limiteHora, limiteMin] = (config.horaLimiteTardanza || '09:00').split(':').map(Number)

  try {
    // 4. Obtener todos los trabajadores
    const trabajadores = await db.orm.public.Usuario.where({ rol: 'USER' }).all()

    // 5. Obtener asistencias (filtradas o todas) con límite de seguridad
    const whereFilter: any = {}
    if (workerId) whereFilter.usuario_id = workerId

    let asistenciasRaw = []
    const query = Object.keys(whereFilter).length > 0 
      ? db.orm.public.Asistencia.where(whereFilter) 
      : db.orm.public.Asistencia
      
    asistenciasRaw = await query.all()

    // 5.1 Refuerzo de filtro en memoria: por defecto últimos 30 días si no se especifican fechas
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
    
    // Límite de seguridad para exportación pesada
    if (asistenciasRaw.length > 5000) asistenciasRaw = asistenciasRaw.slice(-5000)

    // 6. Consolidar Entrada y Salida (Misma lógica que en el panel)
    const tzEnv = process.env.APP_TIMEZONE || process.env.TZ
    const timeZone = (!tzEnv || tzEnv === ':UTC' || tzEnv.startsWith(':')) ? 'America/Lima' : tzEnv
    const rawConFechas = asistenciasRaw.map(a => {
      const fecha = new Date(a.fecha_hora)
      const fechaDivisor = new Intl.DateTimeFormat('es-ES', { 
        timeZone, weekday: 'long', day: 'numeric', month: 'long' 
      }).format(fecha)
      return { ...a, fecha, fechaDivisor }
    }).sort((a, b) => a.fecha.getTime() - b.fecha.getTime())

    const consolidados: Record<string, any> = {}
    
    rawConFechas.forEach(a => {
      const key = `${a.usuario_id}-${a.fechaDivisor}`
      const u = trabajadores.find(t => t.id === a.usuario_id)
      
      if (!consolidados[key]) {
        // Extraer hora y minuto en la zona horaria correcta (no UTC)
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
          usuario_id: a.usuario_id,
          nombre_trabajador: u ? u.nombre_completo : 'Usuario Eliminado',
          fechaFiltro: a.fecha,
          entrada: a.fecha,
          esTarde,
          salida: null
        }
      } else if (!consolidados[key].salida) {
        consolidados[key].salida = a.fecha
      }
    })

    const hoyClave = new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date())

    const asistenciasFormateadas = Object.values(consolidados).map(a => {
      const fechaClave = new Intl.DateTimeFormat('en-CA', { timeZone }).format(a.fechaFiltro)
      const esHoy = fechaClave === hoyClave
      const salidaTexto = a.salida 
        ? a.salida.toLocaleTimeString('es-ES', { timeZone, hour: '2-digit', minute: '2-digit', second: '2-digit' }) 
        : (esHoy ? 'Pendiente' : 'No registrado')

      return {
        'Trabajador': a.nombre_trabajador,
        'Fecha': a.fechaFiltro.toLocaleDateString('es-ES', { timeZone }),
        'Entrada': a.entrada.toLocaleTimeString('es-ES', { timeZone, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        'Estado (Llegada)': a.esTarde ? 'Tarde' : 'Temprano',
        'Salida': salidaTexto
      }
    })

    // Volver a ordenar descendente para el Excel (Opcional, pero suele ser mejor ver lo más reciente arriba)
    asistenciasFormateadas.reverse()

    // 7. Generar Excel
    const worksheet = XLSX.utils.json_to_sheet(asistenciasFormateadas)
    
    // Ajustar el ancho de las columnas
    worksheet['!cols'] = [
      { wch: 35 }, // Trabajador
      { wch: 15 }, // Fecha
      { wch: 15 }, // Entrada
      { wch: 20 }, // Estado
      { wch: 15 }  // Salida
    ]

    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Asistencias')

    // Escribir el buffer
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })

    // 8. Enviar respuesta como archivo descargable
    return new NextResponse(buffer, {
      headers: {
        'Content-Disposition': `attachment; filename="reporte_asistencias_${new Date().toISOString().split('T')[0]}.xlsx"`,
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      }
    })
  } catch (error) {
    console.error("Error generando Excel:", error)
    return new NextResponse('Error generating excel', { status: 500 })
  }
}
