# Developer Handbook — EasyCronTab

## Descripción del Proyecto

Gestor de crontab para Linux con interfaz web y buscador en lenguaje natural. Permite gestionar tareas cron y procesos PM2 sin necesidad de comandos. Disponible como app web (Express), app de escritorio (Electron), paquete .deb e AppImage.

## Stack Tecnológico

- **Lenguaje**: Node.js 18+
- **Framework web**: Express
- **Templates**: EJS
- **Desktop**: Electron (opcional)
- **Puerto**: 3000
- **Dependencias clave**: `cron-parser`, `fuse.js`, `pm2`, `express`, `ejs`, `electron-builder`

## Setup Local

### Requisitos previos
- Node.js 18+
- Linux (necesita el comando `crontab`)
- PM2 instalado globalmente (para gestión de procesos)

### Instalación

```bash
git clone git@github.com:OTRABAZOS/EasyCronTab.git
cd EasyCronTab
npm install
npm start
# Abrir http://localhost:3000
```

### Variables de Entorno

Copiar `.env.example` a `.env` para configurar:

| Variable | Descripción | Ejemplo |
|----------|-------------|---------|
| `PORT` | Puerto HTTP del servidor | `3000` |
| `REPOS_PATH` | Ruta por defecto de la carpeta de repos | `/home/usuario/proyectos` |
| `LOGS_PATH` | Ruta por defecto de la carpeta de logs | `/home/usuario/.local/share/easycrontab/logs` |
| `EASYCRONTAB_USER_DATA` | Override del directorio de `data/settings.json` | `/home/usuario/.config/easycrontab` |

No se requieren variables de entorno para uso básico. La app usa el crontab del usuario que la ejecuta.

### Comandos

```bash
npm start              # Servidor web (http://localhost:3000)
npm run app            # Electron desktop app
npm run build          # Build .deb y AppImage
npm run build:deb      # Solo paquete .deb
npm run build:appimage # Solo AppImage
npm run check:scripts  # Verifica permisos de scripts
```

## Arquitectura

```
Navegador (http://localhost:3000)
       ↓
Express (app.js)
       ↓
Lector/escritor de crontab (crontab -l / crontab -)
       ↓
PM2 API (pm2 list / pm2 restart / etc.)
```

**Entry points:**
- `app.js` — servidor Express con todas las rutas REST y helpers de negocio
- `electron-main.js` — wrapper Electron que lanza Express y abre BrowserWindow

**`lib/` — módulos puros Node:**
| Módulo | Responsabilidad |
|--------|----------------|
| `crontab.js` | Lee/escribe el crontab via `crontab -l` / `crontab -`; parsea líneas |
| `cronSchedule.js` | Convierte entre expresiones cron y texto legible en español; exporta `FRECUENCIAS` y `DIAS_SEMANA` |
| `nextRun.js` | Calcula próxima ejecución y slots diarios con `cron-parser` |
| `search.js` | Búsqueda fuzzy con Fuse.js + expansión de sinónimos en español |
| `pm2.js` | Envuelve la API programática de PM2 (connect/disconnect por llamada) |
| `settings.js` | Lee/escribe `data/settings.json` para `reposPath` y `logsPath` |
| `repos.js` | Lista subdirectorios con `package.json`; construye comandos `cd <dir> && npm run <script>` |
| `browse.js` | Navegador de filesystem restringido al home del usuario |
| `commandDescribe.js` | Heurística que convierte un comando shell en descripción corta |
| `xvfb.js` | Envuelve/desenvuelve comandos con `Xvfb` para display headless |

**Log management:**
Cada tarea tiene un log identificado por MD5 de `schedule + "\n" + rawCommand` (12 chars). Se almacena en `logsPath`. La app añade automáticamente `>> <logfile> 2>&1` al guardar en crontab.

**API surface (`app.js`):**
| Endpoint | Descripción |
|----------|-------------|
| `GET /api/jobs` | Lista jobs con schedule humanizado, próxima ejecución y estado de log |
| `POST /api/jobs` | Reemplaza el crontab completo con el array enviado |
| `POST /api/jobs/log` | Lee el tail del log de un job |
| `POST /api/jobs/run-now` | Ejecuta un job inmediatamente en background |
| `GET /api/jobs/day?date=YYYY-MM-DD` | Jobs agrupados en slots de 15 min para la vista diaria |
| `GET /api/search?q=...` | Búsqueda fuzzy sobre tareas |
| `GET/POST /api/settings` | Obtiene/actualiza `reposPath` |
| `GET /api/repos` | Lista repos y sus scripts npm |
| `GET /api/repos/command` | Construye el comando cron para un repo+script |
| `GET /api/browse` | Navegador de filesystem |
| `GET /api/pm2/list` | Lista procesos PM2 |
| `POST /api/pm2/{start,stop,restart,delete,save,log}` | Gestión de procesos PM2 |

