# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Run the web server (http://localhost:3000)
npm start

# Run as Electron desktop app
npm run app

# Build .deb and AppImage packages
npm run build

# Build only .deb
npm run build:deb

# Build only AppImage
npm run build:appimage

# Check script permissions
npm run check:scripts
```

No test suite is configured. There is no linter configured.

## Environment

Copy `.env.example` to `.env` to configure:
- `PORT` — HTTP port (default: 3000)
- `REPOS_PATH` — default repos folder path
- `LOGS_PATH` — default logs folder path
- `EASYCRONTAB_USER_DATA` — override directory for `data/settings.json` (default: `<project_root>/data/`)

## Architecture

**Entry points:**
- `app.js` — Express server with all REST API routes and business logic helpers
- `electron-main.js` — Electron wrapper that launches the Express server and opens a BrowserWindow

**`lib/` modules (all pure Node, no framework):**
- `crontab.js` — Reads/writes the system crontab via `crontab -l` / `crontab -` shell commands; parses lines into `{ schedule, command, line }` objects
- `cronSchedule.js` — Converts between cron expressions and human-readable Spanish text (`cronToHuman`), and between form options and cron expressions (`buildCronExpression`, `cronToFormOptions`). Exports `FRECUENCIAS` and `DIAS_SEMANA` constants used in the UI
- `nextRun.js` — Computes next execution time and per-day run slots using `cron-parser`
- `search.js` — Fuse.js fuzzy search over crontab tasks, with Spanish synonym expansion (e.g. "arañas" → spider/morgana)
- `pm2.js` — Wraps PM2's programmatic API (connect/disconnect per call) to list, start, stop, restart, delete, and save processes
- `settings.js` — Reads/writes `data/settings.json` for `reposPath` and `logsPath`; logs path defaults to `~/.local/share/easycrontab/logs`
- `repos.js` — Lists subdirectories with `package.json` under the configured repos path; builds `cd <dir> && npm run <script>` cron commands
- `browse.js` — Filesystem browser restricted to the user's home directory, used for the folder picker UI
- `commandDescribe.js` — Heuristic that converts a shell command string into a short human description
- `xvfb.js` — Wraps/unwraps commands with `Xvfb` for headless display support

**Views:** EJS templates in `views/`. Single-page dashboard rendered server-side; JS in `public/` handles the dynamic UI interactions via fetch calls to the REST API.

**Log management:**
Each cron task's log file is identified by an MD5 hash of `schedule + "\n" + rawCommand` (12-char prefix), stored in `logsPath`. The app automatically appends `>> <logfile> 2>&1` to commands when saving to crontab.

**API surface (`app.js`):**
- `GET /api/jobs` — list parsed jobs with humanized schedule, next run, log status
- `POST /api/jobs` — replace entire crontab with provided jobs array
- `POST /api/jobs/log` — read tail of a job's log file
- `POST /api/jobs/run-now` — execute a cron job immediately in the background
- `GET /api/jobs/day?date=YYYY-MM-DD` — jobs grouped into 15-minute slots for a day view
- `GET /api/search?q=...` — fuzzy search over tasks
- `GET/POST /api/settings` — get/set `reposPath`
- `GET /api/repos` — list repos and their npm scripts
- `GET /api/repos/command` — build the cron command for a repo+script
- `GET /api/browse` — filesystem browser
- `GET /api/pm2/list`, `POST /api/pm2/{start,stop,restart,delete,save,log}` — PM2 management

**Important behavior:** `POST /api/jobs` replaces the **entire** crontab of the running user. The app always runs as the user who starts it and manages that user's crontab only.
