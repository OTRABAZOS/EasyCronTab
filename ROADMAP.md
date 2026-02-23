# Hoja de ruta – EasyCronTab

Proyecto desde cero: gestor de crontab para Linux con interfaz web y buscador en lenguaje natural.

---

## Fase 1 – Base del proyecto ✅
- [x] Estructura de carpetas: `lib/`, `views/`, `public/css/`, `public/js/`
- [x] `package.json` con Express, EJS, Fuse.js
- [x] Configuración: `config.js`, `.env.example`, `.gitignore`
- [x] Módulo `lib/crontab.js`: leer/escribir crontab del usuario, parsear líneas (schedule + comando)
- [x] API: `GET/POST /api/crontab`
- [x] Servidor Express y ruta `GET /` que sirve el dashboard

## Fase 2 – UI principal ✅
- [x] Vista única (dashboard) con estética tipo hammer_morgana
- [x] Header, contenido principal, sección Crontab (textarea + Guardar)
- [x] CSS: colores, cards, botones, estados ok/error
- [x] Cliente: rellenar textarea con crontab actual, enviar POST al guardar y mostrar estado

## Fase 3 – Buscador (Fuse + sinónimos) ✅
- [x] Índice de tareas: a partir del crontab parseado, cada línea = documento (schedule, command, keywords)
- [x] Sinónimos para consultas: "próximas horas", "tarea de arañas", "noche", etc.
- [x] `lib/search.js`: Fuse.js sobre el índice, expansión de consulta con sinónimos
- [x] `GET /api/search?q=...` que devuelve tareas que coinciden
- [x] Barra de búsqueda en la UI que llama a la API y muestra resultados (lista o cards)

## Fase 4 – Instalación y documentación ✅
- [x] README: requisitos (Node.js), instalación desde GitHub (`git clone`, `npm install`, `npm start`)
- [x] Opcional: script `start.sh` o instrucciones para ejecutar en local

## Fase 5 – Mejoras futuras (opcional)
- [ ] Validación de sintaxis cron antes de guardar (aviso si una línea es inválida)
- [ ] "Próximas ejecuciones" en lenguaje legible por tarea (ej. "Mañana a las 02:00")
- [ ] Embeddings + RRF (búsqueda híbrida) si se desea instalar servicio de embeddings
- [ ] Modo solo lectura si se ejecuta como otro usuario (o variable de entorno)

---

## Orden de implementación

1. **ROADMAP + estructura** → carpetas, package.json, .gitignore, config, .env.example  
2. **Backend** → lib/crontab.js, app.js, rutas y API crontab  
3. **UI** → views/dashboard.ejs, public/css/style.css, JS en página para guardar y estado  
4. **Buscador** → lib/search.js (índice + Fuse + sinónimos), GET /api/search, barra en UI  
5. **README** → instalación desde GitHub y uso
