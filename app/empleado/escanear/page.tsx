'use client'

import { useState, useRef, useEffect } from 'react'
import { Scanner } from '@yudiel/react-qr-scanner'
import { CheckCircle2, XCircle, LogOut, Camera } from 'lucide-react'
import { registrarAsistencia } from '@/actions/asistencia'
import { motion, AnimatePresence } from 'framer-motion'
import confetti from 'canvas-confetti'
import { logout } from '@/actions/auth'

export default function EscanearPage() {
  const [escaneando, setEscaneando] = useState(true)
  const [estado, setEstado] = useState<'idle' | 'processing' | 'success' | 'error'>('idle')
  const [mensaje, setMensaje] = useState('')
  const [tipoMarca, setTipoMarca] = useState<'ENTRADA' | 'SALIDA' | null>(null)
  
  // Ref para evitar múltiples escaneos por milisegundo (Closure problem)
  const isProcessingRef = useRef(false)

  const handleScan = async (detectedCodes: any[]) => {
    // Si ya estamos procesando un código, ignorar el resto de frames
    if (isProcessingRef.current || !detectedCodes || detectedCodes.length === 0) return
    
    isProcessingRef.current = true
    const qrData = detectedCodes[0].rawValue

    setEscaneando(false)
    setEstado('processing') // Mostrar spinner inmediatamente
    
    // Haptic feedback
    try { if (typeof window !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate([100]) } catch(e) {}

    try {
      // Usamos Promise.all para forzar un mínimo de 800ms mostrando el spinner "Verificando..."
      // Esto mejora la percepción visual (UX) para que el usuario vea que el sistema está trabajando,
      // evitando un parpadeo instantáneo si la conexión es muy rápida.
      const [res] = await Promise.all([
        registrarAsistencia(qrData),
        new Promise(resolve => setTimeout(resolve, 800))
      ])
      
      if (res.error) {
        try { if (typeof window !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate([300, 100, 300]) } catch(e) {}
        setEstado('error')
        setMensaje(res.error)
      } else {
        try { if (typeof window !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate([200, 100, 200]) } catch(e) {}
        setEstado('success')
        // @ts-ignore
        setTipoMarca(res.tipo)
        setMensaje(res.success || 'Operación exitosa')
        
        confetti({
          particleCount: 100,
          spread: 70,
          origin: { y: 0.6 },
          colors: res.tipo === 'ENTRADA' ? ['#10b981', '#ffffff'] : ['#3b82f6', '#ffffff']
        })
      }
    } catch (e) {
      setEstado('error')
      setMensaje('Error de red al registrar asistencia')
    }
  }

  const reintentar = () => {
    setEstado('idle')
    setMensaje('')
    setTipoMarca(null)
    isProcessingRef.current = false
    setEscaneando(true)
  }

  // Importar Loader2 para el spinner de procesamiento
  const processingScreen = (
    <div className="absolute inset-0 flex items-center justify-center p-6 bg-slate-900/95 backdrop-blur-sm z-20">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex flex-col items-center gap-6 text-center"
      >
        {/* Spinner con anillo de pulso */}
        <div className="relative">
          <div className="w-20 h-20 rounded-full border-4 border-slate-700 border-t-emerald-400 animate-spin" />
          <div className="absolute inset-0 rounded-full bg-emerald-400/10 animate-ping" />
        </div>
        <div>
          <p className="text-white font-bold text-xl tracking-wide">Verificando...</p>
          <p className="text-slate-400 text-sm mt-1">Conectando con el servidor</p>
        </div>
      </motion.div>
    </div>
  )

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col text-white">
      {/* Header (App-like) */}
      <header className="p-4 bg-slate-900 border-b border-slate-800 flex justify-between items-center z-20 shadow-sm relative overflow-hidden">
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

        <div className="flex items-center gap-2 relative z-10">
          <Camera className="w-5 h-5 text-emerald-400" />
          <h1 className="font-bold tracking-wide">App Trabajador</h1>
        </div>
        <form action={logout} className="relative z-10">
          <button 
            type="submit"
            className="p-2 text-slate-400 hover:text-white bg-slate-800 rounded-full transition-colors active:scale-95"
            title="Cerrar Sesión"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </form>
      </header>

      <main className="flex-1 flex flex-col relative overflow-hidden md:items-center md:justify-center md:p-6">
        {escaneando ? (
          <div className="absolute inset-0 md:relative md:w-full md:max-w-md md:max-h-[75vh] md:rounded-2xl md:overflow-hidden md:shadow-2xl md:ring-1 md:ring-white/10 flex flex-col z-10">
            <div className="relative flex-1 bg-black">
                <Scanner 
                  onScan={handleScan}
                  formats={['qr_code']}
                  components={{
                    zoom: true,
                    finder: false // Usamos nuestro overlay personalizado animado
                  }}
                  styles={{
                    container: { width: '100%', height: '100%' },
                    video: { objectFit: 'cover' }
                  }}
                />
              
              {/* Overlay Animado Tipo Escáner Láser */}
              <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none overflow-hidden">
                <div className="relative w-[280px] h-[280px] rounded-3xl shadow-[0_0_0_4000px_rgba(0,0,0,0.6)]">
                  {/* Esquinas animadas que laten */}
                  <motion.div
                    animate={{ scale: [1, 1.05, 1], opacity: [0.7, 1, 0.7] }}
                    transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                    className="absolute inset-0"
                  >
                    <div className="absolute top-0 left-0 w-12 h-12 border-t-4 border-l-4 border-emerald-400 rounded-tl-3xl" />
                    <div className="absolute top-0 right-0 w-12 h-12 border-t-4 border-r-4 border-emerald-400 rounded-tr-3xl" />
                    <div className="absolute bottom-0 left-0 w-12 h-12 border-b-4 border-l-4 border-emerald-400 rounded-bl-3xl" />
                    <div className="absolute bottom-0 right-0 w-12 h-12 border-b-4 border-r-4 border-emerald-400 rounded-br-3xl" />
                  </motion.div>

                  {/* Línea Láser que sube y baja */}
                  <motion.div
                    animate={{ top: ['0%', '98%', '0%'] }}
                    transition={{ duration: 2.5, repeat: Infinity, ease: "linear" }}
                    className="absolute left-3 right-3 h-0.5 bg-emerald-400 shadow-[0_0_12px_4px_rgba(52,211,153,0.6)]"
                  />
                </div>
              </div>
              <div className="absolute bottom-10 left-0 right-0 text-center px-4 z-20">
                <div className="bg-black/60 backdrop-blur-md text-white py-3 px-6 rounded-full inline-block border border-white/10 shadow-xl">
                  <p className="font-medium tracking-wide text-sm">Apunta al código QR del kiosco</p>
                </div>
              </div>
            </div>
          </div>
        ) : estado === 'processing' ? (
          processingScreen
        ) : (
          <div className="absolute inset-0 flex items-center justify-center p-6 bg-slate-900 z-20">
            <AnimatePresence>
              <motion.div 
                key="result"
                initial={{ opacity: 0, y: 20, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ type: 'spring', bounce: 0.3 }}
                className={`backdrop-blur-xl rounded-3xl p-8 max-w-sm w-full text-center shadow-2xl border transition-all ${
                  estado === 'success'
                    ? tipoMarca === 'ENTRADA'
                      ? 'bg-slate-800/90 border-emerald-500/20 shadow-emerald-500/10'
                      : 'bg-slate-800/90 border-blue-500/20 shadow-blue-500/10'
                    : 'bg-slate-800/90 border-red-500/20 shadow-red-500/10'
                }`}
              >
                {estado === 'success' ? (
                  <motion.div 
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', bounce: 0.5, delay: 0.1 }}
                    className={`w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-6 ring-4 ${
                      tipoMarca === 'ENTRADA' 
                        ? 'bg-emerald-500/20 text-emerald-400 ring-emerald-500/30 shadow-lg shadow-emerald-500/20' 
                        : 'bg-blue-500/20 text-blue-400 ring-blue-500/30 shadow-lg shadow-blue-500/20'
                    }`}
                  >
                    <CheckCircle2 className="w-14 h-14" />
                  </motion.div>
                ) : (
                  <motion.div 
                    initial={{ scale: 0, rotate: -90 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ type: 'spring', bounce: 0.5 }}
                    className="w-24 h-24 bg-red-500/20 text-red-400 rounded-full flex items-center justify-center mx-auto mb-6 ring-4 ring-red-500/30 shadow-lg shadow-red-500/20"
                  >
                    <XCircle className="w-14 h-14" />
                  </motion.div>
                )}
                
                <h2 className={`text-2xl font-bold mb-2 ${
                  estado === 'success'
                    ? tipoMarca === 'ENTRADA' ? 'text-emerald-300' : 'text-blue-300'
                    : 'text-red-300'
                }`}>
                  {estado === 'success' 
                    ? (tipoMarca === 'ENTRADA' ? '¡Entrada Registrada!' : '¡Salida Registrada!') 
                    : 'Escaneo Fallido'}
                </h2>
                
                <p className="text-slate-400 mb-8 text-sm leading-relaxed">{mensaje}</p>
                
                {estado === 'success' ? (
                  <form action={logout}>
                    <button
                      type="submit"
                      className="w-full flex justify-center items-center gap-2 bg-gradient-to-r from-slate-700 to-slate-600 hover:from-slate-600 hover:to-slate-500 text-white font-semibold py-4 rounded-xl transition-all duration-200 active:scale-95 shadow-lg hover:shadow-slate-900/50 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 focus:ring-offset-slate-800"
                    >
                      <LogOut className="w-5 h-5" />
                      Terminar y Cerrar Sesión
                    </button>
                  </form>
                ) : (
                  <button
                    onClick={reintentar}
                    className="w-full bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-white font-semibold py-4 rounded-xl transition-all duration-200 active:scale-95 shadow-lg shadow-blue-500/20 hover:shadow-blue-500/30 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-slate-800"
                  >
                    🔄 Reintentar Escaneo
                  </button>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        )}
      </main>
    </div>
  )
}
