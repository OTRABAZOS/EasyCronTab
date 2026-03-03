# 🔄 Guía de Restauración Post-Formateo

> Backup creado el **3 de marzo de 2026**. Archivos de respaldo guardados en este mismo directorio.

---

## Paso 1: Instalar dependencias del sistema

```bash
# Node.js (v18 o superior)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# xvfb (necesario para los scrapers que usan navegador)
sudo apt install -y xvfb

# PM2 (gestor de procesos)
sudo npm install -g pm2

# Git
sudo apt install -y git
```

---

## Paso 2: Clonar todos los repositorios

Todos los proyectos deben quedar en `/home/mazingerzot/DEV/`. Cloná cada repo:

```bash
mkdir -p ~/DEV && cd ~/DEV

# Proyectos gestionados por PM2
git clone <url-repo> APImedios
git clone <url-repo> mochi_chatbot_nataliarubio_llaryora
git clone <url-repo> mochi_chatbot_trawlingweb_wikibot

# Proyectos gestionados por Crontab
git clone <url-repo> morgana_facebook_posts_buscadores
git clone <url-repo> morgana_facebook_posts
git clone <url-repo> morgana_instagram_comments
git clone <url-repo> digital_posts_buscadores
git clone <url-repo> EasyCronTab
```

> ⚠️ Reemplazá `<url-repo>` por la URL real de cada repositorio en GitHub/GitLab.

---

## Paso 3: Instalar dependencias de cada proyecto

```bash
cd ~/DEV
for dir in APImedios mochi_chatbot_nataliarubio_llaryora mochi_chatbot_trawlingweb_wikibot morgana_facebook_posts_buscadores morgana_facebook_posts morgana_instagram_comments digital_posts_buscadores EasyCronTab; do
  echo "📦 Instalando dependencias en $dir..."
  cd ~/DEV/$dir && npm install
done
```

---

## Paso 4: Restaurar el Crontab

```bash
cd ~/DEV/EasyCronTab
crontab backup_crontab_20260303.txt
```

Verificá que se cargó correctamente:

```bash
crontab -l
```

### Tareas programadas que se restauran:

| Proyecto | Comando | Frecuencia |
|---|---|---|
| `morgana_facebook_posts_buscadores` | `npm start` | Cada 6 horas |
| `morgana_facebook_posts_buscadores` | `npm run cleanup` | Diario a la 1:00 |
| `morgana_facebook_posts` | `npm run scrape:sql:pages` | Cada 8 horas |
| `morgana_facebook_posts` | `npm run scrape:sql:groups` | Cada 7 horas |
| `morgana_facebook_posts` | `npm run scrape:sql:profiles` | Cada 7h (al :30) |
| `morgana_instagram_comments` | `npm start` | Cada 5 horas |
| `digital_posts_buscadores` | `npm start` | Cada 5h + 7:00 + 11:00 |
| `mochi_chatbot_nataliarubio_llaryora` | `npm run automejora-ai` | Diario a las 4:00 |
| `morgana_facebook_posts` | `npm run cleanup-logs` | Diario a las 2:00 |

---

## Paso 5: Restaurar PM2

```bash
# Copiar el dump de vuelta a PM2
mkdir -p ~/.pm2
cp ~/DEV/EasyCronTab/backup_pm2_dump_20260303.json ~/.pm2/dump.pm2

# Restaurar los procesos
pm2 resurrect

# Verificar que están corriendo
pm2 list

# Configurar PM2 para que arranque con el sistema
pm2 startup
pm2 save
```

### Procesos PM2 que se restauran:

| Nombre | Directorio |
|---|---|
| `APImedios` | `~/DEV/APImedios` |
| `mochi_chatbot_nataliarubio_llaryora` | `~/DEV/mochi_chatbot_nataliarubio_llaryora` |
| `mochi_chatbot_trawlingweb_wikibot` | `~/DEV/mochi_chatbot_trawlingweb_wikibot` |

---

## Paso 6: Verificación final

```bash
# Verificar crontab
crontab -l

# Verificar PM2
pm2 list

# Verificar que todos los procesos están "online"
pm2 status
```

---

## 📁 Archivos de backup incluidos

- `backup_crontab_20260303.txt` — Exportación completa del crontab
- `backup_pm2_dump_20260303.json` — Dump de procesos PM2

> 💡 **Tip:** Asegurate de tener configuradas las variables de entorno y archivos `.env` de cada proyecto antes de arrancar los servicios.
