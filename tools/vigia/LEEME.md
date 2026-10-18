# Vigía entre servidores

Cada servidor mira al otro una vez por minuto y avisa por **FST Alarma** si se
cae. Nació del 18-10-2026: Contabo apagó los dos servidores y nadie se enteró,
porque lo que avisa vivía en el mismo servidor que se apagó.

| Corre en | Vigila | Avisa a | Canal |
|---|---|---|---|
| TrueTracker (169.58.22.24) | la central FST: `/api/salud` y DC-09 `:9999` | todo el personal de la central | alarmas (sirena) |
| Central FST (37.60.234.77) | TrueTracker: `/api/salud` y Teltonika `:5027` | administradores | alarmas |

- Avisa a la **tercera** falla seguida (3 min), recuerda **cada hora** y avisa la vuelta con la duración.
- Los teléfonos salen de la central (`GET /api/vigia/destinos`, clave `VIGIA_CLAVE` en el `.env` de la central) y se guardan en `estado.json`: si la caída es de la central, se usa la lista guardada.
- **No cubre que se caigan los dos a la vez** (como el 18-10). Para eso: un servicio de afuera de Contabo (UptimeRobot o similar).

## Instalar (en cada servidor)

```bash
mkdir -p /opt/vigia && chmod 700 /opt/vigia
cp vigia.mjs /opt/vigia/
cp vigia.service vigia.timer /etc/systemd/system/
# /opt/vigia/vigia.env (600) — ver los ejemplos de abajo
# /opt/vigia/firebase.json (600) — la cuenta de servicio de FST (/opt/monitoring/secretos/firebase.json)
docker pull node:22-alpine
systemctl daemon-reload && systemctl enable --now vigia.timer
journalctl -u vigia -f        # qué hace en cada vuelta
cat /opt/vigia/estado.json    # último resultado, fallas seguidas, teléfonos guardados
```

`vigia.env` en TrueTracker (vigila la central):

```
OBJETIVO=Central FST
FEMENINO=si
CHEQUEOS=https://monitoreo.falconseguridadtotal.com/api/salud,tcp:monitoreo.falconseguridadtotal.com:9999
DESTINOS_URL=https://monitoreo.falconseguridadtotal.com/api/vigia/destinos
DESTINOS_CLAVE=<VIGIA_CLAVE>
ROLES=admin,supervisor,operador
CANAL=alarmas
FIREBASE_CREDENCIALES=/vigia/firebase.json
ESTADO=/vigia/estado.json
```

`vigia.env` en la central (vigila TrueTracker; `app.truetracker.app` pasa por
Cloudflare, así que el puerto de los equipos se mira por IP):

```
OBJETIVO=TrueTracker
CHEQUEOS=https://app.truetracker.app/api/salud,tcp:169.58.22.24:5027
DESTINOS_URL=https://monitoreo.falconseguridadtotal.com/api/vigia/destinos
DESTINOS_CLAVE=<VIGIA_CLAVE>
ROLES=admin
CANAL=alarmas
FIREBASE_CREDENCIALES=/vigia/firebase.json
ESTADO=/vigia/estado.json
```

Pruebas de la lógica: `node --test tools/vigia/vigia.test.mjs`.
