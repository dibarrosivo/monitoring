#!/usr/bin/env bash
#
# Cortafuegos de los puertos del receptor. Docker publica los puertos por
# encima de ufw, así que las reglas van en la cadena DOCKER-USER, que es la
# que Docker respeta. Se aplica al arrancar (ver receptor-firewall.service)
# y se puede volver a correr a mano: limpia y vuelve a cargar.
#
#   9999  SIA DC-09 (Hikvision): abierto, los paneles salen por SIM con IP variable
#   10050 puente PIMA crudo: cerrado desde internet
#   10060 Sur-Gard (EBS): cerrado desde internet
#
# Hasta el 02-11-2026 10050 y 10060 aceptaban solo al servidor Windows de la
# central (156.67.31.152). Ese servidor se dio de baja a fines de octubre y su
# IP pudo pasar a otro cliente de Contabo, que habría podido meter señales
# falsas. Hoy nadie de afuera los usa: PIMA entra por el puente (HTTPS) y EBS
# por el OSM propio, que entrega desde adentro del servidor (no pasa por eth0).
set -euo pipefail
IFAZ=${IFAZ:-eth0}

iptables -N DOCKER-USER 2>/dev/null || true
iptables -F DOCKER-USER
for puerto in 10050 10060; do
  iptables -A DOCKER-USER -i "$IFAZ" -p tcp --dport "$puerto" -j DROP
done
iptables -A DOCKER-USER -j RETURN

# Por IPv6 no habla nadie legítimo con esos puertos
if command -v ip6tables >/dev/null; then
  ip6tables -N DOCKER-USER 2>/dev/null || true
  ip6tables -F DOCKER-USER
  for puerto in 10050 10060; do
    ip6tables -A DOCKER-USER -i "$IFAZ" -p tcp --dport "$puerto" -j DROP
  done
  ip6tables -A DOCKER-USER -j RETURN
fi
echo "Reglas cargadas: 10050 y 10060 cerrados desde internet ($IFAZ)"
