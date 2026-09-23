import { NextResponse } from 'next/server'
import { db } from '@/src/prisma/db'
import { getSession } from '@/lib/session'
import { getConfig, calcularEsTarde, parsearRegistroManual } from '@/lib/configManager'
import ExcelJS from 'exceljs'

export async function GET(request: Request) {
  // 1. Validar sesión de administrador
  const session = await getSession()
  if (!session || session.rol !== 'ADMIN') {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  // 2. Extraer parámetros de búsqueda
  const { searchParams } = new URL(request.url)
  const workerId = searchParams.get('workerId')
  const desde = searchParams.get('desde')
  const hasta = searchParams.get('hasta')

  // 2.1 Candado de Seguridad Defensivo: Rango máximo de 90 días (92 días de gracia)
  const now = new Date()
  const fechaInicio = desde ? new Date(`${desde}T00:00:00`) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const fechaFin = hasta ? new Date(`${hasta}T23:59:59.999`) : now

  if (isNaN(fechaInicio.getTime()) || isNaN(fechaFin.getTime())) {
    return NextResponse.json(
      { error: "Formato de fechas no válido." },
      { status: 400 }
    )
  }

  const diffTime = Math.abs(fechaFin.getTime() - fechaInicio.getTime())
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
  if (diffDays > 92) {
    return NextResponse.json(
      { error: "Rango de fechas no permitido. El límite máximo es de 90 días." },
      { status: 400 }
    )
  }

  // 3. Obtener configuración
  const config = await getConfig()

  try {
    // 4. Obtener trabajadores (todos para mapping histórico SUNAFIL)
    const trabajadores = await db.orm.public.Usuario.where({ rol: 'USER' }).all()
    const trabajadorFiltrado = workerId ? trabajadores.find(t => t.id === workerId) : null

    // 5. Obtener asistencias
    const whereFilter: any = {}
    if (workerId) whereFilter.usuario_id = workerId

    let asistenciasRaw = []
    const query = Object.keys(whereFilter).length > 0 
      ? db.orm.public.Asistencia.where(whereFilter) 
      : db.orm.public.Asistencia
      
    asistenciasRaw = await query.all()

    // Filtro de fecha en memoria con fechas validadas
    asistenciasRaw = asistenciasRaw.filter(a => {
      const f = new Date(a.fecha_hora)
      return f >= fechaInicio && f <= fechaFin
    })

    // Si es exportación general (!workerId), solo incluir asistencias de trabajadores activos para no ensuciar registros
    if (!workerId) {
      const activeIds = new Set(trabajadores.filter(t => t.activo !== false).map(t => t.id))
      asistenciasRaw = asistenciasRaw.filter(a => activeIds.has(a.usuario_id))
    }
    
    // Límite de seguridad para exportación pesada
    if (asistenciasRaw.length > 5000) asistenciasRaw = asistenciasRaw.slice(-5000)

    // 6. Consolidar Entrada y Salida
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
        const esTarde = calcularEsTarde(a.fecha, a.usuario_id, config, timeZone)
        const nombreDisplay = u 
          ? `${u.nombre_completo}${u.activo === false ? ' (Inactivo)' : ''}` 
          : 'Usuario Eliminado'

        consolidados[key] = {
          usuario_id: a.usuario_id,
          nombre_trabajador: nombreDisplay,
          fechaFiltro: a.fecha,
          entrada: a.fecha,
          esTarde,
          salida: null,
          manualEntrada: parsearRegistroManual(a.id),
          manualSalida: null
        }
      } else if (!consolidados[key].salida) {
        consolidados[key].salida = a.fecha
        consolidados[key].manualSalida = parsearRegistroManual(a.id)
      }
    })

    const hoyClave = new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date())

    // Convertir a lista y ordenar cronológicamente descendente (más reciente arriba)
    const registros = Object.values(consolidados).sort(
      (a, b) => b.fechaFiltro.getTime() - a.fechaFiltro.getTime()
    )

    // 7. Construcción de Workbook Corporativo con ExcelJS
    const workbook = new ExcelJS.Workbook()
    workbook.creator = 'Sistema de Asistencias CONVER'
    workbook.lastModifiedBy = 'Administrador'
    workbook.created = new Date()
    workbook.modified = new Date()

    const worksheet = workbook.addWorksheet('Control de Asistencias', {
      views: [{ state: 'frozen', ySplit: 5, showGridLines: true }],
      pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1 }
    })

    // Ancho de Columnas
    worksheet.columns = [
      { key: 'trabajador', width: 45 },
      { key: 'fecha', width: 16 },
      { key: 'entrada', width: 16 },
      { key: 'estado', width: 20 },
      { key: 'salida', width: 18 },
      { key: 'tipo', width: 24 }
    ]

    // --- FILA 1: Espaciador superior ---
    worksheet.getRow(1).height = 12

    // --- FILA 2: Banner de Título Ejecutivo ---
    worksheet.mergeCells('A2:F2')
    const titleRow = worksheet.getRow(2)
    titleRow.height = 36
    const titleCell = worksheet.getCell('A2')
    titleCell.value = 'SISTEMA DE ASISTENCIAS — REPORTE DE CONTROL DE PERSONAL'
    titleCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF0F172A' } // Slate 900
    }
    titleCell.font = {
      name: 'Segoe UI',
      size: 13,
      bold: true,
      color: { argb: 'FFFFFFFF' }
    }
    titleCell.alignment = {
      horizontal: 'center',
      vertical: 'middle'
    }

    // --- FILA 3: Metadatos y Filtros Aplicados ---
    worksheet.mergeCells('A3:F3')
    const metaRow = worksheet.getRow(3)
    metaRow.height = 20
    const metaCell = worksheet.getCell('A3')

    const ahoraPeru = new Intl.DateTimeFormat('es-PE', {
      timeZone,
      dateStyle: 'medium',
      timeStyle: 'short'
    }).format(new Date())

    const filtroTrabajadorTexto = trabajadorFiltrado ? trabajadorFiltrado.nombre_completo : 'Todos los trabajadores'
    const filtroPeriodoTexto = (desde && hasta) 
      ? `${desde} al ${hasta}` 
      : desde 
        ? `Desde ${desde}` 
        : hasta 
          ? `Hasta ${hasta}` 
          : 'Últimos 30 días'

    metaCell.value = `Emitido: ${ahoraPeru}  |  Personal: ${filtroTrabajadorTexto}  |  Periodo: ${filtroPeriodoTexto}`
    metaCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1E293B' } // Slate 800
    }
    metaCell.font = {
      name: 'Segoe UI',
      size: 9,
      italic: true,
      color: { argb: 'FFCBD5E1' } // Slate 300
    }
    metaCell.alignment = {
      horizontal: 'center',
      vertical: 'middle'
    }

    // --- FILA 4: Espaciador previo a la tabla ---
    worksheet.getRow(4).height = 10

    // --- FILA 5: Encabezados de Columnas ---
    const headerRow = worksheet.getRow(5)
    headerRow.height = 28
    const headers = [
      { col: 'A', text: 'TRABAJADOR' },
      { col: 'B', text: 'FECHA' },
      { col: 'C', text: 'ENTRADA' },
      { col: 'D', text: 'ESTADO LLEGADA' },
      { col: 'E', text: 'SALIDA' },
      { col: 'F', text: 'TIPO DE REGISTRO' }
    ]

    headers.forEach(h => {
      const cell = worksheet.getCell(`${h.col}5`)
      cell.value = h.text
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF334155' } // Slate 700
      }
      cell.font = {
        name: 'Segoe UI',
        size: 10,
        bold: true,
        color: { argb: 'FFFFFFFF' }
      }
      cell.alignment = {
        horizontal: h.col === 'A' ? 'left' : 'center',
        vertical: 'middle',
        indent: h.col === 'A' ? 1 : 0
      }
      cell.border = {
        top: { style: 'thin', color: { argb: 'FF475569' } },
        left: { style: 'thin', color: { argb: 'FF475569' } },
        bottom: { style: 'medium', color: { argb: 'FF0F172A' } },
        right: { style: 'thin', color: { argb: 'FF475569' } }
      }
    })

    // Bordes estándar para celdas de datos
    const borderFino = {
      top: { style: 'thin' as const, color: { argb: 'FFE2E8F0' } },
      left: { style: 'thin' as const, color: { argb: 'FFE2E8F0' } },
      bottom: { style: 'thin' as const, color: { argb: 'FFE2E8F0' } },
      right: { style: 'thin' as const, color: { argb: 'FFE2E8F0' } }
    }

    // Estadísticas para el resumen
    let totalPuntuales = 0
    let totalTardanzas = 0
    let totalPendientes = 0
    let totalManuales = 0

    // --- FILAS 6+: Inserción de Datos Estilizados ---
    let currentRowIndex = 6

    registros.forEach((a, idx) => {
      const row = worksheet.getRow(currentRowIndex)
      row.height = 24

      // Zebra striping de fondo (blanco vs gris muy sutil)
      const zebraBg = idx % 2 === 0 ? 'FFFFFFFF' : 'FFF8FAFC'

      const fechaClave = new Intl.DateTimeFormat('en-CA', { timeZone }).format(a.fechaFiltro)
      const esHoy = fechaClave === hoyClave
      
      const tieneManual = a.manualEntrada?.esManual || a.manualSalida?.esManual
      if (tieneManual) totalManuales++
      if (a.esTarde) totalTardanzas++; else totalPuntuales++
      if (!a.salida && esHoy) totalPendientes++

      // 1. Celda Trabajador (Columna A)
      const cellA = worksheet.getCell(`A${currentRowIndex}`)
      cellA.value = a.nombre_trabajador
      cellA.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: zebraBg } }
      cellA.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF1E293B' } }
      cellA.alignment = { horizontal: 'center', vertical: 'middle', indent: 1 }
      cellA.border = borderFino

      // 2. Celda Fecha (Columna B)
      const cellB = worksheet.getCell(`B${currentRowIndex}`)
      cellB.value = a.fechaFiltro.toLocaleDateString('es-ES', { timeZone })
      cellB.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: zebraBg } }
      cellB.font = { name: 'Segoe UI', size: 10, color: { argb: 'FF334155' } }
      cellB.alignment = { horizontal: 'center', vertical: 'middle' }
      cellB.border = borderFino

      // 3. Celda Entrada (Columna C)
      const cellC = worksheet.getCell(`C${currentRowIndex}`)
      const horaEntrada = a.entrada.toLocaleTimeString('es-ES', { 
        timeZone, hour: '2-digit', minute: '2-digit', second: '2-digit' 
      })
      cellC.value = a.manualEntrada?.esManual ? `${horaEntrada}` : horaEntrada
      cellC.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: zebraBg } }
      cellC.font = { name: 'Segoe UI', size: 10, color: { argb: 'FF0F172A' } }
      cellC.alignment = { horizontal: 'center', vertical: 'middle' }
      cellC.border = borderFino

      // 4. Celda Estado / Llegada (Columna D - Badge corporativo)
      const cellD = worksheet.getCell(`D${currentRowIndex}`)
      if (a.esTarde) {
        cellD.value = '⚠ Tarde'
        cellD.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } } // Soft red
        cellD.font = { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: 'FFB91C1C' } } // Dark red
        cellD.border = {
          ...borderFino,
          top: { style: 'thin', color: { argb: 'FFFCA5A5' } },
          bottom: { style: 'thin', color: { argb: 'FFFCA5A5' } }
        }
      } else {
        cellD.value = '✓ Temprano'
        cellD.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCFCE7' } } // Soft green
        cellD.font = { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: 'FF15803D' } } // Dark green
        cellD.border = {
          ...borderFino,
          top: { style: 'thin', color: { argb: 'FF86EFAC' } },
          bottom: { style: 'thin', color: { argb: 'FF86EFAC' } }
        }
      }
      cellD.alignment = { horizontal: 'center', vertical: 'middle' }

      // 5. Celda Salida (Columna E)
      const cellE = worksheet.getCell(`E${currentRowIndex}`)
      if (a.salida) {
        const horaSalida = a.salida.toLocaleTimeString('es-ES', { 
          timeZone, hour: '2-digit', minute: '2-digit', second: '2-digit' 
        })
        cellE.value = a.manualSalida?.esManual ? `${horaSalida} ✍️` : horaSalida
        cellE.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF6FF' } } // Soft blue
        cellE.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF1D4ED8' } } // Blue 700
        cellE.border = {
          ...borderFino,
          top: { style: 'thin', color: { argb: 'FFBFDBFE' } },
          bottom: { style: 'thin', color: { argb: 'FFBFDBFE' } }
        }
      } else if (esHoy) {
        cellE.value = 'En curso...'
        cellE.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } } // Soft amber
        cellE.font = { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: 'FFB45309' } } // Amber 700
        cellE.border = borderFino
      } else {
        cellE.value = 'No registrado'
        cellE.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } } // Soft gray
        cellE.font = { name: 'Segoe UI', size: 9, italic: true, color: { argb: 'FF64748B' } }
        cellE.border = borderFino
      }
      cellE.alignment = { horizontal: 'center', vertical: 'middle' }

      // 6. Celda Tipo de Registro / Justificación (Columna F)
      const cellF = worksheet.getCell(`F${currentRowIndex}`)
      if (tieneManual) {
        const motivos: string[] = []
        if (a.manualEntrada?.esManual) {
          motivos.push(`Entrada: ${a.manualEntrada.motivoTexto}${a.manualEntrada.detalle ? ` ("${a.manualEntrada.detalle}")` : ''}`)
        }
        if (a.manualSalida?.esManual) {
          motivos.push(`Salida: ${a.manualSalida.motivoTexto}${a.manualSalida.detalle ? ` ("${a.manualSalida.detalle}")` : ''}`)
        }
        cellF.value = `✍️ Excepción Manual`
        cellF.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF9C3' } } // Soft yellow
        cellF.font = { name: 'Segoe UI', size: 9, bold: true, color: { argb: 'FF854D0E' } }
        cellF.border = {
          ...borderFino,
          top: { style: 'thin', color: { argb: 'FFFDE047' } },
          bottom: { style: 'thin', color: { argb: 'FFFDE047' } }
        }
      } else {
        cellF.value = ' Ordinario '
        cellF.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: zebraBg } }
        cellF.font = { name: 'Segoe UI', size: 9, color: { argb: 'FF64748B' } }
        cellF.border = borderFino
      }
      cellF.alignment = { horizontal: 'center', vertical: 'middle', indent: 1 }

      currentRowIndex++
    })

    // Caso de tabla vacía
    if (registros.length === 0) {
      worksheet.mergeCells(`A${currentRowIndex}:F${currentRowIndex}`)
      const emptyCell = worksheet.getCell(`A${currentRowIndex}`)
      emptyCell.value = 'No se encontraron asistencias en el periodo seleccionado.'
      emptyCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } }
      emptyCell.font = { name: 'Segoe UI', size: 10, italic: true, color: { argb: 'FF64748B' } }
      emptyCell.alignment = { horizontal: 'center', vertical: 'middle' }
      worksheet.getRow(currentRowIndex).height = 30
      currentRowIndex++
    }

    // --- SECCIÓN DE RESUMEN Y MÉTRICAS AL PIE ---
    currentRowIndex++ // Espaciador
    worksheet.getRow(currentRowIndex).height = 10
    currentRowIndex++

    const summaryRow = worksheet.getRow(currentRowIndex)
    summaryRow.height = 26

    // Celda Título Resumen
    const sumTitle = worksheet.getCell(`A${currentRowIndex}`)
    sumTitle.value = 'TOTALES DEL REPORTE'
    sumTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } }
    sumTitle.font = { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: 'FFFFFFFF' } }
    sumTitle.alignment = { horizontal: 'center', vertical: 'middle' }

    // Celda Total Registros
    const sumTotal = worksheet.getCell(`B${currentRowIndex}`)
    sumTotal.value = `Registros: ${registros.length}`
    sumTotal.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } }
    sumTotal.font = { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: 'FFFFFFFF' } }
    sumTotal.alignment = { horizontal: 'center', vertical: 'middle' }

    // Celda Total Temprano
    const sumTemprano = worksheet.getCell(`C${currentRowIndex}`)
    sumTemprano.value = `✓ Temprano: ${totalPuntuales}`
    sumTemprano.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCFCE7' } }
    sumTemprano.font = { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: 'FF15803D' } }
    sumTemprano.alignment = { horizontal: 'center', vertical: 'middle' }

    // Celda Total Tardanzas
    const sumTardanzas = worksheet.getCell(`D${currentRowIndex}`)
    sumTardanzas.value = `⚠ Tardanzas: ${totalTardanzas}`
    sumTardanzas.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } }
    sumTardanzas.font = { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: 'FFB91C1C' } }
    sumTardanzas.alignment = { horizontal: 'center', vertical: 'middle' }

    // Celda Total Pendientes
    const sumPendientes = worksheet.getCell(`E${currentRowIndex}`)
    sumPendientes.value = `Pendientes: ${totalPendientes}`
    sumPendientes.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } }
    sumPendientes.font = { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: 'FFB45309' } }
    sumPendientes.alignment = { horizontal: 'center', vertical: 'middle' }

    // Celda Total Excepciones Manuales
    const sumManuales = worksheet.getCell(`F${currentRowIndex}`)
    sumManuales.value = `✍️ Excepciones: ${totalManuales}`
    sumManuales.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF9C3' } }
    sumManuales.font = { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: 'FF854D0E' } }
    sumManuales.alignment = { horizontal: 'center', vertical: 'middle' }

    // 8. Generar buffer XLSX
    const buffer = await workbook.xlsx.writeBuffer()

    // 9. Enviar respuesta como archivo descargable
    return new NextResponse(buffer as any, {
      headers: {
        'Content-Disposition': `attachment; filename="reporte_asistencias_${new Date().toISOString().split('T')[0]}.xlsx"`,
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      }
    })
  } catch (error) {
    console.error("Error generando Excel con ExcelJS:", error)
    return new NextResponse('Error generating excel', { status: 500 })
  }
}
