# EasyCronTab 🕒

Gestor de crontab para Linux con interfaz web y buscador en lenguaje natural. Sin comandos complejos.

---

## Requisitos

- **Node.js** 18 o superior  
- **Linux** (comando `crontab` disponible)  
- La app usa el crontab del **usuario que la ejecuta**

---

## Uso rápido (desde GitHub)

Clona el repositorio, instala dependencias y arranca:

```bash
git clone https://github.com/TU_USUARIO/EasyCronTab.git
cd EasyCronTab
npm install
npm start
```

Abre en el navegador: **http://localhost:3000**

> Cuando subas el proyecto a GitHub, sustituye `TU_USUARIO` por tu usuario o organización en la URL del `git clone`.

---

## Opción: app de escritorio (Electron)

Puedes usar EasyCronTab como aplicación de escritorio (ventana propia, icono en el menú, anclaje en la barra).

### En desarrollo (sin instalar)

```bash
npm run app
```

Se abre una ventana de Electron; no hace falta abrir el navegador.

### Instalador para Ubuntu / Debian

Genera el `.deb` e instálalo:

```bash
npm run build:deb
sudo dpkg -i dist/easycrontab_1.0.0_amd64.deb
```

Abre **EasyCronTab** desde el menú de aplicaciones. Si ya lo tenías instalado, reinstala el `.deb` para que el icono y el anclaje en la barra se actualicen.

### AppImage (portable, sin instalar)

```bash
npm run build:appimage
chmod +x dist/EasyCronTab-1.0.0.AppImage
./dist/EasyCronTab-1.0.0.AppImage
```

Puedes copiar el AppImage a `~/.local/bin` o donde quieras.

### Build completo (.deb + AppImage)

```bash
npm run build
```

Los artefactos quedan en `dist/`.

---

## Cómo se usa

1. **Buscar tareas**: en la barra de búsqueda escribe, por ejemplo:
   - "cron para las próximas horas"
   - "tarea de arañas", "backup", "diario", "noche"
2. **Editar crontab**: en la sección Crontab, modifica el texto y pulsa **Guardar crontab**.

Los cambios reemplazan todo el crontab del usuario actual. Úsalo con cuidado en entornos delicados.

---

## Configuración

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
