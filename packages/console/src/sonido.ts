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
