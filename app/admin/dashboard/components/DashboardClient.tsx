'use client'

import { useActionState, useEffect, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { crearTrabajador, resetearDispositivo, eliminarTrabajador, editarTrabajador, guardarConfiguracion, crearAsistenciaManual } from '@/actions/admin'
import { Loader2, RefreshCcw, Smartphone, UserPlus, Pencil, Trash2, Settings, AlertTriangle, ChevronUp, ChevronDown, Clock, Eye, EyeOff, Search, PenSquare, Users } from 'lucide-react'
import { toast } from 'sonner'

// PORTAL CLIENTE PARA MODALES (Evita superposición de headers sticky o barras de navegación)
function ClientPortal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    setMounted(true)
  }, [])
  if (!mounted || typeof document === 'undefined') return null
  return createPortal(children, document.body)
}

// MODAL CONFIRMACION
function ConfirmModal({ isOpen, title, message, onConfirm, onCancel, confirmText, isDanger, isPending }: any) {
  if (!isOpen) return null;
  return (
    <ClientPortal>
      <div className="fixed inset-0 bg-black/60 z-[9999] flex items-center justify-center p-4 backdrop-blur-sm">
        <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 animate-in fade-in zoom-in-95 duration-200">
          <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-4 ${isDanger ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-600'}`}>
            <AlertTriangle className="w-6 h-6" />
          </div>
          <h3 className="font-bold text-xl text-gray-900 mb-2">{title}</h3>
          <p className="text-gray-600 text-sm mb-6 leading-relaxed">{message}</p>
          <div className="flex justify-end gap-3">
            <button 
              onClick={onCancel} 
              disabled={isPending}
              className="px-4 py-2 text-sm font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
            <button 
              onClick={onConfirm} 
              disabled={isPending}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-bold text-white rounded-xl transition-colors disabled:opacity-70 ${isDanger ? 'bg-red-600 hover:bg-red-700' : 'bg-amber-600 hover:bg-amber-700'}`}
            >
              {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              {confirmText}
            </button>
          </div>
        </div>
      </div>
    </ClientPortal>
  )
}

// MODAL DE EDICIÓN DE TRABAJADOR
function EditWorkerModal({ isOpen, worker, onClose, onSave, isPending }: {
  isOpen: boolean
  worker: { id: string; nombre: string; usuario: string; horarioEspecial?: string } | null
  onClose: () => void
  onSave: (nombre: string, horarioEspecial?: string) => void
  isPending: boolean
}) {
  const [nombre, setNombre] = useState('')
  const [horarioEspecial, setHorarioEspecial] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  // Rellenar campos cuando se abre el modal
  useEffect(() => {
    if (worker) {
      setNombre(worker.nombre)
      setHorarioEspecial(worker.horarioEspecial || '')
      setShowPassword(false)
    }
  }, [worker])

  if (!isOpen || !worker) return null

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!nombre.trim() || nombre.trim().length < 3) {
      toast.error('El nombre debe tener al menos 3 letras')
      return
    }
    onSave(nombre.trim(), horarioEspecial.trim())
  }

  return (
    <ClientPortal>
      <div className="fixed inset-0 bg-black/60 z-[9999] flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="bg-blue-100 text-blue-600 w-10 h-10 rounded-full flex items-center justify-center">
            <Pencil className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-xl text-gray-900">Editar Trabajador</h3>
            <p className="text-gray-500 text-sm">@{worker.usuario}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Nombre Completo */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Nombre Completo</label>
            <input
              type="text"
              value={nombre}
              onChange={e => setNombre(e.target.value)}
              required
              maxLength={50}
              minLength={3}
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 outline-none transition-all text-slate-800 font-medium hover:border-gray-300"
              placeholder="Ej. Juan Pérez Gómez"
            />
          </div>

          {/* Horario de Entrada Especial (Opcional) */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              Horario de Entrada Especial <span className="font-normal text-gray-400">— Opcional</span>
            </label>
            <input
              type="time"
              value={horarioEspecial}
              onChange={e => setHorarioEspecial(e.target.value)}
              className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 outline-none transition-all text-slate-800 font-medium hover:border-gray-300"
            />
            <p className="text-xs text-gray-400 mt-1 pl-1">
              Dejar vacío para que este trabajador use el horario general de la empresa.
            </p>
          </div>

          {/* Usuario — Solo lectura */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              Usuario (ID Corto) <span className="font-normal text-gray-400">— No editable</span>
            </label>
            <input
              type="text"
              value={worker.usuario}
              readOnly
              className="w-full px-4 py-3 bg-gray-100 border border-gray-200 rounded-xl text-gray-500 font-medium cursor-not-allowed select-none"
            />
          </div>

          {/* Nueva contraseña (opcional) */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              Nueva Contraseña <span className="font-normal text-gray-400">— Opcional</span>
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                name="newPassword"
                minLength={6}
                maxLength={50}
                className="w-full px-4 py-3 pr-12 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 outline-none transition-all text-slate-800 font-medium hover:border-gray-300"
                placeholder="Dejar vacío para no cambiarla"
              />
              <button
                type="button"
                onClick={() => setShowPassword(p => !p)}
                className="absolute inset-y-0 right-0 flex items-center pr-4 text-gray-400 hover:text-gray-600 transition-colors"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-1.5 pl-1">Si dejas esto vacío, la contraseña actual no cambiará.</p>
          </div>

          {/* Botones */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="px-5 py-2.5 text-sm font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="flex items-center gap-2 px-5 py-2.5 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors disabled:opacity-70 shadow-lg shadow-blue-500/20"
            >
              {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Guardar Cambios
            </button>
          </div>
        </form>
      </div>
    </div>
    </ClientPortal>
  )
}

// FORMULARIO DE CREACIÓN
export function CreateWorkerForm() {
  const [state, formAction, isPending] = useActionState(crearTrabajador, null)
  const [showPassword, setShowPassword] = useState(false)

  useEffect(() => {
    if (state?.error) {
      toast.error(state.error)
    } else if (state?.success) {
      toast.success(state.success)
      const form = document.getElementById('createWorkerForm') as HTMLFormElement;
      if (form) form.reset();
    }
  }, [state])

  return (
    <div className="bg-white/80 backdrop-blur-xl p-8 rounded-2xl shadow-xl border border-white/40 ring-1 ring-black/5">
      <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-100">
        <div className="bg-blue-500/10 p-3 rounded-xl text-blue-600">
          <UserPlus className="w-6 h-6" />
        </div>
        <h2 className="text-xl font-bold text-gray-800">Registrar Trabajador</h2>
      </div>

      <form id="createWorkerForm" action={formAction} className="space-y-5">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">Nombre Completo</label>
          <input 
            type="text" 
            name="nombre_completo" 
            required 
            maxLength={50}
            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 outline-none transition-all text-slate-800 font-medium"
            placeholder="Ej. Juan Pérez Gómez"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">Usuario (ID Corto)</label>
          <input 
            type="text" 
            name="usuario" 
            required 
            pattern="[a-zA-Z0-9_]+"
            maxLength={20}
            title="Solo letras, números y guión bajo. Sin espacios ni símbolos."
            onChange={(e) => {
              e.target.value = e.target.value.replace(/[^a-zA-Z0-9_]/g, '')
            }}
            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 outline-none transition-all text-slate-800 font-medium"
            placeholder="Ej. jperez (sin espacios)"
          />
        </div>

        {/* Contraseña con ojito */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">Contraseña</label>
          <div className="relative">
            <input 
              type={showPassword ? 'text' : 'password'}
              name="password" 
              required 
              minLength={6}
              maxLength={50}
              className="w-full px-4 py-3 pr-12 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 outline-none transition-all text-slate-800 font-medium"
              placeholder="Mínimo 6 caracteres"
            />
            <button
              type="button"
              onClick={() => setShowPassword(p => !p)}
              className="absolute inset-y-0 right-0 flex items-center pr-4 text-gray-400 hover:text-gray-600 transition-colors"
              tabIndex={-1}
            >
              {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Horario de Entrada Especial (Opcional) */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">
            Horario de Entrada Especial <span className="font-normal text-gray-400 text-xs">— Opcional</span>
          </label>
          <input 
            type="time" 
            name="horario_especial" 
            className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 outline-none transition-all text-slate-800 font-medium hover:border-gray-300"
          />
          <p className="text-xs text-gray-400 mt-1 pl-1">
            Dejar vacío para que use el horario general de la empresa.
          </p>
        </div>

        <button 
          type="submit" 
          disabled={isPending}
          className="w-full bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-white font-bold py-3.5 rounded-xl shadow-lg shadow-blue-500/30 transition-all active:scale-[0.98] disabled:opacity-70 flex justify-center mt-4"
        >
          {isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Crear Trabajador'}
        </button>
      </form>
    </div>
  )
}

// ACCIONES DE TRABAJADOR (Reset, Edit, Delete)
export function WorkerActions({ 
  id, 
  hasDevice, 
  currentName, 
  currentUsuario,
  currentHorarioEspecial
}: { 
  id: string, 
  hasDevice: boolean, 
  currentName: string, 
  currentUsuario: string,
  currentHorarioEspecial?: string
}) {
  const [isPending, startTransition] = useTransition()
  const [modalState, setModalState] = useState<{type: 'delete' | 'reset' | 'edit' | null}>({type: null})

  const handleEdit = (newName: string, newHorario?: string) => {
    if (!newName || (newName === currentName && newHorario === currentHorarioEspecial)) {
      setModalState({ type: null })
      return
    }
    startTransition(async () => {
      const res = await editarTrabajador(id, newName, newHorario)
      if (res.error) toast.error(res.error)
      if (res.success) {
        toast.success(res.success)
        setModalState({ type: null })
      }
    })
  }

  const handleDelete = () => {
    startTransition(async () => {
      const res = await eliminarTrabajador(id)
      if (res.error) toast.error(res.error)
      if (res.success) {
        toast.success(res.success)
        setModalState({type: null})
      }
    })
  }

  const handleReset = () => {
    startTransition(async () => {
      const res = await resetearDispositivo(id)
      if (res.error) toast.error(res.error)
      if (res.success) {
        toast.success(res.success)
        setModalState({type: null})
      }
    })
  }

  return (
    <>
      <div className="flex items-center gap-2 mt-2">
        {hasDevice ? (
          <button
            onClick={() => setModalState({type: 'reset'})}
            disabled={isPending}
            className="text-[11px] flex flex-1 items-center justify-center gap-1 px-2 py-1.5 rounded-lg font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 transition-colors disabled:opacity-50"
            title="Desvincular Dispositivo"
          >
            <RefreshCcw className="w-3 h-3" /> Desvincular
          </button>
        ) : (
          <span className="text-[11px] flex flex-1 items-center justify-center gap-1 font-medium text-gray-400 bg-gray-100 px-2 py-1.5 rounded-lg border border-gray-200">
            <Smartphone className="w-3 h-3" /> Sin equipo
          </span>
        )}
        
        <button 
          onClick={() => setModalState({type: 'edit'})}
          disabled={isPending}
          className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg border border-transparent hover:border-blue-200 transition-colors disabled:opacity-50"
          title="Editar Trabajador"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
        
        <button 
          onClick={() => setModalState({type: 'delete'})} 
          disabled={isPending}
          className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg border border-transparent hover:border-red-200 transition-colors disabled:opacity-50"
          title="Eliminar Trabajador"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Modal de edición */}
      <EditWorkerModal
        isOpen={modalState.type === 'edit'}
        worker={modalState.type === 'edit' ? { id, nombre: currentName, usuario: currentUsuario, horarioEspecial: currentHorarioEspecial } : null}
        onClose={() => setModalState({ type: null })}
        onSave={handleEdit}
        isPending={isPending}
      />

      <ConfirmModal 
        isOpen={modalState.type === 'delete'}
        title="Eliminar Trabajador"
        message={`¿Estás seguro de eliminar definitivamente a ${currentName}? Esta acción borrará también su historial de asistencias y no se puede deshacer.`}
        confirmText="Sí, eliminar"
        isDanger={true}
        isPending={isPending}
        onConfirm={handleDelete}
        onCancel={() => setModalState({type: null})}
      />

      <ConfirmModal 
        isOpen={modalState.type === 'reset'}
        title="Desvincular Dispositivo"
        message={`¿Desvincular el celular actual de ${currentName}? La próxima vez que inicie sesión, su nuevo celular quedará registrado como el equipo principal.`}
        confirmText="Desvincular"
        isDanger={false}
        isPending={isPending}
        onConfirm={handleReset}
        onCancel={() => setModalState({type: null})}
      />
    </>
  )
}

// COMPONENTE DE HORA ESTILO ALARMA
function CustomTimePicker({ value, onChange, disabled }: { value: string, onChange: (v: string) => void, disabled?: boolean }) {
  const [hourStr, minuteStr] = (value || '09:00').split(':')
  const hourNum = parseInt(hourStr || '9', 10)
  const minNum = parseInt(minuteStr || '0', 10)

  const [localHour, setLocalHour] = useState(String(hourNum).padStart(2, '0'))
  const [localMin, setLocalMin] = useState(String(minNum).padStart(2, '0'))

  useEffect(() => {
    setLocalHour(String(hourNum).padStart(2, '0'))
    setLocalMin(String(minNum).padStart(2, '0'))
  }, [hourNum, minNum])

  const handleHourChange = (delta: number) => {
    if (disabled) return
    let newHour = hourNum + delta
    if (newHour < 0) newHour = 23
    if (newHour > 23) newHour = 0
    onChange(`${String(newHour).padStart(2, '0')}:${String(minNum).padStart(2, '0')}`)
  }

  const handleMinuteChange = (delta: number) => {
    if (disabled) return
    let newMin = minNum + delta
    if (newMin < 0) newMin = 55
    if (newMin > 59) newMin = 0
    onChange(`${String(hourNum).padStart(2, '0')}:${String(newMin).padStart(2, '0')}`)
  }

  const onHourBlur = () => {
    let h = parseInt(localHour, 10)
    if (isNaN(h)) h = 0
    if (h > 23) h = 23
    if (h < 0) h = 0
    const formatted = String(h).padStart(2, '0')
    setLocalHour(formatted)
    if (formatted !== String(hourNum).padStart(2, '0')) {
      onChange(`${formatted}:${String(minNum).padStart(2, '0')}`)
    }
  }

  const onMinBlur = () => {
    let m = parseInt(localMin, 10)
    if (isNaN(m)) m = 0
    if (m > 59) m = 59
    if (m < 0) m = 0
    const formatted = String(m).padStart(2, '0')
    setLocalMin(formatted)
    if (formatted !== String(minNum).padStart(2, '0')) {
      onChange(`${String(hourNum).padStart(2, '0')}:${formatted}`)
    }
  }

  const inputClasses = "text-5xl font-black text-slate-800 w-20 h-16 text-center tabular-nums tracking-tighter bg-transparent outline-none focus:bg-white focus:ring-2 focus:ring-emerald-500 rounded-xl transition-all"

  return (
    <div className={`flex items-center justify-center gap-6 bg-slate-50 p-6 rounded-2xl border border-slate-200 shadow-inner ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>
      {/* HORAS */}
      <div className="flex flex-col items-center gap-3">
        <button onClick={() => handleHourChange(1)} className="p-2 hover:bg-slate-200 hover:text-emerald-600 rounded-full text-slate-400 transition-all active:scale-95 shadow-sm bg-white border border-slate-200">
          <ChevronUp className="w-5 h-5"/>
        </button>
        <input
          type="text"
          value={localHour}
          onChange={e => setLocalHour(e.target.value.replace(/\D/g, '').slice(0, 2))}
          onBlur={onHourBlur}
          disabled={disabled}
          className={inputClasses}
        />
        <button onClick={() => handleHourChange(-1)} className="p-2 hover:bg-slate-200 hover:text-emerald-600 rounded-full text-slate-400 transition-all active:scale-95 shadow-sm bg-white border border-slate-200">
          <ChevronDown className="w-5 h-5"/>
        </button>
      </div>

      {/* SEPARADOR */}
      <div className="text-4xl font-black text-slate-300 -mt-2 animate-pulse">:</div>

      {/* MINUTOS */}
      <div className="flex flex-col items-center gap-3">
        <button onClick={() => handleMinuteChange(5)} className="p-2 hover:bg-slate-200 hover:text-emerald-600 rounded-full text-slate-400 transition-all active:scale-95 shadow-sm bg-white border border-slate-200">
          <ChevronUp className="w-5 h-5"/>
        </button>
        <input
          type="text"
          value={localMin}
          onChange={e => setLocalMin(e.target.value.replace(/\D/g, '').slice(0, 2))}
          onBlur={onMinBlur}
          disabled={disabled}
          className={inputClasses}
        />
        <button onClick={() => handleMinuteChange(-5)} className="p-2 hover:bg-slate-200 hover:text-emerald-600 rounded-full text-slate-400 transition-all active:scale-95 shadow-sm bg-white border border-slate-200">
          <ChevronDown className="w-5 h-5"/>
        </button>
      </div>
    </div>
  )
}

// PANEL DE CONFIGURACIÓN
export function SettingsPanel({ initialConfig }: { initialConfig: any }) {
  const [config, setConfig] = useState(initialConfig)
  const [isPending, startTransition] = useTransition()
  const [pendingToggle, setPendingToggle] = useState<{key: string, value: boolean} | null>(null)
  const [showTolerancia, setShowTolerancia] = useState(false)
  const [localTolerancia, setLocalTolerancia] = useState<string>(String(config.toleranciaMinutos ?? 0))

  useEffect(() => {
    setLocalTolerancia(String(config.toleranciaMinutos ?? 0))
  }, [config.toleranciaMinutos])

  const commitTolerancia = () => {
    let val = parseInt(localTolerancia, 10)
    if (isNaN(val) || val < 0) val = 0
    if (val > 60) val = 60
    setLocalTolerancia(String(val))
    if (val !== (config.toleranciaMinutos ?? 0)) {
      applyToggle('toleranciaMinutos', val)
    }
  }

  const applyToggle = (key: string, value: boolean | string | number) => {
    const newConfig = { ...config, [key]: value }
    setConfig(newConfig)
    startTransition(async () => {
      const res = await guardarConfiguracion(newConfig)
      if (res.error) toast.error(res.error)
      if (res.success) toast.success(res.success)
    })
  }

  const handleToggle = (key: string, value: boolean) => {
    // Si se está intentando desactivar (value === false) una medida de seguridad, pedimos confirmación
    if (!value && (key === 'requerirLlaveNavegador' || key === 'requerirLlaveDispositivo' || key === 'requerirMismaRed')) {
      setPendingToggle({ key, value })
    } else {
      applyToggle(key, value)
    }
  }

  const confirmToggle = () => {
    if (pendingToggle) {
      applyToggle(pendingToggle.key, pendingToggle.value)
      setPendingToggle(null)
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden relative">
      <div className="p-4 bg-gray-50 border-b border-gray-200 flex items-center gap-2">
        <Settings className="w-5 h-5 text-gray-600" />
        <h3 className="font-bold text-gray-800">Configuración</h3>
      </div>
      
      <div className="p-5 space-y-5">
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1">
            <p className="font-semibold text-gray-800 text-sm">Llave Navegador</p>
            <p className="text-xs text-gray-500">Bloquea uso de múltiples navegadores</p>
          </div>
          <button 
            onClick={() => handleToggle('requerirLlaveNavegador', !config.requerirLlaveNavegador)}
            disabled={isPending}
            className={`flex-shrink-0 w-11 h-6 rounded-full transition-colors relative ${config.requerirLlaveNavegador ? 'bg-emerald-500' : 'bg-gray-300'}`}
          >
            <div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-transform ${config.requerirLlaveNavegador ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        </div>

        <div className="flex items-center justify-between gap-4">
          <div className="flex-1">
            <p className="font-semibold text-gray-800 text-sm">Llave Dispositivo</p>
            <p className="text-xs text-gray-500">Bloquea uso de múltiples dispositivos</p>
          </div>
          <button 
            onClick={() => handleToggle('requerirLlaveDispositivo', !config.requerirLlaveDispositivo)}
            disabled={isPending}
            className={`flex-shrink-0 w-11 h-6 rounded-full transition-colors relative ${config.requerirLlaveDispositivo ? 'bg-emerald-500' : 'bg-gray-300'}`}
          >
            <div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-transform ${config.requerirLlaveDispositivo ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        </div>

        <div className="flex items-center justify-between gap-4">
          <div className="flex-1">
            <p className="font-semibold text-gray-800 text-sm">Validar Red (WiFi)</p>
            <p className="text-xs text-gray-500">Exige que el trabajador use la misma red local que el Kiosco</p>
          </div>
          <button 
            onClick={() => handleToggle('requerirMismaRed', !config.requerirMismaRed)}
            disabled={isPending}
            className={`flex-shrink-0 w-11 h-6 rounded-full transition-colors relative ${config.requerirMismaRed ? 'bg-emerald-500' : 'bg-gray-300'}`}
          >
            <div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-transform ${config.requerirMismaRed ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        </div>

        <ConfirmModal 
          isOpen={pendingToggle !== null}
          title="¿Desactivar Seguridad?"
          message="Al desactivar esta llave, los trabajadores podrían compartir sus credenciales para marcar asistencia desde otro lugar o equipo. ¿Estás seguro de continuar?"
          confirmText="Sí, desactivar"
          isDanger={true}
          isPending={isPending}
          onConfirm={confirmToggle}
          onCancel={() => setPendingToggle(null)}
        />

        {(!config.requerirLlaveNavegador || !config.requerirLlaveDispositivo || !config.requerirMismaRed) && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700 font-medium">
              ¡Cuidado! Desactivar las llaves permite que los usuarios compartan credenciales para registrarse.
            </p>
          </div>
        )}

        <div className="pt-6 border-t border-gray-200">
          <div className="flex items-center gap-2 mb-4">
            <Clock className="w-5 h-5 text-emerald-600" />
            <span className="font-bold text-gray-800 text-sm">Hora límite de tardanza</span>
          </div>
          <p className="text-xs text-gray-500 mb-6 px-1">
            Las asistencias registradas después de esta hora se marcarán automáticamente en <strong className="text-red-500 font-bold">rojo</strong> en el panel central.
          </p>
          
          <CustomTimePicker 
            value={config.horaLimiteTardanza || '09:00'} 
            onChange={(val) => applyToggle('horaLimiteTardanza', val)}
            disabled={isPending}
          />

          {/* Desplegable de minutos de tolerancia con flecha / V grande y animación suave */}
          <div className="mt-4 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setShowTolerancia(!showTolerancia)}
              className="w-full flex items-center justify-between px-3.5 py-2.5 bg-slate-50 hover:bg-slate-100/90 border border-slate-200/80 rounded-xl transition-all text-left group cursor-pointer shadow-2xs"
            >
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-700">Minutos de tolerancia</span>
                {(config.toleranciaMinutos ?? 0) > 0 && (
                  <span className="text-[10px] font-extrabold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full border border-emerald-300">
                    +{config.toleranciaMinutos} min
                  </span>
                )}
              </div>
              <ChevronDown 
                className={`w-5 h-5 text-slate-400 group-hover:text-emerald-600 transition-transform duration-300 ease-in-out shrink-0 ${
                  showTolerancia ? 'rotate-180 text-emerald-600' : ''
                }`} 
              />
            </button>

            {/* Contenedor desplegable con animación suave */}
            <div 
              className={`grid transition-all duration-300 ease-in-out overflow-hidden ${
                showTolerancia ? 'grid-rows-[1fr] opacity-100 mt-2.5' : 'grid-rows-[0fr] opacity-0 mt-0'
              }`}
            >
              <div className="overflow-hidden space-y-2">
                <div className="flex items-center justify-center gap-2 bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 shadow-inner">
                  <span className="text-xs font-semibold text-slate-500">+</span>
                  <input 
                    type="text" 
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={localTolerancia}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/\D/g, '').slice(0, 2)
                      setLocalTolerancia(raw)
                    }}
                    onBlur={commitTolerancia}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.currentTarget.blur()
                      }
                    }}
                    disabled={isPending}
                    className="w-14 text-center font-bold text-slate-800 bg-white border border-slate-300 rounded-lg px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-emerald-500 transition-all shadow-sm"
                    placeholder="0"
                  />
                  <span className="text-xs font-semibold text-slate-600">minutos de tolerancia</span>
                </div>
                <p className="text-[11px] text-slate-400 text-center px-1">
                  Margen de gracia permitido antes de clasificar como tardanza.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export function DateFilter({ workerId }: { workerId?: string }) {
  const { useRouter, useSearchParams } = require('next/navigation')
  const { useState } = require('react')
  
  const searchParams = useSearchParams()
  const router = useRouter()
  
  const [desde, setDesde] = useState(searchParams.get('desde') || '')
  const [hasta, setHasta] = useState(searchParams.get('hasta') || '')

  const aplicarFiltro = () => {
    const params = new URLSearchParams(searchParams.toString())
    if (desde) params.set('desde', desde)
    else params.delete('desde')
    
    if (hasta) params.set('hasta', hasta)
    else params.delete('hasta')
    
    router.push(`?${params.toString()}`)
  }

  const limpiarFiltro = () => {
    setDesde('')
    setHasta('')
    const params = new URLSearchParams(searchParams.toString())
    params.delete('desde')
    params.delete('hasta')
    router.push(`?${params.toString()}`)
  }

  const setRango = (tipo: 'hoy' | 'semana' | 'mes') => {
    const curr = new Date()
    const getFormato = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
    
    let nuevoDesde = ''
    let nuevoHasta = getFormato(curr) // Hasta casi siempre es hoy
    
    if (tipo === 'hoy') {
      nuevoDesde = nuevoHasta
    } else if (tipo === 'semana') {
      const day = curr.getDay() || 7 // 1-7 (Lunes-Domingo)
      const first = new Date(curr)
      first.setDate(curr.getDate() - day + 1)
      nuevoDesde = getFormato(first)
    } else if (tipo === 'mes') {
      const first = new Date(curr.getFullYear(), curr.getMonth(), 1)
      nuevoDesde = getFormato(first)
    }

    setDesde(nuevoDesde)
    setHasta(nuevoHasta)

    const params = new URLSearchParams(searchParams.toString())
    params.set('desde', nuevoDesde)
    params.set('hasta', nuevoHasta)
    router.push(`?${params.toString()}`)
  }

  const exportUrl = `/api/exportar-asistencias?workerId=${workerId||''}&desde=${desde||''}&hasta=${hasta||''}`

  return (
    <div className="flex flex-col gap-2 w-full max-w-xl min-w-[340px]">
      <div className="flex flex-wrap items-center gap-2 text-sm bg-white border border-gray-200 rounded-lg p-1.5 shadow-sm min-h-[44px]">
        <div className="flex items-center gap-1">
          <span className="text-gray-500 text-xs font-medium pl-1">Desde:</span>
          <input 
            type="date" 
            value={desde} 
            onChange={e => setDesde(e.target.value)} 
            className="border border-gray-200 text-gray-700 rounded-md px-2 py-1 text-xs focus:ring-2 focus:ring-emerald-500 outline-none w-[115px]" 
          />
        </div>
        <div className="flex items-center gap-1">
          <span className="text-gray-500 text-xs font-medium pl-1">Hasta:</span>
          <input 
            type="date" 
            value={hasta} 
            onChange={e => setHasta(e.target.value)} 
            className="border border-gray-200 text-gray-700 rounded-md px-2 py-1 text-xs focus:ring-2 focus:ring-emerald-500 outline-none w-[115px]" 
          />
        </div>
        <button 
          onClick={aplicarFiltro} 
          className="bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold px-3 py-1.5 rounded-md transition-colors shrink-0"
        >
          Filtrar
        </button>
        <div className="w-[74px] shrink-0">
          {(desde || hasta) && (
            <button 
              onClick={limpiarFiltro} 
              className="text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 text-xs font-bold px-3 py-1.5 rounded-md transition-colors w-full"
            >
              Limpiar
            </button>
          )}
        </div>
      </div>
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider mr-1">Rápidos:</span>
          <button onClick={() => setRango('hoy')} className="text-xs bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 font-medium px-2 py-1 rounded transition-colors shadow-sm">Hoy</button>
          <button onClick={() => setRango('semana')} className="text-xs bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 font-medium px-2 py-1 rounded transition-colors shadow-sm">Esta Semana</button>
          <button onClick={() => setRango('mes')} className="text-xs bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 font-medium px-2 py-1 rounded transition-colors shadow-sm">Este Mes</button>
        </div>
        
        <a 
          href={exportUrl} 
          className="text-xs flex items-center gap-1 bg-emerald-100 text-emerald-800 px-3 py-1.5 rounded-lg hover:bg-emerald-200 font-bold transition-colors shadow-sm border border-emerald-200 h-7 whitespace-nowrap shrink-0"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
          Exportar Excel
        </a>
      </div>
    </div>
  )
}