> `POST /api/jobs` reemplaza el crontab **completo** del usuario que ejecuta la app. La app siempre corre como el usuario que la inicia y gestiona solo su crontab.

## Convenciones del Proyecto

- **Settings** persistidos en `data/settings.json` (o path indicado por `EASYCRONTAB_USER_DATA`). No se incluyen en el repo — cada instalación tiene los suyos.
- **Logs** en `~/.local/share/easycrontab/logs/` por defecto; configurable via settings o `LOGS_PATH`.
- **Vistas** en EJS (`views/`). El JS dinámico vive en `public/` y usa `fetch` para llamar a la API REST.
- **Sin test suite ni linter** configurados actualmente.

## Modos de Uso

| Modo | Comando | Descripción |
|------|---------|-------------|
| Web | `npm start` | Servidor Express, abrir en navegador |
| Electron | `npm run app` | Ventana de escritorio |
| Build .deb | `npm run build:deb` | Paquete instalable |
| Build AppImage | `npm run build:appimage` | Portable sin instalar |

## Despliegue en VM crawlers

En la VM se usa en modo web con acceso via tunnel SSH:

```bash
# En la VM
npm start  # arranca en localhost:3000

# En local, para acceder
gcloud compute ssh crawlers-vm --zone=europe-west1-b \
  --project=dataagencies -- -L 3000:localhost:3000
# Abrir http://localhost:3000 en el navegador local
```

### Git Flow — Feature Branch → Merge → Deploy (OBLIGATORIO)

**NUNCA commitear directamente a `main`** para cambios significativos (features, fixes, refactors). Commits triviales (typos, formato) pueden ir directo a main.

```bash
# 1. Crear branch desde main
git checkout main && git pull origin main
git checkout -b feat/nombre-descriptivo   # o fix/, docs/, refactor/

# 2. Trabajar y commitear en la branch
git add <archivos> && git commit -m "feat: descripción"

# 3. Push de la branch
git push -u origin feat/nombre-descriptivo

# 4. Merge a main
git checkout main && git pull origin main
git merge feat/nombre-descriptivo
git push origin main

# 5. Deploy en la VM
gcloud compute ssh crawlers-vm --zone=europe-west1-b \
  --project=dataagencies \
  --command="cd ~/crawlers/EasyCronTab && git pull origin main && npm ci && pm2 restart EasyCronTab"

# 6. Limpiar branch
git branch -d feat/nombre-descriptivo
git push origin --delete feat/nombre-descriptivo
```

**Convención de nombres de branch:**

| Tipo | Prefijo | Ejemplo |
|------|---------|---------|
| Feature nueva | `feat/` | `feat/browse-manual-path` |
| Bug fix | `fix/` | `fix/repos-path-readonly` |
| Documentación | `docs/` | `docs/update-handbook` |
| Refactor | `refactor/` | `refactor/settings-module` |

### Encadenamiento Wiki tras Commit/Deploy

Tras un commit significativo o deploy, la IA actualiza automáticamente (sin preguntar):

| Evento | Acciones |
|--------|----------|
| Commit trivial (typo, formato) | Nada |
| Commit significativo (feature, fix relevante, cambio de arquitectura) | Fragmento en `repo/changelogs/` + evaluar doc en `wiki/docs/` |
| Deploy / release | `CHANGELOG.md` raíz · fragmento en `repo/changelogs/` · fragmento en `wiki/changelogs/` · actualizar `wiki/docs/` · `node scripts/consolidar_fragmentos.js` en wiki |

## Modelo IA Recomendado

- **Complejidad del repo**: Baja-Media
- **Modelo de inicio recomendado**: Sonnet
- **Cuándo escalar a Opus**: Debugging de lógica compleja en crontab parsing, decisiones de arquitectura sobre PM2 integration, o refactors con impacto en múltiples módulos lib/
- **Lenguaje principal**: Node.js

## Documentación Relacionada

- Wiki: `wiki/docs/easycrontab.md` (si existe)
- ROADMAP: `docs/project/ROADMAP.md`
- Seguridad: `docs/shell/SECURITY_PROTOCOL.md`
- CHANGELOG: `CHANGELOG.md`
