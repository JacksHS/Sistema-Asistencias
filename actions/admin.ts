'use server'

import { db } from '@/src/prisma/db'
import bcrypt from 'bcryptjs'
import { revalidatePath } from 'next/cache'
import type { AppConfig } from '@/lib/configManager'

export async function crearTrabajador(prevState: any, formData: FormData) {
  const { getSession } = await import('@/lib/session')
  const session = await getSession()
  if (!session || session.rol !== 'ADMIN') return { error: 'No autorizado' }

  const usuarioInput = ((formData.get('usuario') as string) || '').trim().replace(/[^a-zA-Z0-9_]/g, '')
  const nombreCompleto = formData.get('nombre_completo') as string
  const password = formData.get('password') as string

  if (!usuarioInput || !password || !nombreCompleto) return { error: 'Todos los campos son requeridos' }
  
  if (usuarioInput.length < 3 || usuarioInput.length > 20) return { error: 'El usuario debe tener entre 3 y 20 caracteres' }
  if (!/^[a-zA-Z0-9_]+$/.test(usuarioInput)) return { error: 'El usuario solo puede contener letras, números y guiones bajos (_)' }
  if (password.length < 6) return { error: 'La contraseña debe tener al menos 6 caracteres' }

  try {
    const existe = await db.orm.public.Usuario.where({ usuario: usuarioInput }).first()
    if (existe) return { error: 'El nombre de usuario ya está en uso' }

    const hashedPassword = await bcrypt.hash(password, 10)
    const nuevoUsuario = await db.orm.public.Usuario.create({
      usuario: usuarioInput,
      nombre_completo: nombreCompleto,
      password: hashedPassword,
      rol: 'USER'
    })
    
    // Si se especificó horario especial, guardarlo en la configuración
    const horarioEspecial = (formData.get('horario_especial') as string || '').trim()
    if (horarioEspecial && nuevoUsuario?.id) {
      const { getConfig, setConfig } = await import('@/lib/configManager')
      const config = await getConfig()
      const nuevosHorarios = { ...config.horariosEspeciales, [nuevoUsuario.id]: horarioEspecial }
      await setConfig({ horariosEspeciales: nuevosHorarios })
    }

    revalidatePath('/admin/dashboard')
    return { success: 'Trabajador creado exitosamente', error: '' }
  } catch (error) {
    console.error('Error al crear trabajador:', error)
    return { error: 'Hubo un problema al crear el trabajador. Intenta con otro nombre.', success: '' }
  }
}

export async function resetearDispositivo(id: string) {
  const { getSession } = await import('@/lib/session')
  const session = await getSession()
  if (!session || session.rol !== 'ADMIN') return { error: 'No autorizado' }

  try {
    await db.orm.public.Usuario.where({ id }).update({
      device_hash: null,
      device_uuid: null
    })
    revalidatePath('/admin/dashboard')
    return { success: 'Dispositivo desvinculado con éxito' }
  } catch (error) {
    console.error('Error al resetear dispositivo:', error)
    return { error: 'Error al desvincular el dispositivo' }
  }
}

export async function guardarConfiguracion(rawConfig: unknown) {
  const { getSession } = await import('@/lib/session')
  const session = await getSession()
  if (!session || session.rol !== 'ADMIN') return { error: 'No autorizado' }

  if (!rawConfig || typeof rawConfig !== 'object') {
    return { error: 'Datos de configuración inválidos' }
  }

  const c = rawConfig as Partial<AppConfig>
  const sanitized: Partial<AppConfig> = {}

  if (c.requerirLlaveNavegador !== undefined) {
    sanitized.requerirLlaveNavegador = Boolean(c.requerirLlaveNavegador)
  }
  if (c.requerirLlaveDispositivo !== undefined) {
    sanitized.requerirLlaveDispositivo = Boolean(c.requerirLlaveDispositivo)
  }
  if (c.requerirMismaRed !== undefined) {
    sanitized.requerirMismaRed = Boolean(c.requerirMismaRed)
  }
  if (c.horaLimiteTardanza !== undefined) {
    if (typeof c.horaLimiteTardanza === 'string' && /^\d{1,2}:\d{2}$/.test(c.horaLimiteTardanza)) {
      const [h, m] = c.horaLimiteTardanza.split(':').map(Number)
      if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
        sanitized.horaLimiteTardanza = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
      }
    }
  }
  if (c.toleranciaMinutos !== undefined) {
    const tol = Number(c.toleranciaMinutos)
    if (!isNaN(tol)) {
      sanitized.toleranciaMinutos = Math.min(Math.max(0, Math.floor(tol)), 60)
    }
  }
  if (c.horariosEspeciales !== undefined && typeof c.horariosEspeciales === 'object' && c.horariosEspeciales !== null) {
    const validHorarios: Record<string, string> = {}
    for (const [userId, timeStr] of Object.entries(c.horariosEspeciales)) {
      if (typeof userId === 'string' && typeof timeStr === 'string' && /^\d{1,2}:\d{2}$/.test(timeStr)) {
        validHorarios[userId.slice(0, 50)] = timeStr
      }
    }
    sanitized.horariosEspeciales = validHorarios
  }

  try {
    const { setConfig } = await import('@/lib/configManager')
    await setConfig(sanitized)
    revalidatePath('/admin/dashboard')
    return { success: 'Configuración guardada' }
  } catch (error) {
    console.error('Error guardando configuración:', error)
    return { error: 'Error guardando configuración' }
  }
}

