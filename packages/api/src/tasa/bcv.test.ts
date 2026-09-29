import { describe, expect, it } from 'vitest';
import { interpretarBcv, saltoCreible } from './bcv.js';

/** Recorte real de la portada del BCV (25/09/2026): el euro va antes que el dólar y la fecha después. */
const PORTADA = `
<div id="euro" class="col-sm-12 col-xs-12">
<div class="col-sm-6 col-xs-6 centrado textp"><strong class="strong-tb"> 972,64867700</strong> </div>
</div>
<div id="dolar" class="col-sm-12 col-xs-12 ">
	<div class="field-content">
  		<div class="row recuadrotsmc">
			<div class="col-sm-6 col-xs-6">
  			<img src="/sites/default/files/dollar-04_2.png" class="icono_bss_blanco1">
  		        <span> USD</span>	 </div>
                         <div class="col-sm-6 col-xs-6 centrado textp"> <strong class="strong-tb">855,66250000</strong>  </div>
	        </div>
        </div>
</div>
          <div class="pull-right dinpro center">
Fecha Valor: <span class="date-display-single" property="dc:date" datatype="xsd:dateTime" content="2026-09-25T00:00:00-04:00">Viernes, 25 Septiembre  2026</span>
<hr>
</div>`;

describe('interpretarBcv', () => {
  it('saca el dólar (no el euro) y la fecha de valor', () => {
    expect(interpretarBcv(PORTADA)).toEqual({ valor: 855.6625, fechaValor: '2026-09-25' });
  });
  it('acepta separador de miles y redondea a 4 decimales', () => {
    const html = PORTADA.replace('855,66250000', '1.234,56789012');
    expect(interpretarBcv(html)?.valor).toBe(1234.5679);
  });
  it('sin el bloque del dólar o sin fecha no inventa nada', () => {
    expect(interpretarBcv('<html></html>')).toBeNull();
    expect(interpretarBcv(PORTADA.replace(/Fecha Valor:[\s\S]*$/, ''))).toBeNull();
  });
});

describe('saltoCreible', () => {
  it('la primera lectura siempre vale; después, hasta 25 % de cambio', () => {
    expect(saltoCreible(855, null)).toBe(true);
    expect(saltoCreible(900, 855)).toBe(true);
    expect(saltoCreible(2000, 855)).toBe(false);
    expect(saltoCreible(85.5, 855)).toBe(false);
  });
});
