# Guía: display virtual + ver por VNC

Resumen paso a paso: qué instalar, cómo levantar el "servidor" (display + VNC) y cómo conectarte con el cliente.

---

## Convención: proceso → display → puerto VNC

Cada proceso (env de PM2) usa **un display virtual** y **un puerto VNC** propio. Por convención:

| Proceso (env) | Display | Puerto VNC |
|---------------|---------|------------|
| c1            | :11     | 5911 (5900 + 11) |
| c2            | :12     | 5912 (5900 + 12) |
| c3            | :13     | 5913 |
| …             | :N      | 5900 + N |

Así **c1** se lanza al display **11**, **c2** al display **12**, etc. Para ver la sesión de c1 te conectas al puerto **5911**; para c2 al **5912**.

---

## Parte 1 – En el servidor (donde corre el crawler)

### 1.1 Instalar paquetes

```bash
sudo apt update
sudo apt install xvfb tigervnc-standalone-server tigervnc-viewer
```

- **xvfb**: display X virtual (para que Puppeteer tenga un DISPLAY aunque no haya escritorio).
- **tigervnc-standalone-server**: incluye `Xvnc`, un servidor X que además sirve por VNC (para poder ver ese display).
- **tigervnc-viewer**: cliente VNC para conectarte desde el mismo servidor (opcional si solo vas a conectar desde otra máquina).

### 1.2 Crear el display virtual y el servidor VNC

**Opción A – Xvfb + x11vnc** (solo si no estás en Wayland)

Instalar también x11vnc: `sudo apt install x11vnc`.

Un display por proceso. Ejemplo para **c1** (display :11, puerto 5911) y **c2** (display :12, puerto 5912):

**Sin contraseña:**
```bash
# Display para c1 → :11, VNC en 5911
Xvfb :11 -screen 0 1920x1080x24 &
DISPLAY=:11 x11vnc -display :11 -localhost -nopw -forever -bg -rfbport 5911

# Display para c2 → :12, VNC en 5912
Xvfb :12 -screen 0 1920x1080x24 &
DISPLAY=:12 x11vnc -display :12 -localhost -nopw -forever -bg -rfbport 5912

sleep 2
```

**Con contraseña:** crear contraseña y usar `-rfbauth ~/.vnc/passwd` en cada x11vnc (y `-rfbport 5911`, `5912`, etc.).

- **c1** usa **DISPLAY=:11**, cliente VNC: **puerto 5911**.
- **c2** usa **DISPLAY=:12**, cliente VNC: **puerto 5912**.

**Opción B – TigerVNC (Xvnc)** – recomendado en Wayland

Un Xvnc por proceso: cada uno crea su display y su puerto VNC. No hace falta Xvfb.

**Sin contraseña** (solo para uso local):

```bash
# c1 → display :11, puerto VNC 5911
Xvnc :11 -geometry 1920x1080 -depth 24 -rfbport 5911 -SecurityTypes None -AlwaysShared &

# c2 → display :12, puerto VNC 5912
Xvnc :12 -geometry 1920x1080 -depth 24 -rfbport 5912 -SecurityTypes None -AlwaysShared &

sleep 2
```

**Con contraseña** (recomendado si expones el servidor en la red):

1. Crear contraseña (solo la primera vez): `vncpasswd` → se guarda en `~/.vnc/passwd`.
2. Arrancar cada Xvnc con autenticación:
   ```bash
   Xvnc :11 -geometry 1920x1080 -depth 24 -rfbport 5911 -SecurityTypes VncAuth -AlwaysShared &
   Xvnc :12 -geometry 1920x1080 -depth 24 -rfbport 5912 -SecurityTypes VncAuth -AlwaysShared &
   sleep 2
   ```

- **c1** → **DISPLAY=:11**, cliente VNC: **puerto 5911**.
- **c2** → **DISPLAY=:12**, cliente VNC: **puerto 5912**.

### 1.3 Ejecutar el crawler en ese display

Cada proceso debe usar **su** display. En `ecosystem.config.js`:

- **env_c1** → `DISPLAY: ':11'`
- **env_c2** → `DISPLAY: ':12'`
- **env_c3** → `DISPLAY: ':13'`
- …

