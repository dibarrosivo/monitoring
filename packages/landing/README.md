# Landing de Falcón Seguridad Total

Página comercial ESTÁTICA (un solo `index.html`, sin dependencias). Copia el
esqueleto, el esquema y por ahora los colores del landing de TrueTracker
(`fleetview/apps/landing`): barra, héroe con la consola en marco de navegador,
ticker, tesis, sección de la central con dos teléfonos, la app en el bolsillo,
el control del panel como inset, escalera de planes, preguntas, cierre y
banda para instaladores. Ruta lateral que el scroll recorre (solo en
pantallas anchas) y tema claro/oscuro con botón.

## Media

`media/` (oscuro) y `media/claro/` (claro) son capturas REALES de la consola y
de la app con datos de demostración, tomadas de los harness de
`packages/console` (ver `capturar.sh`). Al cambiar la consola o la app, se
vuelven a generar con ese script. Faltan: `favicon-32.png`,
`apple-touch-icon.png` y `og-imagen.png` (1200x630).

## Contacto

El formulario hace `POST /api/contacto` (público, con honeypot y tope por IP)
a la API de la central: los pedidos quedan en la tabla `contacto_web` y se ven
en la consola. La landing tiene que servirse en el mismo dominio que la API o
Caddy tiene que hacer el proxy de `/api`.

## Pendientes antes de publicar

- Dominio: hoy `falconseguridadtotal.com` sirve el sitio actual (365). Decidir
  si la landing va a la raíz o a `monitoreo.falconseguridadtotal.com/`.
- Precios: la escalera de planes dice "hablemos"; poner precios cuando se
  carguen los planes reales en Cobros.
- Iconos y og:image.
- Colores propios de FST (por ahora, los de TrueTracker a pedido).
