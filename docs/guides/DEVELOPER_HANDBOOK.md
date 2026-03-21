# Developer Handbook — EasyCronTab

## Descripción del Proyecto

Gestor de crontab para Linux con interfaz web y buscador en lenguaje natural. Permite gestionar tareas cron y procesos PM2 sin necesidad de comandos. Disponible como app web (Express), app de escritorio (Electron), paquete .deb e AppImage.

## Stack Tecnológico

- **Lenguaje**: Node.js 18+
- **Framework web**: Express
- **Templates**: EJS
- **Desktop**: Electron (opcional)
- **Puerto**: 3000

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

No requiere variables de entorno para uso básico. Usa el crontab del usuario que ejecuta la app.

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

## Documentación Relacionada

- ROADMAP: `docs/project/ROADMAP.md`
- CHANGELOG: `CHANGELOG.md`
