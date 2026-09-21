'use server'

import { db } from '@/src/prisma/db'
import bcrypt from 'bcryptjs'
import { revalidatePath } from 'next/cache'

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

export async function guardarConfiguracion(config: any) {
  const { getSession } = await import('@/lib/session')
  const session = await getSession()
  if (!session || session.rol !== 'ADMIN') return { error: 'No autorizado' }

  try {
    const { setConfig } = await import('@/lib/configManager')
    await setConfig(config)
    revalidatePath('/admin/dashboard')
    return { success: 'Configuración guardada' }
  } catch (error) {
    return { error: 'Error guardando configuración' }
  }
}

export async function eliminarTrabajador(id: string) {
  const { getSession } = await import('@/lib/session')
  const session = await getSession()
  if (!session || session.rol !== 'ADMIN') return { error: 'No autorizado' }

  try {
    // Primero eliminar las asistencias
    await db.orm.public.Asistencia.where({ usuario_id: id }).delete()
    // Luego eliminar al usuario
    await db.orm.public.Usuario.where({ id }).delete()
    
    // Limpiar horario especial si existía
    const { getConfig, setConfig } = await import('@/lib/configManager')
    const config = await getConfig()
    if (config.horariosEspeciales?.[id]) {
      const nuevosHorarios = { ...config.horariosEspeciales }
      delete nuevosHorarios[id]
      await setConfig({ horariosEspeciales: nuevosHorarios })
    }

    revalidatePath('/admin/dashboard')
    return { success: 'Trabajador eliminado' }
  } catch (error) {
    console.error('Error al eliminar:', error)
    return { error: 'No se pudo eliminar al trabajador' }
  }
}

export async function editarTrabajador(id: string, nombre_completo: string, horarioEspecial?: string) {
  const { getSession } = await import('@/lib/session')
  const session = await getSession()
  if (!session || session.rol !== 'ADMIN') return { error: 'No autorizado' }

  if (!nombre_completo || nombre_completo.trim().length < 3) {
    return { error: 'El nombre debe tener al menos 3 letras' }
  }

  try {
    await db.orm.public.Usuario.where({ id }).update({ nombre_completo })
    
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
    return { success: 'Datos actualizados' }
  } catch (error) {
    console.error('Error al editar:', error)
    return { error: 'No se pudo editar al trabajador' }
  }
}

export async function crearAsistenciaManual(prevState: any, formData: FormData) {
  const { getSession } = await import('@/lib/session')
  const session = await getSession()
  if (!session || session.rol !== 'ADMIN') return { error: 'No autorizado' }

  const usuarioId = formData.get('usuarioId') as string
  const fecha = formData.get('fecha') as string // YYYY-MM-DD
  const hora = formData.get('hora') as string // HH:mm
  const motivoClave = (formData.get('motivo') as string || 'otro').trim()
  const detalle = (formData.get('detalle') as string || '').trim().replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ .,-]/g, '').slice(0, 60)

  if (!usuarioId || !fecha || !hora) {
    return { error: 'Trabajador, fecha y hora son requeridos' }
  }

  // 1. Validar que la fecha y hora no sean en el futuro
  const nowServer = Date.now()
  const fechaHoraTarget = new Date(`${fecha}T${hora}:00-05:00`).getTime()
  if (isNaN(fechaHoraTarget)) {
    return { error: 'Formato de fecha u hora no válido' }
  }
  if (fechaHoraTarget > nowServer + 5 * 60 * 1000) { // Margen de 5 min por desfase de segundos
    return { error: 'No puedes registrar una asistencia con fecha u hora en el futuro' }
  }

  // 2. Validar que la fecha no tenga más de 30 días de antigüedad
  if (nowServer - fechaHoraTarget > 30 * 24 * 60 * 60 * 1000) {
    return { error: 'La fecha no puede superar los 30 días de antigüedad' }
  }

  try {
    const usuario = await db.orm.public.Usuario.where({ id: usuarioId }).first()
    if (!usuario) return { error: 'Trabajador no encontrado' }

    // Fecha en hora local de Perú (UTC-5)
    const fechaHoraIso = new Date(`${fecha}T${hora}:00-05:00`).toISOString()
    const detalleHex = detalle ? Buffer.from(detalle, 'utf-8').toString('hex') : 'none'
    const manualId = `manual_${Date.now()}_${motivoClave}_${detalleHex}_${Math.random().toString(36).substring(2, 6)}`

    await db.orm.public.Asistencia.create({
      id: manualId,
      usuario_id: usuarioId,
      fecha_hora: fechaHoraIso
    })

    revalidatePath('/admin/dashboard')
    return { success: 'Asistencia manual registrada con éxito', error: '' }
  } catch (error: any) {
    console.error('Error al crear asistencia manual:', error)
    return { error: 'Ocurrió un error al registrar la asistencia manual. Intenta nuevamente.' }
  }
}
