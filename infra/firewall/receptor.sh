#!/usr/bin/env bash
#
# Cortafuegos de los puertos del receptor. Docker publica los puertos por
# encima de ufw, así que las reglas van en la cadena DOCKER-USER, que es la
# que Docker respeta. Se aplica al arrancar (ver receptor-firewall.service)
# y se puede volver a correr a mano: limpia y vuelve a cargar.
#
#   9999  SIA DC-09 (Hikvision): abierto, los paneles salen por SIM con IP variable
#   10050 puente PIMA crudo: solo desde la central
#   10060 Sur-Gard (EBS): solo desde el OSM de la central
#
set -euo pipefail
IFAZ=${IFAZ:-eth0}
CENTRAL=${CENTRAL:-156.67.31.152}

iptables -N DOCKER-USER 2>/dev/null || true
iptables -F DOCKER-USER
for puerto in 10050 10060; do
  iptables -A DOCKER-USER -i "$IFAZ" -p tcp --dport "$puerto" -s "$CENTRAL" -j RETURN
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
echo "Reglas cargadas: 10050 y 10060 solo desde $CENTRAL por $IFAZ"
