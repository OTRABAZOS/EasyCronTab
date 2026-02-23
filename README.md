# EasyCronTab 🕒

Gestor de crontab para Linux: interfaz web sencilla y buscador en lenguaje natural. Sin comandos complejos.

## Características

- **Interfaz web**: edita tu crontab en un textarea y guarda con un clic.
- **Buscador**: escribe en lenguaje natural (por ejemplo: "cron para las próximas horas", "tarea de arañas", "backup") y verás las tareas que coinciden.
- **Estética clara**: diseño inspirado en paneles de control modernos (header, cards, estados ok/error).
- **Solo Linux**: usa `crontab -l` y `crontab -` del usuario que ejecuta la app.

## Requisitos

- **Node.js** 18 o superior.
- **Linux** (el comando `crontab` debe estar disponible).
- La app modifica el crontab del **usuario que ejecuta el proceso**.

## Instalación desde GitHub

```bash
git clone https://github.com/TU_USUARIO/EasyCronTab.git
cd EasyCronTab
npm install
npm start
```

Abre en el navegador: **http://localhost:3000**

### Variables de entorno

| Variable | Descripción | Por defecto |
|----------|-------------|-------------|
| `PORT`   | Puerto del servidor | `3000` |

Opcional: copia `.env.example` a `.env` y ajusta `PORT` si lo necesitas.

```bash
cp .env.example .env
# Edita .env si quieres otro puerto
npm start
```

## Uso

1. **Buscar tareas**: en la barra de búsqueda escribe frases como:
   - "cron para las próximas horas"
   - "cron de la tarea de arañas"
   - "backup", "diario", "noche"
2. **Editar crontab**: baja a la sección Crontab, modifica el texto y pulsa **Guardar crontab**.

Los cambios reemplazan todo el crontab del usuario actual. Usa con cuidado en producción.

## Estructura del proyecto

```
EasyCronTab/
├── app.js              # Servidor Express y rutas
├── config.js           # Puerto desde env
├── lib/
│   ├── crontab.js      # Lectura/escritura y parseo del crontab
│   └── search.js       # Índice + Fuse.js + sinónimos para búsqueda
├── views/
│   └── dashboard.ejs   # Vista principal (buscador + crontab)
├── public/
│   └── css/
│       └── style.css   # Estilos
├── ROADMAP.md          # Hoja de ruta del proyecto
├── package.json
└── README.md
```

## Licencia

MIT.
