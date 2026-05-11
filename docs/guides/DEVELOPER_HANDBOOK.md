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

### VS Code — Settings recomendados (Windows)

Si trabajas en Windows, añade estos settings a tu VS Code (`Ctrl+Shift+P` → "Open User Settings JSON"):

```json
"terminal.integrated.enablePersistentSessions": true,
"terminal.integrated.persistentSessionReviveProcess": "onExitAndWindowClose",
"window.restoreWindows": "all"
```

Sin estos settings, los terminales (nombres, iconos, colores) se pierden al cerrar VS Code o reiniciar el equipo.

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

### Git Flow: Feature Branch → Merge → Deploy (OBLIGATORIO)

> Aplica a **todos los repositorios** de Trawlingweb. Protocolo completo en `wiki/AI_CODE_INSTRUCTIONS.md` §9.4.

**NUNCA commitear directamente a `main`** para cambios significativos (features, fixes, refactors). Commits triviales (typos, formato) pueden ir directo a main.

#### Rama activa

- Rama de desarrollo: `vN` (versionado incremental — cada bloque de trabajo incrementa el número)
- Rama de producción: `main`

#### Flujo obligatorio

```bash
# 1. Determinar siguiente número de branch
git branch -r   # ver branches existentes → siguiente = max + 1

# 2. Crear branch desde main
git checkout main && git pull origin main
git checkout -b vN    # N = siguiente número

# 3. Trabajar y commitear en la branch
git add <archivos> && git commit -m "descripción del cambio"

# 4. Push de la branch
git push -u origin vN

# 5. Merge a main (siempre con --no-ff para conservar historial)
git checkout main && git pull origin main
git merge --no-ff vN -m "merge: vN → main — descripción breve"
git push origin main

# 6. Deploy en la VM
gcloud compute ssh crawlers-vm --zone=europe-west1-b \
  --project=dataagencies \
  --command="cd ~/crawlers/EasyCronTab && git pull origin main && npm ci && pm2 restart EasyCronTab"

# 7. Verificar deploy (health check, logs)

# 8. Notificación Telegram a Trawlingweb DEV Force (ver abajo)

# 9. NO borrar branches — se conservan todas como histórico y backup de rollback
```

#### Convención de nombres de branch

Se usa **versionado incremental** (`vN`). Cada nuevo bloque de trabajo incrementa el número:

| Repo tiene branches               | Siguiente branch     |
| --------------------------------- | -------------------- |
| ninguna                           | `v1`                 |
| `v3`, `v4`, `v5`                  | `v6`                 |
| `v12`, `v13`, `v14`, `v15`, `v16` | `v17`                |

La IA DEBE consultar las branches existentes (`git branch -r`) para determinar el siguiente número antes de crear una nueva.

#### Reglas

1. **NUNCA commitear directamente a `main`** para cambios significativos. Triviales (typos, formato) sí.
2. **La IA DEBE crear una branch `vN`** al iniciar trabajo significativo, sin preguntar.
3. **Merge a main solo cuando el trabajo está completo** y verificado.
4. **Merge siempre con `--no-ff`** para conservar el historial de la branch.
5. **Deploy solo desde `main`** — nunca desde una feature branch.
6. **NUNCA borrar branches mergeadas** — ni locales ni remotas. Se conservan todas como backup de rollback e histórico. Si un deploy falla, la branch anterior es el último estado estable conocido.
7. **Verificar que el deploy funciona** antes de considerar la branch mergeada con éxito.

### Notificación Telegram en cada deploy (OBLIGATORIA)

> Política completa: `wiki/AI_CODE_INSTRUCTIONS.md` §13.

- **Canal**: Trawlingweb DEV Force (`-1001719756002`)
- **Bot**: `@mochiAI_bot`
- **Formato** (igual para todos los deploys internos):

```
🚀 *EasyCronTab*
━━━━━━━━━━━━━━━━━━━━
📅 YYYY-MM-DD
🌿 Rama: vN → main
🖥️ VM: crawlers-vm

📦 Cambios:
• Cambio 1
• Cambio 2

⚙️ Ejecución: PM2: EasyCronTab puerto 3000

✅ Deploy completado
```

### Encadenamiento Wiki tras Commit/Deploy

Tras un commit significativo o deploy, la IA actualiza automáticamente (sin preguntar):

| Evento | Acciones |
|--------|----------|
| Commit trivial (typo, formato) | Nada |
| Commit significativo (feature, fix relevante, cambio de arquitectura) | Fragmento en `repo/changelogs/` + evaluar doc en `wiki/docs/` |
| Deploy / release | `CHANGELOG.md` raíz · fragmento en `repo/changelogs/` · fragmento en `wiki/changelogs/` · actualizar `wiki/docs/` · `node scripts/consolidar_fragmentos.js` en wiki |

## Modelo IA Recomendado

> Política completa: `wiki/AI_CODE_INSTRUCTIONS.md` §14. **Regla de oro: usar siempre el modelo más barato que pueda resolver la tarea. Cada token cuenta.**

- **Complejidad del repo**: Baja-Media — app Express + EJS + vanilla JS, módulos lib/ pequeños y bien delimitados
- **Modelo de inicio recomendado**: Sonnet para desarrollo estándar
- **Lenguaje principal**: Node.js (CommonJS vanilla)

### Cuándo usar cada modelo en este repo