export async function eliminarTrabajador(id: string, adminPassword?: string) {
  const { getSession } = await import('@/lib/session')
  const session = await getSession()
  if (!session || session.rol !== 'ADMIN' || !session.userId) return { error: 'No autorizado' }

  if (!adminPassword || !adminPassword.trim()) {
    return { error: 'Debes ingresar tu contraseña de administrador para confirmar la eliminación' }
  }

  try {
    const adminUser = await db.orm.public.Usuario.where({ id: session.userId as string }).first()
    if (!adminUser) return { error: 'Usuario administrador no encontrado' }

    const isPasswordValid = await bcrypt.compare(adminPassword.trim(), adminUser.password)
    if (!isPasswordValid) {
      return { error: 'Contraseña de administrador incorrecta' }
    }

    // Borrado lógico (Soft Delete): conservar historial para SUNAFIL y desvincular llaves de dispositivo
    await db.orm.public.Usuario.where({ id }).update({
      activo: false,
      device_hash: null,
      device_uuid: null
    })
    
    // Limpiar horario especial si existía
    const { getConfig, setConfig } = await import('@/lib/configManager')
    const config = await getConfig()
    if (config.horariosEspeciales?.[id]) {
      const nuevosHorarios = { ...config.horariosEspeciales }
      delete nuevosHorarios[id]
      await setConfig({ horariosEspeciales: nuevosHorarios })
    }

    revalidatePath('/admin/dashboard')
    return { success: 'Trabajador dado de baja (historial conservado)' }
  } catch (error) {
    console.error('Error al dar de baja:', error)
    return { error: 'No se pudo dar de baja al trabajador' }
  }
}

export async function activarTrabajador(id: string) {
  const { getSession } = await import('@/lib/session')
  const session = await getSession()
  if (!session || session.rol !== 'ADMIN') return { error: 'No autorizado' }

  try {
    await db.orm.public.Usuario.where({ id }).update({
      activo: true
    })
    revalidatePath('/admin/dashboard')
    return { success: 'Trabajador reactivado con éxito' }
  } catch (error) {
    console.error('Error al reactivar trabajador:', error)
    return { error: 'No se pudo reactivar al trabajador' }
  }
}


export async function editarTrabajador(
  id: string, 
  nombre_completo: string, 
  horarioEspecial?: string,
  newPassword?: string
) {
  const { getSession } = await import('@/lib/session')
  const session = await getSession()
  if (!session || session.rol !== 'ADMIN') return { error: 'No autorizado' }

  if (!nombre_completo || nombre_completo.trim().length < 3) {
    return { error: 'El nombre debe tener al menos 3 letras' }
  }

  if (newPassword && newPassword.trim()) {
    if (newPassword.trim().length < 6) {
      return { error: 'La nueva contraseña debe tener al menos 6 caracteres' }
    }
  }

  try {
    const updateData: { nombre_completo: string; password?: string } = {
      nombre_completo: nombre_completo.trim()
    }

    if (newPassword && newPassword.trim()) {
      const hashedPassword = await bcrypt.hash(newPassword.trim(), 10)
      updateData.password = hashedPassword
    }

    await db.orm.public.Usuario.where({ id }).update(updateData)
    
    // Actualizar horario especial si se pasó el parámetro
    if (horarioEspecial !== undefined) {
      const { getConfig, setConfig } = await import('@/lib/configManager')
      const config = await getConfig()
      const nuevosHorarios = { ...config.horariosEspeciales }
      if (horarioEspecial && horarioEspecial.trim()) {
        nuevosHorarios[id] = horarioEspecial.trim()
      } else {
        delete nuevosHorarios[id]
      }
      await setConfig({ horariosEspeciales: nuevosHorarios })
    }

    revalidatePath('/admin/dashboard')
    return { success: 'Datos actualizados con éxito' }
  } catch (error) {
    console.error('Error al editar:', error)
    return { error: 'No se pudo editar al trabajador' }
  }
}

