import { describe, expect, it } from 'vitest';
import { esTraficoAjeno } from '../src/basura.js';

describe('esTraficoAjeno', () => {
  it('reconoce lo que mandan los escáneres', () => {
    expect(esTraficoAjeno('GET / HTTP/1.1\r\nHost: 37.60.234.77\r\n')).toBe('petición HTTP');
    expect(esTraficoAjeno('INVITE sip:37.60.234.77 SIP/2.0\r\n')).toBe('sondeo SIP');
    expect(esTraficoAjeno('*1\r\n$4\r\nINFO\r\n')).toBe('sondeo Redis');
    expect(esTraficoAjeno('SSH-2.0-OpenSSH_9.6\r\n')).toBe('sondeo SSH');
    expect(esTraficoAjeno(Buffer.from([0x16, 0x03, 0x01, 0x02, 0x00, 0x01]))).toBe('saludo TLS');
  });
  it('deja pasar lo que mandan los paneles y receptores', () => {
    expect(esTraficoAjeno('\n8A3B0019"ADM-CID"0001L0#7001[#7001|1130 01 003]\r')).toBeNull(); // DC-09
    expect(esTraficoAjeno('1061 7006 TH\x14')).toBeNull(); // PIMA
    expect(esTraficoAjeno('5011 187037E13001004\x14')).toBeNull(); // Sur-Gard
    expect(esTraficoAjeno('1011 @\x14')).toBeNull(); // latido Sur-Gard
    expect(esTraficoAjeno('')).toBeNull();
  });
});
