'use server'

import { db } from '@/src/prisma/db'
import bcrypt from 'bcryptjs'
import { revalidatePath } from 'next/cache'

export async function crearTrabajador(prevState: any, formData: FormData) {
  const { getSession } = await import('@/lib/session')
  const session = await getSession()
  if (!session || session.rol !== 'ADMIN') return { error: 'No autorizado' }

  const usuarioInput = formData.get('usuario') as string
  const nombreCompleto = formData.get('nombre_completo') as string
  const password = formData.get('password') as string

  if (!usuarioInput || !password || !nombreCompleto) return { error: 'Todos los campos son requeridos' }
  
  if (usuarioInput.length < 3 || usuarioInput.length > 20) return { error: 'El usuario debe tener entre 3 y 20 caracteres' }
  if (!/^[a-z0-9_]+$/.test(usuarioInput)) return { error: 'El usuario solo puede contener minúsculas, números y guiones bajos (_)' }
  if (password.length < 6) return { error: 'La contraseña debe tener al menos 6 caracteres' }

  try {
    const existe = await db.orm.public.Usuario.where({ usuario: usuarioInput }).first()
    if (existe) return { error: 'El nombre de usuario ya está en uso' }

    const hashedPassword = await bcrypt.hash(password, 10)
    await db.orm.public.Usuario.create({
      usuario: usuarioInput,
      nombre_completo: nombreCompleto,
      password: hashedPassword,
      rol: 'USER'
    })
    
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
    setConfig(config)
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
    revalidatePath('/admin/dashboard')
    return { success: 'Trabajador eliminado' }
  } catch (error) {
    console.error('Error al eliminar:', error)
    return { error: 'No se pudo eliminar al trabajador' }
  }
}

export async function editarTrabajador(id: string, nombre_completo: string) {
  const { getSession } = await import('@/lib/session')
  const session = await getSession()
  if (!session || session.rol !== 'ADMIN') return { error: 'No autorizado' }

  if (!nombre_completo || nombre_completo.trim().length < 3) {
    return { error: 'El nombre debe tener al menos 3 letras' }
  }

  try {
    await db.orm.public.Usuario.where({ id }).update({ nombre_completo })
    revalidatePath('/admin/dashboard')
    return { success: 'Datos actualizados' }
  } catch (error) {
    console.error('Error al editar:', error)
    return { error: 'No se pudo editar al trabajador' }
  }
}
