/**
 * Empaqueta el puente como ejecutable único, con el empaquetador oficial de
 * Node 22 (SEA: Single Executable Application). Tres pasos:
 *   1. esbuild junta todo el TypeScript en un solo archivo CommonJS.
 *   2. node --experimental-sea-config genera el blob con ese archivo adentro.
 *   3. postject inyecta el blob en una copia del binario de Node.
 *
 * El .exe de Windows se arma desde Linux: se baja el node.exe oficial de la
 * misma versión y se le inyecta el blob.
 *
 * El módulo del puerto serie NO puede ir adentro (es código nativo compilado
 * por plataforma): viaja en node_modules al lado del ejecutable, que es donde
 * lo busca el puente al arrancar.
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, cpSync, existsSync, mkdirSync, rmSync, statSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = dirname(dirname(fileURLToPath(import.meta.url)));
const salida = join(raiz, 'dist');
const cache = join(raiz, 'empaquetado', '.cache');
const objetivos = process.argv.slice(2).length ? process.argv.slice(2) : ['win'];

const VERSION_NODE = process.version; // se usa la misma que compila, para no mezclar ABI
const FUSE = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2';

const PLATAFORMAS = {
  win: {
    archivo: 'puente.exe',
    url: (v) => `https://nodejs.org/dist/${v}/win-x64/node.exe`,
    binario: (destino) => destino,
  },
  linux: {
    archivo: 'puente',
    url: null, // se copia el node local
    binario: null,
  },
};

function ejecutar(comando, args, opciones = {}) {
  execFileSync(comando, args, { stdio: 'inherit', cwd: raiz, ...opciones });
}

rmSync(salida, { recursive: true, force: true });
mkdirSync(salida, { recursive: true });
mkdirSync(cache, { recursive: true });

// 1) Bundle del código propio (serialport queda afuera: es nativo)
console.log('→ Empaquetando el código…');
ejecutar('npx', [
  'esbuild',
  join(raiz, 'src/index.ts'),
  '--bundle',
  '--platform=node',
  '--target=node22',
  '--format=cjs',
  '--external:serialport',
  `--outfile=${join(salida, 'puente.cjs')}`,
]);

// 2) Blob de SEA
console.log('→ Generando el blob…');
const configSea = join(salida, 'sea-config.json');
writeFileSync(
  configSea,
  JSON.stringify({
    main: join(salida, 'puente.cjs'),
    output: join(salida, 'puente.blob'),
    disableExperimentalSEAWarning: true,
  }),
);
ejecutar(process.execPath, ['--experimental-sea-config', configSea]);

for (const objetivo of objetivos) {
  const plataforma = PLATAFORMAS[objetivo];
  if (!plataforma) throw new Error(`Objetivo desconocido: ${objetivo} (usar win o linux)`);

  const carpeta = join(salida, objetivo);
  mkdirSync(carpeta, { recursive: true });
  const ejecutable = join(carpeta, plataforma.archivo);

  // 3) Base: node.exe oficial para Windows, o el node local para Linux
  if (objetivo === 'win') {
    const nodeExe = join(cache, `node-${VERSION_NODE}-win-x64.exe`);
    if (!existsSync(nodeExe)) {
      console.log(`→ Descargando node.exe ${VERSION_NODE} para Windows…`);
      ejecutar('curl', ['-fsSL', '-o', nodeExe, plataforma.url(VERSION_NODE)]);
    }
    copyFileSync(nodeExe, ejecutable);
  } else {
    copyFileSync(process.execPath, ejecutable);
  }

  console.log(`→ Inyectando el blob en ${plataforma.archivo}…`);
  ejecutar('npx', [
    'postject',
    ejecutable,
    'NODE_SEA_BLOB',
    join(salida, 'puente.blob'),
    '--sentinel-fuse',
    FUSE,
  ]);
  if (objetivo === 'linux') ejecutar('chmod', ['+x', ejecutable]);

  // serialport viaja al lado: el puente lo busca junto al ejecutable
  for (const paquete of ['serialport', '@serialport', 'node-gyp-build', 'debug', 'ms']) {
    const desde = join(raiz, '../../node_modules', paquete);
    if (existsSync(desde)) cpSync(desde, join(carpeta, 'node_modules', paquete), { recursive: true });
  }

  copyFileSync(join(raiz, '.env.ejemplo'), join(carpeta, '.env.ejemplo'));
  copyFileSync(join(raiz, 'LEEME.txt'), join(carpeta, 'LEEME.txt'));
  // El monitor de ventana: muestra en vivo lo que entra y lo que sale (solo Windows)
  if (objetivo === 'win') {
    for (const archivo of ['monitor.ps1', 'monitor.cmd']) {
      copyFileSync(join(raiz, 'empaquetado', archivo), join(carpeta, archivo));
    }
  }

  const mb = (statSync(ejecutable).size / 1024 / 1024).toFixed(1);
  console.log(`✓ dist/${objetivo}/${plataforma.archivo} — ${mb} MB`);
  console.log(`  al lado: ${readdirSync(carpeta).filter((f) => f !== plataforma.archivo).join(', ')}`);
}

console.log('\nListo. Copiar la carpeta dist/win completa a la PC de la central.');