// RELOJ SINCRONIZADO CON PERÚ (America/Lima)
export function AdminLiveClock() {
  const [hora, setHora] = useState<string>('')

  useEffect(() => {
    const updateTime = () => {
      const now = new Date()
      const formatted = new Intl.DateTimeFormat('es-PE', {
        timeZone: 'America/Lima',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
      }).format(now)
      setHora(formatted)
    }
    updateTime()
    const interval = setInterval(updateTime, 1000)
    return () => clearInterval(interval)
  }, [])

  if (!hora) return null

  return (
    <div className="flex items-center gap-2 bg-slate-800/90 border border-slate-700/80 px-3 py-1.5 rounded-lg text-xs font-mono text-emerald-400 shadow-inner select-none">
      <Clock className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
      <span className="font-semibold tabular-nums">{hora}</span>
      <span className="text-[10px] text-slate-400 font-sans uppercase font-bold">PE</span>
    </div>
  )
}

// AUTO-REFRESH DE TABLA DE ASISTENCIAS SIN PARPADEO
export function AutoRefreshTable({ intervalSeconds = 6 }: { intervalSeconds?: number }) {
  const router = useRouter()

  useEffect(() => {
    const interval = setInterval(() => {
      router.refresh()
    }, intervalSeconds * 1000)

    return () => clearInterval(interval)
  }, [router, intervalSeconds])

  return null
}

