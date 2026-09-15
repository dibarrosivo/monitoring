/**
 * La voz de la app: síntesis de voz del propio dispositivo, en español.
 * Sin servidor, sin archivos, funciona sin conexión una vez cargada.
 *
 * Dos detalles que no son obvios:
 *  - En el teléfono, la voz solo suena si el usuario la activó con un toque
 *    (política de reproducción automática). Por eso hay un interruptor, y al
 *    encenderlo se dice una frase corta: ese toque es el permiso.
 *  - Las frases se encolan: si llegan dos eventos seguidos, se dicen los dos,
 *    no se pisan.
 */

const CLAVE = 'monitoring.voz';

export function vozDisponible(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

export function vozActiva(): boolean {
  try {
    return localStorage.getItem(CLAVE) === 'si';
  } catch {
    return false;
  }
}

export function guardarVoz(activa: boolean): void {
  try {
    localStorage.setItem(CLAVE, activa ? 'si' : 'no');
  } catch {
    // sin almacenamiento: queda solo para esta sesión
  }
}

/** La mejor voz en español que tenga el dispositivo. */
function elegirVoz(): SpeechSynthesisVoice | null {
  const voces = speechSynthesis.getVoices();
  const preferidas = ['es-VE', 'es-419', 'es-MX', 'es-US', 'es-ES', 'es'];
  for (const idioma of preferidas) {
    const voz = voces.find((v) => v.lang.toLowerCase().startsWith(idioma.toLowerCase()));
    if (voz) return voz;
  }
  return null;
}

export function hablar(texto: string, opciones: { urgente?: boolean } = {}): void {
  if (!vozDisponible()) return;
  try {
    const frase = new SpeechSynthesisUtterance(texto);
    frase.lang = 'es';
    const voz = elegirVoz();
    if (voz) frase.voice = voz;
    frase.rate = opciones.urgente ? 1.0 : 0.95;
    frase.pitch = 1;
    // Una emergencia no espera detrás de un aviso de batería
    if (opciones.urgente) speechSynthesis.cancel();
    speechSynthesis.speak(frase);
  } catch {
    // sin voz: no es crítico
  }
}

/** Precarga la lista de voces: en algunos navegadores llega vacía hasta el primer evento. */
export function prepararVoz(): void {
  if (!vozDisponible()) return;
  speechSynthesis.getVoices();
  speechSynthesis.onvoiceschanged = () => speechSynthesis.getVoices();
}
