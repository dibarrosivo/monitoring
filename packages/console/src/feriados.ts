/**
 * Feriados nacionales de Venezuela para un año. Los fijos son los de la Ley
 * de Fiestas Nacionales; Carnaval y Semana Santa se calculan a partir de la
 * Pascua (lunes y martes de Carnaval, jueves y viernes santos). Los regionales
 * y bancarios se agregan a mano desde el calendario.
 */
export interface FeriadoCalculado {
  fecha: string;
  descripcion: string;
}

/** Domingo de Pascua (algoritmo de Meeus/Jones/Butcher, calendario gregoriano). */
export function domingoDePascua(anio: number): Date {
  const a = anio % 19;
  const b = Math.floor(anio / 100);
  const c = anio % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(anio, mes - 1, dia));
}

function iso(fecha: Date): string {
  return fecha.toISOString().slice(0, 10);
}

function masDias(fecha: Date, dias: number): Date {
  return new Date(fecha.getTime() + dias * 86_400_000);
}

export function feriadosVenezuela(anio: number): FeriadoCalculado[] {
  const pascua = domingoDePascua(anio);
  const fijos: [string, string][] = [
    ['01-01', 'Año Nuevo'],
    ['04-19', 'Declaración de la Independencia'],
    ['05-01', 'Día del Trabajador'],
    ['06-24', 'Batalla de Carabobo'],
    ['07-05', 'Día de la Independencia'],
    ['07-24', 'Natalicio del Libertador'],
    ['10-12', 'Día de la Resistencia Indígena'],
    ['12-24', 'Nochebuena'],
    ['12-25', 'Navidad'],
    ['12-31', 'Fin de año'],
  ];
  const lista: FeriadoCalculado[] = [
    { fecha: iso(masDias(pascua, -48)), descripcion: 'Lunes de Carnaval' },
    { fecha: iso(masDias(pascua, -47)), descripcion: 'Martes de Carnaval' },
    { fecha: iso(masDias(pascua, -3)), descripcion: 'Jueves Santo' },
    { fecha: iso(masDias(pascua, -2)), descripcion: 'Viernes Santo' },
    ...fijos.map(([md, descripcion]) => ({ fecha: `${anio}-${md}`, descripcion })),
  ];
  return lista.sort((x, y) => x.fecha.localeCompare(y.fecha));
}
