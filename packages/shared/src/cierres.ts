/**
 * Motivos predefinidos de cierre de una alarma, por desenlace.
 *
 * El texto libre no se puede contar. Con motivos fijos, la central puede ver
 * que una instalación da falsas alarmas por mascota, o que a un cliente nunca
 * se lo encuentra, y actuar sobre eso. Siempre queda "otro" con texto
 * obligatorio para lo que no encaja.
 */

export type DesenlaceAlarma = 'resuelta' | 'falsa_alarma' | 'escalada';

export interface MotivoCierre {
  clave: string;
  etiqueta: string;
}

export const MOTIVOS_CIERRE: Record<DesenlaceAlarma, MotivoCierre[]> = {
  resuelta: [
    { clave: 'verificado_ok', etiqueta: 'Verificado con el cliente, todo en orden' },
    { clave: 'movil_sin_novedad', etiqueta: 'Se envió móvil, sin novedad' },
    { clave: 'policia', etiqueta: 'Se avisó a la policía' },
    { clave: 'cliente_desarmo', etiqueta: 'El cliente desarmó o restauró' },
    { clave: 'tecnico', etiqueta: 'Avería derivada al técnico' },
    { clave: 'otro', etiqueta: 'Otro (detallar)' },
  ],
  falsa_alarma: [
    { clave: 'error_usuario', etiqueta: 'Error del usuario al operar el panel' },
    { clave: 'mascota_objeto', etiqueta: 'Mascota u objeto en movimiento' },
    { clave: 'falla_equipo', etiqueta: 'Falla del equipo o del sensor' },
    { clave: 'prueba', etiqueta: 'Prueba del instalador o del cliente' },
    { clave: 'clima_energia', etiqueta: 'Viento, tormenta o corte eléctrico' },
    { clave: 'otro', etiqueta: 'Otro (detallar)' },
  ],
  escalada: [
    { clave: 'supervisor', etiqueta: 'Derivada al supervisor' },
    { clave: 'policia', etiqueta: 'Derivada a la policía' },
    { clave: 'tecnico', etiqueta: 'Derivada al servicio técnico' },
    { clave: 'sin_respuesta', etiqueta: 'Nadie respondió, queda en seguimiento' },
    { clave: 'otro', etiqueta: 'Otro (detallar)' },
  ],
};

export const ETIQUETA_DESENLACE: Record<DesenlaceAlarma, string> = {
  resuelta: 'Resuelta',
  falsa_alarma: 'Falsa alarma',
  escalada: 'Escalada',
};

/** Etiqueta de un motivo, o null si no existe para ese desenlace. */
export function etiquetaMotivo(desenlace: DesenlaceAlarma, clave: string): string | null {
  return MOTIVOS_CIERRE[desenlace].find((m) => m.clave === clave)?.etiqueta ?? null;
}

/** Resultados posibles de una llamada a un contacto. */
export const RESULTADOS_LLAMADA = {
  atendio_ok: 'Atendió, palabra clave correcta',
  atendio_sin_clave: 'Atendió, sin verificar palabra clave',
  clave_incorrecta: 'Atendió, palabra clave INCORRECTA',
  no_atendio: 'No atendió',
  ocupado: 'Ocupado o cortó',
  numero_invalido: 'Número fuera de servicio',
} as const;

export type ResultadoLlamada = keyof typeof RESULTADOS_LLAMADA;