| Modelo | Tareas típicas en `EasyCronTab` |
|--------|----------------------------------|
| **Haiku** (mínimo coste) | Crear fragmentos de changelog, formatear código, renombrar variables, generar boilerplate de vistas EJS, leer/resumir ficheros, buscar en código, corregir typos, aplicar el mismo cambio en N ficheros |
| **Sonnet** (estándar) | Implementar features de UI, añadir endpoints REST, escribir lógica de parsing de crontab dentro de `lib/`, fix de bugs en un módulo concreto, refactors dentro de un fichero |
| **Opus** (solo cuando es imprescindible) | Debugging de lógica compleja de crontab parsing con casos edge (DST, rangos, intersecciones), decisiones de arquitectura sobre integración PM2, refactors con impacto cross-módulo en `lib/`, auditoría del flujo de escritura del crontab (vector crítico de seguridad) |

### Delegación a subagentes (OBLIGATORIO)

Cuando la IA está en Sonnet u Opus y necesita hacer una tarea simple, **DEBE** lanzar un subagente con `model: "haiku"` en lugar de hacerla ella misma. Tareas típicas a delegar a Haiku desde Opus/Sonnet:

- Crear/editar fragmentos de changelog en `changelogs/` o `wiki/changelogs/`
- Búsquedas exhaustivas de código que no requieran razonamiento
- Resúmenes de ficheros largos
- Renombrar identificadores en N ficheros

### Antipatrones (PROHIBIDO)

- Usar Opus para crear changelogs, leer ficheros, formatear código o cualquier tarea que Haiku resuelva.
- Usar Sonnet para tareas mecánicas que Haiku resuelve igual de bien.
- Repetir contexto innecesario al modelo, generar explicaciones largas no solicitadas, reescribir código que no se pidió cambiar.

## Capa Conversacional Telegram + Claude (OBLIGATORIO si aplica)

> Política completa: `wiki/AI_CODE_INSTRUCTIONS.md` §17. Vigente desde 2026-05-11 con el release de `mochi_chatbot_llm` v2.0.0.

EasyCronTab es una UI local del crontab/PM2 del operador. Si en algún momento se quiere operar EasyCronTab desde el móvil — consultar qué jobs van a ejecutarse hoy, activar/desactivar un job, lanzar `run-now`, ver el log de la última ejecución, o gestionar procesos PM2 conversacionalmente — **NO construir la integración Telegram + Claude desde cero**. Existe una base reusable.

### Cuándo aplica en este repo

- Buscar tareas en lenguaje natural por chat (mismo flujo que `/api/search`) y devolverlas formateadas.
- Consultar la vista diaria (`/api/jobs/day`) desde el móvil — "¿qué cron toca hoy a partir de las 18:00?".
- Lanzar `run-now` sobre un job concreto sin abrir terminal ni navegador.
- Tail de logs de un job (`/api/jobs/log`) y resumen conversacional del último error.
- Estado de procesos PM2 (`/api/pm2/list`) y restart selectivo.

### Cómo proceder

1. **Consultar la doc canónica**: [`wiki/docs/mochi_chatbot_master.md`](../../../wiki/docs/mochi_chatbot_master.md) — describe la versión `mochi-chatbot-llm` v2+.
2. **Clonar la base**: repo `trawlingweb/mochi_chatbot_master`, rama estable (`v10` o `main`). Cada bot vive en su propio clon (`/srv/bots/<nombre>/` en la VM), con su `.env` y su `src/prompts/<nombre>.md`.
3. **Atajo**: lanzar el slash command global `/user:create-mochi-bot <nombre>` desde Claude Code; automatiza clone, scaffold del prompt y recordatorios de configuración.
4. **Procedimiento detallado**: `docs/ADD_NEW_BOT.md` dentro del propio repo `mochi_chatbot_master`.

### Reglas duras

- **Default Haiku 4.5**. Escalado a Sonnet 4.6 SOLO cuando el usuario escribe `/sonnet`, `usa sonnet` o `modelo grande`. **No introducir routing automático** "Haiku para fácil, Sonnet para difícil" (incidente OpenClaw 2026-05-10).
- **Un bot por repo, un token Telegram por bot, un proceso PM2 por bot.** No multiplexar varios contextos en un solo bot.
- **`.env` siempre fuera del control de versión.** Verificar `git status` antes de commits grandes en cualquier clon.
- **`src/prompts/<nombre>.md`** es el sitio para personalizar el bot. Si necesita ejecutar acciones críticas (modificar crontab, `pm2 restart`, `run-now`), envolverlas en tools controladas en `src/IntentRouter.js`. Recordar que `POST /api/jobs` reemplaza el crontab completo — la tool debe validar antes de escribir.

### Qué NO hacer

- No crear desde cero una nueva integración Telegram + Claude en este repo. Si la base no cubre un caso, abrir PR a `mochi_chatbot_master` en vez de un fork divergente.
- No mezclar varios bots en un solo proceso "multi-tenant".
- No commitear el `.env` de ningún clon.
- No exponer escritura de crontab arbitraria al bot sin confirmación humana — el ataque más fácil contra EasyCronTab es inyectar un cron malicioso.

---

## Documentación Relacionada

- Wiki: `wiki/docs/easycrontab.md` (si existe)
- ROADMAP: `docs/project/ROADMAP.md`
- Seguridad: `docs/shell/SECURITY_PROTOCOL.md`
- CHANGELOG: `CHANGELOG.md`
