/** Aviso sonoro de alarma nueva (WebAudio, sin archivos). Prioridad 1 suena más urgente. */
let contexto: AudioContext | null = null;

function tono(frecuencia: number, inicio: number, duracion: number) {
  if (!contexto) return;
  const oscilador = contexto.createOscillator();
  const ganancia = contexto.createGain();
  oscilador.type = 'square';
  oscilador.frequency.value = frecuencia;
  ganancia.gain.setValueAtTime(0.0001, contexto.currentTime + inicio);
  ganancia.gain.exponentialRampToValueAtTime(0.12, contexto.currentTime + inicio + 0.01);
  ganancia.gain.exponentialRampToValueAtTime(0.0001, contexto.currentTime + inicio + duracion);
  oscilador.connect(ganancia).connect(contexto.destination);
  oscilador.start(contexto.currentTime + inicio);
  oscilador.stop(contexto.currentTime + inicio + duracion + 0.05);
}

export function sonarAlarma(prioridad: number): void {
  try {
    contexto ??= new AudioContext();
    if (contexto.state === 'suspended') void contexto.resume();
    if (prioridad <= 1) {
      tono(1244, 0, 0.12);
      tono(1244, 0.18, 0.12);
      tono(1568, 0.36, 0.2);
    } else {
      tono(880, 0, 0.15);
      tono(1108, 0.2, 0.2);
    }
  } catch {
    // sin audio disponible: no es crítico
  }
}

/**
 * Sirena para las emergencias (prioridad 1): un tono que sube y baja de
 * frecuencia, como la sirena real, durante unos segundos. Sin archivos: se
 * sintetiza en el momento. Después de la sirena sigue el aviso insistente
 * normal hasta que alguien tome la alarma.
 */
export function sonarSirena(segundos = 4): void {
  try {
    contexto ??= new AudioContext();
    if (contexto.state === 'suspended') void contexto.resume();
    const inicio = contexto.currentTime;
    const oscilador = contexto.createOscillator();
    const ganancia = contexto.createGain();
    oscilador.type = 'sawtooth';
    // Barrido 600 → 1200 → 600 Hz, un ciclo por segundo
    const ciclo = 1;
    for (let t = 0; t <= segundos; t += ciclo / 2) {
      oscilador.frequency.linearRampToValueAtTime(t % ciclo === 0 ? 600 : 1200, inicio + t);
    }
    ganancia.gain.setValueAtTime(0.0001, inicio);
    ganancia.gain.exponentialRampToValueAtTime(0.16, inicio + 0.05);
    ganancia.gain.setValueAtTime(0.16, inicio + segundos - 0.3);
    ganancia.gain.exponentialRampToValueAtTime(0.0001, inicio + segundos);
    oscilador.connect(ganancia).connect(contexto.destination);
    oscilador.start(inicio);
    oscilador.stop(inicio + segundos + 0.05);
  } catch {
    // sin audio disponible: no es crítico
  }
}
