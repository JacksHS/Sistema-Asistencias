'use server'

import { db } from '@/src/prisma/db'
import { jwtVerify } from 'jose'
import { getSession, JWT_SECRET_KEY } from '@/lib/session'

// Bloqueo temporal para evitar "Race Conditions" (doble click/scan en el mismo segundo)
const pendingRequests = new Set<string>()

export async function registrarAsistencia(tokenEscaneado: string) {
  // 1. Verificar la sesión ANTES de tocar el candado (evita inconsistencia en finally)
  const session = await getSession()
  if (!session || session.rol !== 'USER') {
    return { error: 'No autorizado' }
  }

  const usuarioId = session.userId as string

  // 2. Verificar candado de Race Condition — el Set solo se toca después de tener usuarioId seguro
  if (pendingRequests.has(usuarioId)) {
    return { error: 'Procesando registro... por favor espera.' }
  }

  // A partir de aquí, el candado está activo. El finally SIEMPRE lo liberará.
  pendingRequests.add(usuarioId)

  try {
    // 3. Desencriptar y validar el token del QR
    let payload: any
    try {
      const verificado = await jwtVerify(tokenEscaneado, JWT_SECRET_KEY, {
        algorithms: ['HS256']
      })
      payload = verificado.payload
    } catch (error: any) {
      // Diferenciar JWT expirado de token inválido/manipulado
      if (error?.code === 'ERR_JWT_EXPIRED') {
        return { error: 'El código QR ha expirado por completo. Pide que refresquen el Kiosco y escanea el nuevo QR.' }
      }
      return { error: 'Código QR inválido o corrupto. Asegúrate de escanear el QR del Kiosco.' }
    }

    const qrType = payload.t || payload.type
    const qrTime = payload.ts || payload.timestamp

    if ((qrType !== 'k' && qrType !== 'kiosco_qr') || !qrTime) {
      return { error: 'El código QR no es válido para asistencia. No es un código del Kiosco.' }
    }

    // 3.5 Validar Red (WiFi / IP) si está configurado
    const { getConfig } = await import('@/lib/configManager')
    const config = await getConfig()
    
    if (config.requerirMismaRed) {
      const { headers } = await import('next/headers')
      const headersList = await headers()
      const forwarded = headersList.get('x-forwarded-for')
      const realIp = headersList.get('x-real-ip')
      
      // Preferir x-real-ip si el proxy lo provee, de lo contrario la IP más lejana en x-forwarded-for
      const workerIp = realIp || (forwarded ? forwarded.split(',')[0].trim() : 'unknown')

      const kioskIp = payload.ip || payload.kioskIp
      if (kioskIp && workerIp !== kioskIp) {
        return { error: 'Debes estar conectado a la misma red (WiFi) que el Kiosco para marcar asistencia.' }
      }
    }

    // 4. REGLA DE 45 SEGUNDOS (aumentado de 15s para tolerar cold starts de Vercel + latencia de celulares)
    const serverTime = Date.now()
    const diffSegundos = (serverTime - qrTime) / 1000

    if (diffSegundos > 45 || diffSegundos < 0) {
      return { error: `Código QR expirado (${diffSegundos.toFixed(0)}s). El Kiosco ya generó uno nuevo, escanea el actual.` }
    }

    // 4.5 VERIFICAR QUE EL USUARIO REALMENTE EXISTA EN ESTA BASE DE DATOS
    const usuarioDB = await db.orm.public.Usuario.where({ id: usuarioId }).first()
    if (!usuarioDB) {
      return { error: 'Tu sesión no pertenece a un usuario válido en esta base de datos. Cierra sesión arriba a la derecha y vuelve a ingresar con tu usuario y contraseña.' }
    }
    if (usuarioDB.activo === false) {
      return { error: 'Esta cuenta se encuentra inactiva. No se pueden registrar marcas de asistencia.' }
    }

    // 5. REGLA DE ENTRADA Y SALIDA
    // Para evitar bugs de Zona Horaria (UTC en Vercel vs Local), forzamos la zona horaria a la región del usuario.
    const tzEnv = process.env.APP_TIMEZONE || process.env.TZ
    const timeZone = (!tzEnv || tzEnv === ':UTC' || tzEnv.startsWith(':')) ? 'America/Lima' : tzEnv
    const formatter = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
    const parts = formatter.formatToParts(new Date())
    const year = parseInt(parts.find(p => p.type === 'year')!.value)
    const month = parseInt(parts.find(p => p.type === 'month')!.value) - 1
    const day = parseInt(parts.find(p => p.type === 'day')!.value)

    // 'hoy' representará la medianoche exacta del día actual en la zona horaria objetivo
    const hoy = new Date(year, month, day)
    const manana = new Date(year, month, day + 1)

    // Traemos todas las asistencias del usuario (filtramos en memoria por ahora)
    const todasAsistencias = await db.orm.public.Asistencia.where({ usuario_id: usuarioId }).all()
    
    const asistenciasHoy = todasAsistencias.filter(a => {
      const fecha = new Date(a.fecha_hora)
      return fecha >= hoy && fecha < manana
    }).sort((a, b) => new Date(a.fecha_hora).getTime() - new Date(b.fecha_hora).getTime())

    // Si ya tiene 2 asistencias hoy (Entrada y Salida)
    if (asistenciasHoy.length >= 2) {
      return { error: 'Ya completaste tus marcas (Entrada y Salida) el día de hoy.' }
    }

    // Si tiene 1 asistencia (Ya marcó Entrada, verificamos el tiempo de gracia para la Salida)
    if (asistenciasHoy.length === 1) {
      const horaEntrada = new Date(asistenciasHoy[0].fecha_hora).getTime()
      const diffMinutos = (serverTime - horaEntrada) / (1000 * 60)

      if (diffMinutos < 60) {
        return { error: `Ya registraste tu entrada hace ${Math.floor(diffMinutos)} minutos. Debes esperar al menos 1 hora para marcar tu salida.` }
      }
    }

    // 6. REGISTRAR ASISTENCIA (Crear la fila en la BD)
    await db.orm.public.Asistencia.create({
      usuario_id: usuarioId,
      // fecha_hora usa default(now()) en PostgreSQL
    })
    
    // Determinar qué mensaje mostrar dependiendo de si fue su primera o segunda marca del día
    const tipo = asistenciasHoy.length === 0 ? 'ENTRADA' : 'SALIDA'
    return { success: 'Asistencia Registrada Correctamente', tipo }

  } catch (error: any) {
    console.error("Error al registrar en DB:", error)
    const errorMsg = error?.message || String(error)
    if (errorMsg.includes('connect') || errorMsg.includes('SSL') || errorMsg.includes('timeout')) {
      return { error: 'Error de conexión con la base de datos. Intenta de nuevo en unos segundos.' }
    }
    if (errorMsg.includes('foreign key') || errorMsg.includes('violates foreign key constraint')) {
      return { error: 'Tu sesión no pertenece a un usuario válido en esta base de datos. Cierra sesión y vuelve a ingresar.' }
    }
    return { error: 'Ocurrió un error interno al registrar la asistencia. Intenta de nuevo o contacte al administrador.' }
  } finally {
    // Liberar el candado después de 2 segundos — siempre se ejecuta, sin importar qué
    setTimeout(() => pendingRequests.delete(usuarioId), 2000)
  }
}