export async function crearAsistenciaManual(prevState: any, formData: FormData) {
  const { getSession } = await import('@/lib/session')
  const session = await getSession()
  if (!session || session.rol !== 'ADMIN' || !session.userId) return { error: 'No autorizado' }

  const usuarioId = formData.get('usuarioId') as string
  const fecha = formData.get('fecha') as string // YYYY-MM-DD
  const hora = formData.get('hora') as string // HH:mm
  const motivoClave = (formData.get('motivo') as string || 'otro').trim()
  const adminPassword = (formData.get('adminPassword') as string || '').trim()

  if (!usuarioId || !fecha || !hora) {
    return { error: 'Trabajador, fecha y hora son requeridos' }
  }

  if (!adminPassword) {
    return { error: 'Debes ingresar tu contraseña de administrador para autorizar el registro' }
  }

  // 1. Validar que la fecha sea estrictamente del día de hoy en Perú
  const tzEnv = process.env.APP_TIMEZONE || process.env.TZ
  const timeZone = (!tzEnv || tzEnv === ':UTC' || tzEnv.startsWith(':')) ? 'America/Lima' : tzEnv
  const hoyPeru = new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date()) // YYYY-MM-DD
  if (fecha !== hoyPeru) {
    return { error: 'Solo se pueden registrar excepciones de asistencia para el día de hoy' }
  }

  // 2. Validar que la hora no sea en el futuro
  const nowServer = Date.now()
  const fechaHoraTarget = new Date(`${fecha}T${hora}:00-05:00`).getTime()
  if (isNaN(fechaHoraTarget)) {
    return { error: 'Formato de fecha u hora no válido' }
  }
  if (fechaHoraTarget > nowServer + 5 * 60 * 1000) { // Margen de 5 min por desfase de segundos
    return { error: 'No puedes registrar una asistencia con hora en el futuro' }
  }

  try {
    const adminUser = await db.orm.public.Usuario.where({ id: session.userId as string }).first()
    if (!adminUser) return { error: 'Usuario administrador no encontrado' }

    const isPasswordValid = await bcrypt.compare(adminPassword, adminUser.password)
    if (!isPasswordValid) {
      return { error: 'Contraseña de administrador incorrecta' }
    }

    const usuario = await db.orm.public.Usuario.where({ id: usuarioId }).first()
    if (!usuario) return { error: 'Trabajador no encontrado' }
    if (usuario.activo === false) return { error: 'No se puede registrar asistencia manual a un trabajador inactivo' }

    // 3. Validar marcas del día de hoy para este trabajador
    const hoyStart = new Date(`${hoyPeru}T00:00:00-05:00`)
    const hoyEnd = new Date(`${hoyPeru}T23:59:59.999-05:00`)
    const asistenciasExistentes = await db.orm.public.Asistencia.where({ usuario_id: usuarioId }).all()
    const asistenciasHoy = asistenciasExistentes.filter(a => {
      const f = new Date(a.fecha_hora)
      return f >= hoyStart && f <= hoyEnd
    }).sort((a, b) => new Date(a.fecha_hora).getTime() - new Date(b.fecha_hora).getTime())

    if (asistenciasHoy.length >= 2) {
      return { error: 'Este trabajador ya tiene registradas tanto su Entrada como su Salida el día de hoy.' }
    }

    if (asistenciasHoy.length === 1) {
      const horaPrimera = new Date(asistenciasHoy[0].fecha_hora).getTime()
      if (fechaHoraTarget <= horaPrimera) {
        return { error: 'La hora de salida manual debe ser posterior a la hora de entrada ya registrada.' }
      }
    }

    // Fecha en hora local de Perú (UTC-5)
    const fechaHoraIso = new Date(`${fecha}T${hora}:00-05:00`).toISOString()
    const manualId = `manual_${Date.now()}_${motivoClave}_none_${Math.random().toString(36).substring(2, 6)}`

    await db.orm.public.Asistencia.create({
      id: manualId,
      usuario_id: usuarioId,
      fecha_hora: fechaHoraIso
    })

    const esSalida = asistenciasHoy.length === 1
    revalidatePath('/admin/dashboard')
    return { 
      success: esSalida 
        ? 'Salida manual registrada con éxito' 
        : 'Entrada manual registrada con éxito', 
      error: '' 
    }
  } catch (error: any) {
    console.error('Error al crear asistencia manual:', error)
    return { error: 'Ocurrió un error al registrar la asistencia manual. Intenta nuevamente.' }
  }
}
