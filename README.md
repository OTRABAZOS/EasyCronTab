# EasyCronTab 🕒

Gestor de crontab para Linux con interfaz web y buscador en lenguaje natural. Sin comandos complejos.

---

## Requisitos

- **Node.js** 18 o superior  
- **Linux** (comando `crontab` disponible)  
- La app usa el crontab del **usuario que la ejecuta**

---

## Formas de usar EasyCronTab

| Forma | Descripción |
|-------|-------------|
| **Web (navegador)** | Clonas el repo, `npm start`, y abres http://localhost:3000 en el navegador. |
| **App de escritorio (sin instalar)** | `npm run app`: se abre una ventana de Electron. |
| **App instalada (.deb)** | Generas el `.deb`, lo instalas con `dpkg -i`, y abres EasyCronTab desde el menú de aplicaciones. |
| **AppImage (portable)** | Generas el AppImage y lo ejecutas sin instalar nada. |

La interfaz es la misma en todos los casos: buscador de tareas, gestión de crontab, PM2 y configuración.

---

## Método 1: Uso por web (navegador)

1. Clona el repositorio:
   ```bash
   git clone https://github.com/TU_USUARIO/EasyCronTab.git
   cd EasyCronTab
   ```
2. Instala dependencias:
   ```bash
   npm install
   ```
3. Arranca el servidor:
   ```bash
   npm start
   ```
4. Abre en el navegador: **http://localhost:3000**

> Cuando subas el proyecto a GitHub, sustituye `TU_USUARIO` por tu usuario o organización en la URL del `git clone`.

---

## Método 2: App de escritorio (Electron, sin instalar)

1. En la carpeta del proyecto (después de `git clone` y `npm install`):
   ```bash
   npm run app
   ```
2. Se abrirá una ventana de Electron con la misma interfaz; no hace falta abrir el navegador.

---

## Método 3: App instalada en el sistema (.deb)

Para tener EasyCronTab en el menú de aplicaciones (Ubuntu, Debian y derivados):

1. En la carpeta del proyecto:
   ```bash
   npm run build:deb
   ```
2. Instala el paquete generado:
   ```bash
   sudo dpkg -i dist/easycrontab_1.0.0_amd64.deb
   ```
3. Abre **EasyCronTab** desde el menú de aplicaciones (búscalo por nombre).
4. Si ya lo tenías instalado, reinstala el `.deb` para actualizar (por ejemplo el icono y la sección PM2).

---

## Método 4: AppImage (portable, sin instalar)

1. Genera el AppImage:
   ```bash
   npm run build:appimage
   ```
2. Dale permiso de ejecución y ejecútalo:
   ```bash
   chmod +x dist/EasyCronTab-1.0.0.AppImage
   ./dist/EasyCronTab-1.0.0.AppImage
   ```
3. Opcional: copia el AppImage a `~/.local/bin` o donde quieras para tenerlo en el PATH.

**Build completo** (generar .deb y AppImage a la vez):
```bash
npm run build
```
Los archivos quedan en la carpeta `dist/`.

---

## Cómo actualizar a una versión nueva

Cuando publiques mejoras en GitHub, los usuarios pueden actualizar así:

**Si usan el código (clonaron el repo y ejecutan con `npm start` o `npm run app`):**
```bash
cd EasyCronTab
git pull
npm install
```
Luego reinician el servidor o la app como de costumbre.

**Si instalaron el .deb o usan el AppImage:**  
Ve a la pestaña **Releases** del repositorio en GitHub, descarga la última versión (el `.deb` o el AppImage) y reinstálala:
- **.deb:** `sudo dpkg -i easycrontab_X.X.X_amd64.deb`
- **AppImage:** sustituye el archivo anterior por el nuevo y ejecútalo.

---

## Guía de uso (primeros pasos en la interfaz)

La interfaz tiene varias pestañas/secciones. Orden recomendado:

### 1. Configuración (opcional pero recomendado)

- Ve a **Configuración**.
- Pulsa **Buscar carpeta** y elige la carpeta donde tienes tus proyectos (repos con `package.json`).
- Pulsa **Guardar**.  
  Así podrás elegir proyectos y scripts desde **Gestionar tareas** y **PM2** sin escribir rutas a mano.

### 2. Crontab (tareas programadas)

- **Buscar tareas**: escribe en la barra de búsqueda (ej.: "backup", "diario", "próximas horas") para filtrar.
- **Ver todas**: en **Tareas por próxima ejecución** ves todas las tareas ordenadas por la próxima ejecución.
- **Añadir tarea**: en **Gestionar tareas** pulsa **Añadir tarea** (escribes comando y frecuencia) o **Añadir desde repositorio** (eliges proyecto y script de la lista, luego frecuencia).
- **Guardar**: después de editar, pulsa **Guardar crontab** para aplicar los cambios al sistema.

### 3. PM2 (procesos siempre en marcha)

- Ve a la pestaña **PM2**.
- Para **añadir un proceso** (ej. un servidor o `npm run start-all`):
  1. Pulsa **Añadir proceso**.
  2. Si hace falta, configura o cambia la **carpeta de repositorios** (la misma que en Configuración).
  3. Elige un **proyecto** en el desplegable.
  4. Elige el **script** a ejecutar (npm start, npm run start-all, etc.).
  5. Ajusta el **nombre del proceso** si quieres y pulsa **Arrancar con PM2**.
- Desde la lista puedes **Actualizar lista**, **Parar**, **Reiniciar** o **Eliminar** cada proceso.
- Pulsa **Guardar lista PM2** para persistir la lista en disco (equivalente a `pm2 save`); así, si has configurado `pm2 startup` una vez en la terminal, los procesos se restaurarán al reiniciar la máquina.

Los cambios en crontab reemplazan todo el crontab del usuario actual. Úsalo con cuidado en entornos delicados.

---

## Configuración (variables de entorno)

| Variable | Descripción | Por defecto |
|----------|-------------|-------------|
| `PORT`   | Puerto del servidor | `3000` |

Opcional: copia `.env.example` a `.env` y ajusta `PORT` si lo necesitas.

```bash
cp .env.example .env
# Edita .env si quieres otro puerto
npm start
```

Con la app instalada (.deb o AppImage), la configuración se guarda en `~/.config/easycrontab`.

---

## Características

- **Interfaz web**: edita el crontab en un editor de texto y guarda con un clic.
- **Buscador en lenguaje natural**: frases como "próximas horas", "backup", "diario" para filtrar tareas.
- **PM2**: gestiona procesos que deben estar siempre en marcha (servidores, `npm run start-all`, etc.): listar, arrancar, parar, reiniciar y eliminar desde la misma interfaz.
- **Diseño claro**: cards, estados ok/error, estilo panel de control.
- **Solo Linux**: usa `crontab -l` y `crontab -` del usuario que ejecuta la app.

---

## Estructura del proyecto

```
EasyCronTab/
├── app.js              # Servidor Express y rutas
├── config.js           # Puerto desde env
├── electron-main.js    # Proceso principal Electron (app de escritorio)
├── lib/
│   ├── crontab.js      # Lectura/escritura y parseo del crontab
│   ├── pm2.js          # API PM2 (listar, arrancar, parar, etc.)
│   └── search.js       # Búsqueda (Fuse.js + sinónimos)
├── views/              # Plantillas EJS
├── public/             # CSS y estáticos
├── build/              # Iconos para la app (icon.png, icons/)
├── scripts/            # build-linux-icons.js (genera iconos para .deb)
├── ROADMAP.md
├── package.json
└── README.md
```

---

## Licencia

MIT.