// AVATAR CIRCULAR CON INICIALES DE COLORES
export function AvatarCircle({ name, size = 'md' }: { name: string, size?: 'sm' | 'md' | 'lg' }) {
  const cleanName = (name || '').trim()
  const parts = cleanName.split(' ').filter(Boolean)
  const initials = parts.length > 1
    ? (parts[0][0] + parts[1][0]).toUpperCase()
    : (cleanName.slice(0, 2) || '?').toUpperCase()

  const colors = [
    'bg-emerald-100 text-emerald-700 border-emerald-300',
    'bg-blue-100 text-blue-700 border-blue-300',
    'bg-indigo-100 text-indigo-700 border-indigo-300',
    'bg-purple-100 text-purple-700 border-purple-300',
    'bg-rose-100 text-rose-700 border-rose-300',
    'bg-amber-100 text-amber-700 border-amber-300',
    'bg-teal-100 text-teal-700 border-teal-300',
    'bg-cyan-100 text-cyan-700 border-cyan-300'
  ]
  const hash = cleanName.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)
  const color = colors[hash % colors.length]

  const sizeClasses = {
    sm: 'w-6 h-6 text-[10px]',
    md: 'w-8 h-8 text-xs font-bold',
    lg: 'w-10 h-10 text-sm font-bold'
  }[size]

  return (
    <div className={`rounded-full flex items-center justify-center border select-none shrink-0 ${sizeClasses} ${color}`}>
      {initials}
    </div>
  )
}

