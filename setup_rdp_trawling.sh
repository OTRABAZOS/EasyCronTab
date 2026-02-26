#!/bin/bash
# Script de configuración RDP para usuario trawling
# Ejecutar con: sudo bash setup_rdp_trawling.sh

set -e

# Contraseña para el usuario trawling (cámbiala después si quieres)
TRAWLING_PASSWORD='TrawlRDP#2026!'

echo "=== Instalando xrdp y XFCE ==="
apt-get update
apt-get install -y xrdp xfce4 xfce4-goodies

echo "=== Configurando xrdp para usar XFCE ==="
cat > /etc/xrdp/startwm.sh << 'STARTWM'
#!/bin/sh
if [ -r /etc/default/locale ]; then
  . /etc/default/locale
  export LANG LANGUAGE
fi
startxfce4
STARTWM

echo "=== Creando usuario trawling ==="
if id "trawling" &>/dev/null; then
  echo "El usuario trawling ya existe. Actualizando contraseña..."
  echo "trawling:${TRAWLING_PASSWORD}" | chpasswd
else
  useradd -m -s /bin/bash trawling
  echo "trawling:${TRAWLING_PASSWORD}" | chpasswd
  echo "Usuario trawling creado."
fi

# Caducidad: 60 días desde hoy (puedes cambiar la fecha abajo)
# Formato: AAAA-MM-DD. Ejemplo: 2026-04-25
EXPIRE_DATE="2026-04-25"
chage -E "${EXPIRE_DATE}" trawling
echo "Cuenta trawling caduca el: ${EXPIRE_DATE}"

# Instalar xorgxrdp si existe (evita pantalla negra en Ubuntu 18+)
if apt-cache show xorgxrdp &>/dev/null; then
  apt-get install -y xorgxrdp 2>/dev/null || true
fi
if apt-cache show xorgxrdp-hwe-18.04 &>/dev/null; then
  apt-get install -y xorgxrdp-hwe-18.04 2>/dev/null || true
fi

echo "=== Activando xrdp ==="
systemctl enable xrdp
systemctl restart xrdp

# Firewall: permitir RDP (puerto 3389)
if command -v ufw &>/dev/null && ufw status 2>/dev/null | grep -q "Status: active"; then
  ufw allow 3389/tcp
  echo "Regla de firewall añadida para el puerto 3389."
fi

echo ""
echo "=============================================="
echo "  RDP configurado correctamente."
echo "=============================================="
echo "  Usuario para tu compañero: trawling"
echo "  Contraseña: ${TRAWLING_PASSWORD}"
echo "  (Pásale esta contraseña por un canal seguro)"
echo ""
echo "  Caducidad de la cuenta: ${EXPIRE_DATE}"
echo ""
echo "  IP de esta máquina: $(hostname -I | awk '{print $1}')"
echo "  Tu compañero se conecta con: Conexión a Escritorio Remoto (mstsc)"
echo "  o Remmina en Linux, a la IP de arriba, puerto 3389."
echo "=============================================="