export async function obtenerResumenEmpleado() {
  const session = await getSession()
  if (!session || session.rol !== 'USER') {
    return { error: 'No autorizado' }
  }

  const usuarioId = session.userId as string

  try {
    const usuario = await db.orm.public.Usuario.where({ id: usuarioId }).first()
    if (!usuario) return { error: 'Usuario no encontrado' }
    if (usuario.activo === false) return { error: 'Esta cuenta se encuentra inactiva' }

    // Zona horaria de la aplicación
    const tzEnv = process.env.APP_TIMEZONE || process.env.TZ
    const timeZone = (!tzEnv || tzEnv === ':UTC' || tzEnv.startsWith(':')) ? 'America/Lima' : tzEnv

    const formatter = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
    const parts = formatter.formatToParts(new Date())
    const year = parseInt(parts.find(p => p.type === 'year')!.value)
    const month = parseInt(parts.find(p => p.type === 'month')!.value) - 1
    const day = parseInt(parts.find(p => p.type === 'day')!.value)

    const hoy = new Date(year, month, day)
    const manana = new Date(year, month, day + 1)

    // Configuración para hora límite de tardanza
    const { getConfig, calcularEsTarde } = await import('@/lib/configManager')
    const config = await getConfig()

    // Traer todas las asistencias del trabajador
    const todasAsistencias = await db.orm.public.Asistencia.where({ usuario_id: usuarioId }).all()

    // 1. Determinar estado de HOY
    const asistenciasHoy = todasAsistencias.filter(a => {
      const fecha = new Date(a.fecha_hora)
      return fecha >= hoy && fecha < manana
    }).sort((a, b) => new Date(a.fecha_hora).getTime() - new Date(b.fecha_hora).getTime())

    let estadoHoy: {
      tipo: 'NO_INICIADA' | 'DENTRO' | 'COMPLETADA'
      horaEntrada: string | null
      horaSalida: string | null
      esTarde: boolean
    } = {
      tipo: 'NO_INICIADA',
      horaEntrada: null,
      horaSalida: null,
      esTarde: false
    }

    if (asistenciasHoy.length === 1) {
      const entradaDate = new Date(asistenciasHoy[0].fecha_hora)
      const esTarde = calcularEsTarde(entradaDate, usuarioId, config, timeZone)

      estadoHoy = {
        tipo: 'DENTRO',
        horaEntrada: entradaDate.toLocaleTimeString('es-ES', { timeZone, hour: '2-digit', minute: '2-digit', hour12: true }),
        horaSalida: null,
        esTarde
      }
    } else if (asistenciasHoy.length >= 2) {
      const entradaDate = new Date(asistenciasHoy[0].fecha_hora)
      const salidaDate = new Date(asistenciasHoy[asistenciasHoy.length - 1].fecha_hora)
      const esTarde = calcularEsTarde(entradaDate, usuarioId, config, timeZone)

      estadoHoy = {
        tipo: 'COMPLETADA',
        horaEntrada: entradaDate.toLocaleTimeString('es-ES', { timeZone, hour: '2-digit', minute: '2-digit', hour12: true }),
        horaSalida: salidaDate.toLocaleTimeString('es-ES', { timeZone, hour: '2-digit', minute: '2-digit', hour12: true }),
        esTarde
      }
    }

    // 2. Consolidar marcas de los últimos 7 días (inclusive hoy)
    const hace7Dias = new Date(year, month, day - 6)

    const asistencias7Dias = todasAsistencias.filter(a => {
      const f = new Date(a.fecha_hora)
      return f >= hace7Dias
    }).sort((a, b) => new Date(a.fecha_hora).getTime() - new Date(b.fecha_hora).getTime())

    // Agrupar por día (fechaClave: YYYY-MM-DD)
    const diasMap = new Map<string, { fecha: Date, fechaTexto: string, esHoy: boolean, marcas: Date[] }>()

    asistencias7Dias.forEach(a => {
      const f = new Date(a.fecha_hora)
      const fechaClave = new Intl.DateTimeFormat('en-CA', { timeZone }).format(f) // YYYY-MM-DD
      const fechaHoyClave = new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date())
      const fechaTexto = new Intl.DateTimeFormat('es-ES', { timeZone, weekday: 'short', day: 'numeric', month: 'short' }).format(f)

      if (!diasMap.has(fechaClave)) {
        diasMap.set(fechaClave, { 
          fecha: f, 
          fechaTexto, 
          esHoy: fechaClave === fechaHoyClave,
          marcas: [] 
        })
      }
      diasMap.get(fechaClave)!.marcas.push(f)
    })

    const historial = Array.from(diasMap.values()).map(item => {
      const entrada = item.marcas[0]
      const salida = item.marcas.length > 1 ? item.marcas[item.marcas.length - 1] : null
      const esTarde = calcularEsTarde(entrada, usuarioId, config, timeZone)

      return {
        fechaTexto: item.fechaTexto,
        esHoy: item.esHoy,
        entrada: entrada.toLocaleTimeString('es-ES', { timeZone, hour: '2-digit', minute: '2-digit', hour12: true }),
        salida: salida ? salida.toLocaleTimeString('es-ES', { timeZone, hour: '2-digit', minute: '2-digit', hour12: true }) : '--:--',
        esTarde,
        enCurso: !salida && item.esHoy,
        sinSalida: !salida && !item.esHoy
      }
    }).reverse() // Ordenar de más reciente a más antiguo

    return {
      success: true,
      nombre: usuario.nombre_completo,
      usuario: usuario.usuario,
      estadoHoy,
      historial
    }
  } catch (error) {
    console.error("Error al obtener resumen del trabajador:", error)
    return { error: 'No se pudo cargar el resumen' }
  }
}