Ejemplo para arrancar c1 y c2 (tras haber levantado los Xvnc/Xvfb de los pasos anteriores):

```bash
pm2 start ecosystem.config.js --env c1
pm2 start ecosystem.config.js --env c2
```

O con DISPLAY en la shell (si no lo tienes en el ecosystem):

```bash
DISPLAY=:11 pm2 start ecosystem.config.js --env c1
DISPLAY=:12 pm2 start ecosystem.config.js --env c2
```

Así Puppeteer (c1) abre en el display **:11**, y c2 en el **:12**. No verás "Unable to open X display".

---

## Parte 2 – Cliente (para ver el display)

### 2.1 Instalar cliente VNC

**En el mismo servidor (Ubuntu):**

```bash
sudo apt install tigervnc-viewer
# o
sudo apt install remmina
```

**En Windows:** TightVNC Viewer, TigerVNC Viewer, RealVNC, etc.  
**En Mac:** RealVNC, TigerVNC, o "Screen Sharing" si el servidor es Mac.

### 2.2 Conectarse

Usa el **puerto VNC** del proceso que quieras ver:

| Ver proceso | Puerto VNC |
|-------------|------------|
| c1          | 5911       |
| c2          | 5912       |
| c3          | 5913       |

**Mismo equipo:**

```bash
vncviewer localhost:5911   # ver c1
vncviewer localhost:5912   # ver c2
```

**Desde otro equipo:**

```bash
vncviewer <IP_DEL_SERVIDOR>:5911
vncviewer <IP_DEL_SERVIDOR>:5912
```

En Remmina: nueva conexión VNC, host = IP o `localhost`, puerto = 5911 (c1), 5912 (c2), etc. Si configuraste contraseña, el visor la pedirá al conectar.

---

## Contraseña y seguridad

- **Solo uso local** (`localhost`): puedes usar `-SecurityTypes None` (sin contraseña).
- **Acceso por red**: usa siempre contraseña (TigerVNC: `vncpasswd` + `-SecurityTypes VncAuth`; x11vnc: `-storepasswd` + `-rfbauth`).
- **Recomendado para acceso remoto**: no exponer los puertos VNC directamente; mejor túnel SSH:
  ```bash
  ssh -L 5911:localhost:5911 -L 5912:localhost:5912 usuario@servidor
  ```
  Luego en tu máquina: `vncviewer localhost:5911` (c1) o `vncviewer localhost:5912` (c2). El tráfico VNC va cifrado por SSH.

---

## Resumen rápido (recomendado con Wayland)

Convención: **c1 → display :11 → puerto 5911**; **c2 → display :12 → puerto 5912**; etc.

**Sin contraseña (local):**

| Paso | Acción |
|------|--------|
| 1 | `sudo apt install xvfb tigervnc-standalone-server tigervnc-viewer` |
| 2 | `Xvnc :11 -geometry 1920x1080 -depth 24 -rfbport 5911 -SecurityTypes None -AlwaysShared &` (y lo mismo para :12/5912 si usas c2) |
| 3 | En **env_c1**: `DISPLAY: ':11'`; en **env_c2**: `DISPLAY: ':12'` |
| 4 | `pm2 start ecosystem.config.js --env c1` y `--env c2` según quieras |
| 5 | Cliente: `vncviewer localhost:5911` (ver c1) o `vncviewer localhost:5912` (ver c2) |

**Con contraseña (acceso por red):**

| Paso | Acción |
|------|--------|
| 1 | Instalar paquetes (igual que arriba) |
| 2 | `vncpasswd` → definir contraseña |
| 3 | `Xvnc :11 ... -rfbport 5911 -SecurityTypes VncAuth -AlwaysShared &` (y :12/5912 para c2) |
| 4 | En **env_c1** / **env_c2**: `DISPLAY: ':11'` y `DISPLAY: ':12'` |
| 5 | `pm2 start ecosystem.config.js --env c1` (y c2 si aplica) |
| 6 | Cliente: `vncviewer <IP>:5911` o `5912` → introducir la contraseña al conectar |

Cada proceso (c1, c2, …) tiene su **Xvnc** (display :11, :12, …) y su **puerto VNC** (5911, 5912, …). Al conectarte a ese puerto ves la ventana del navegador de ese proceso.