// BUSCADOR EN TIEMPO REAL PARA LA LISTA DE TRABAJADORES
export function WorkerListSearch({ 
  trabajadores, 
  workerId, 
  horariosEspeciales = {} 
}: { 
  trabajadores: any[], 
  workerId?: string, 
  horariosEspeciales?: Record<string, string> 
}) {
  const [query, setQuery] = useState('')

  const filtrados = trabajadores.filter(t => {
    const q = query.toLowerCase()
    return (t.nombre_completo || '').toLowerCase().includes(q) || (t.usuario || '').toLowerCase().includes(q)
  })

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col max-h-[520px]">
      {/* Header con contador */}
      <div className="p-4 bg-gray-50 border-b border-gray-200 flex items-center gap-2 shrink-0">
        <Users className="w-5 h-5 text-gray-600" />
        <h3 className="font-bold text-gray-800 flex-1">Trabajadores</h3>
        <span className="bg-blue-100 text-blue-700 text-xs font-bold px-2 py-1 rounded-full">
          {filtrados.length} / {trabajadores.length}
        </span>
      </div>

      {/* Input de Búsqueda en Vivo */}
      <div className="p-2.5 border-b border-gray-100 bg-white shrink-0">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Buscar por nombre o usuario..."
            className="w-full pl-9 pr-7 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all text-slate-800 placeholder:text-gray-400"
          />
          {query && (
            <button 
              onClick={() => setQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Lista scrolleable */}
      <ul className="divide-y divide-gray-100 overflow-y-auto overflow-x-hidden scrollbar-thin flex-1">
        {filtrados.length === 0 ? (
          <li className="p-6 text-xs text-gray-400 text-center flex flex-col items-center gap-2">
            <span>No se encontraron trabajadores para &ldquo;{query}&rdquo;</span>
          </li>
        ) : (
          filtrados.map((t) => (
            <li 
              key={t.id} 
              className={`p-3.5 transition-colors ${
                workerId === t.id 
                  ? 'bg-blue-50/80 border-l-4 border-blue-500' 
                  : 'hover:bg-gray-50 border-l-4 border-transparent'
              }`}
            >
              <div className="flex flex-col gap-1.5">
                <Link href={`?workerId=${t.id}`} className="flex items-center gap-2.5">
                  <AvatarCircle name={t.nombre_completo} size="md" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-semibold text-gray-800 text-sm truncate block hover:text-blue-600 transition-colors cursor-pointer">
                        {t.nombre_completo}
                      </span>
                      {horariosEspeciales[t.id] && (
                        <span className="text-[10px] font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded shrink-0" title="Horario especial de entrada">
                          {horariosEspeciales[t.id]}
                        </span>
                      )}
                    </div>
                    <span className="block text-xs text-gray-500">@{t.usuario}</span>
                  </div>
                </Link>

                <WorkerActions 
                  id={t.id} 
                  hasDevice={!!(t.device_hash && t.device_uuid)} 
                  currentName={t.nombre_completo}
                  currentUsuario={t.usuario}
                  currentHorarioEspecial={horariosEspeciales[t.id]}
                />
              </div>
            </li>
          ))
        )}
      </ul>
    </div>
  )
}

// MODAL DE REGISTRO MANUAL DE ASISTENCIA POR EXCEPCIÓN
export function ManualAttendanceButton({ trabajadores }: { trabajadores: { id: string, nombre_completo: string, usuario: string }[] }) {
  const [isOpen, setIsOpen] = useState(false)
  const [state, formAction, isPending] = useActionState(crearAsistenciaManual, null)

  // Obtener fecha y hora actuales en Perú
  const getPeruCurrentDate = () => {
    const now = new Date()
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(now) // YYYY-MM-DD
  }

  const getPeruMinDate = () => {
    const d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(d)
  }

  const getPeruCurrentTime = () => {
    const now = new Date()
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Lima',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).formatToParts(now)
    const h = parts.find(p => p.type === 'hour')!.value.padStart(2, '0')
    const m = parts.find(p => p.type === 'minute')!.value.padStart(2, '0')
    return `${h}:${m}`
  }

  const [fecha, setFecha] = useState('')
  const [hora, setHora] = useState('')

  useEffect(() => {
    if (isOpen) {
      setFecha(getPeruCurrentDate())
      setHora(getPeruCurrentTime())
    }
  }, [isOpen])

  useEffect(() => {
    if (state?.error) {
      toast.error(state.error)
    } else if (state?.success) {
      toast.success(state.success)
      setIsOpen(false)
    }
  }, [state])

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-700/80 shadow-inner transition-all active:scale-95 shrink-0"
        title="Registrar asistencia manual por excepción"
      >
        <PenSquare className="w-3.5 h-3.5 text-amber-400" />
        <span>Registro Manual</span>
      </button>

      {isOpen && (
        <ClientPortal>
          <div className="fixed inset-0 bg-black/60 z-[9999] flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 animate-in fade-in zoom-in-95 duration-200">
              {/* Encabezado */}
              <div className="flex items-center gap-3 mb-5">
                <div className="bg-amber-100 text-amber-600 w-10 h-10 rounded-full flex items-center justify-center shrink-0">
                  <PenSquare className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-lg text-gray-900 leading-tight">Registro Manual de Asistencia</h3>
                  <p className="text-gray-500 text-xs">Por excepción (ej. batería agotada o daño de celular)</p>
                </div>
              </div>

              <form action={formAction} className="space-y-4">
                {/* Seleccionar Trabajador */}
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Trabajador</label>
                  <select
                    name="usuarioId"
                    required
                    className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500 outline-none text-sm text-slate-800 font-medium cursor-pointer"
                  >
                    <option value="">-- Selecciona un trabajador --</option>
                    {trabajadores.map(t => (
                      <option key={t.id} value={t.id}>
                        {t.nombre_completo} (@{t.usuario})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Fecha y Hora en una sola fila con límites estrictos */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Fecha</label>
                    <input
                      type="date"
                      name="fecha"
                      value={fecha}
                      max={getPeruCurrentDate()}
                      min={getPeruMinDate()}
                      onChange={e => setFecha(e.target.value)}
                      required
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500 outline-none text-xs text-slate-800 font-medium"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Hora</label>
                    <input
                      type="time"
                      name="hora"
                      value={hora}
                      onChange={e => setHora(e.target.value)}
                      required
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500 outline-none text-xs text-slate-800 font-medium"
                    />
                  </div>
                </div>

                {/* Motivo Estandarizado Fijo */}
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Motivo de Excepción</label>
                  <select
                    name="motivo"
                    required
                    className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500 outline-none text-xs text-slate-800 font-medium cursor-pointer"
                  >
                    <option value="bateria">🔋 Batería baja / Celular apagado</option>
                    <option value="olvido">🧠 Olvido involuntario de registro</option>
                    <option value="permiso">👔 Permiso de gerencia / Comisión</option>
                    <option value="equipo">📱 Equipo dañado / En reparación</option>
                    <option value="red">📶 Falla de red / Sin conexión a Internet</option>
                    <option value="otro">✍️ Otro motivo justificado</option>
                  </select>
                </div>

                {/* Detalle u Observación adicional */}
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Detalle u Observación <span className="font-normal text-gray-400">— Opcional</span>
                  </label>
                  <input
                    type="text"
                    name="detalle"
                    maxLength={60}
                    placeholder="Ej. Notificó previamente a gerencia, celular sin carga..."
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500 outline-none text-xs text-slate-800 font-medium placeholder:text-gray-400"
                  />
                </div>

                {/* Botones de acción */}
                <div className="flex justify-end gap-2.5 pt-3 border-t border-gray-100">
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    disabled={isPending}
                    className="px-4 py-2 text-xs font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isPending}
                    className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-xl transition-colors disabled:opacity-70 shadow-md shadow-amber-600/20"
                  >
                    {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    Guardar Registro Manual
                  </button>
                </div>
              </form>
            </div>
          </div>
        </ClientPortal>
      )}
    </>
  )
}


