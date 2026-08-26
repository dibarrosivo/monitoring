# Monitoring — Central de monitoreo de alarmas

Software de central de monitoreo: recibe señales de alarma de distintos transmisores, las normaliza y las convierte en una cola de trabajo para operadores, con gestión de clientes, sitios, paneles y zonas.

## Hardware soportado

| Origen | Vía | Estado |
| --- | --- | --- |
| Paneles Hikvision (AX Pro) | SIA DC-09 (ADM-CID) por TCP/UDP directo al servidor | ✅ Fase 1 |
| Tarjetas transmisoras EBM | Contact ID sobre IP (mismo listener DC-09) | ✅ Fase 1 (verificar framing real) |
| Receptor PIMA (RS-232) | Bridge serie→servidor en la PC Windows de la central | 🔜 Fase 2 (`apps/pima-bridge`) |

> Los paneles Hikvision deben configurarse en formato **ADM-CID sin cifrar** (el descifrado AES está pendiente). La marca de tiempo del panel se guarda como referencia; la hora canónica de los eventos es la de recepción en el servidor.

## Arquitectura

```
packages/
  shared/      Tipos canónicos + tabla Contact ID y clasificación
  protocols/   Parsers puros: SIA DC-09 (CRC, ACK/NAK), Contact ID, Sur-Gard
  db/          Esquema Drizzle + migraciones (PostgreSQL)
  engine/      Diario de señales, eventos, apertura de alarmas, vigilante de paneles silenciosos
  receiver/    Daemon: listeners TCP/UDP DC-09 → engine
  api/         Fastify: auth JWT, CRUD, cola de alarmas, WebSocket en tiempo real (todo bajo /api)
  console/     Consola de operador: React + Vite + Tailwind, tema oscuro, cola en vivo con sonido
tools/
  simulator/   Envía tramas DC-09 reales para probar sin hardware
```

Reglas de oro del receptor:
1. Toda trama cruda se persiste en `senal` **antes** de responder ACK (diario legal/auditoría).
2. Si la persistencia falla, se responde NAK y el panel reintenta.
3. El silencio también alarma: un panel supervisado sin señales por 1.5× su intervalo de prueba abre una alarma de sistema.
4. Una cuenta desconocida genera alarma para el operador (alguien transmite y nadie lo mira).

Supervisión de horarios (por panel, opcional): con un horario cargado, el sistema abre alarmas de
sistema ante **apertura tarde** (`HOR-AT`), **falta de cierre** (`HOR-SC`) y **apertura fuera de
horario** (`HOR-AF`, prioridad alta: alguien entró con código válido cuando el sitio debía estar
cerrado). Sin horario cargado no se supervisa.

## Desarrollo

```bash
npm install
docker compose up -d          # PostgreSQL local
npm run db:migrar             # aplica migraciones
npm run db:seed               # admin@monitoring.local / admin123 + cliente demo (cuenta 1234)

npm run receiver              # daemon receptor (DC-09 en :9999)
npm run api                   # API en :3000 (rutas bajo /api)
npm run console               # consola de operador (Vite, proxy /api → :3000)

# En otra terminal: disparar señales de prueba
npm run simulador -- escenario
npm run simulador -- robo --cuenta 1234 --zona 015
npm run simulador -- desconocida

npm test                      # pruebas de parsers y clasificación
npm run typecheck
```

## Flujo de trabajo

- Ramas: `dev` (trabajo diario) y `main` (**push a `main` = despliegue a producción**, siempre con confirmación previa).
- CI en GitHub Actions: typecheck + pruebas como compuerta obligatoria.
- Configuración de producción: `keys.json` en el VPS → genera `.env` en cada despliegue (mismo esquema que FleetView).
- El puerto DC-09 del receptor se expone directo en el VPS (los paneles hablan TCP/UDP crudo, no pasan por Cloudflare/Caddy); la consola y la API sí van detrás de Caddy + Cloudflare.
