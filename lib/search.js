const Fuse = require('fuse.js');

/** Normaliza texto: minúsculas y sin acentos */
function normalize(s) {
  if (typeof s !== 'string') return '';
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/** Sinónimos para consultas en lenguaje natural sobre crontab */
const CRON_QUERY_SYNONYMS = {
  'cron para las próximas horas': ['próximas horas', 'próximas ejecuciones', 'horario', 'cada hora', 'horas'],
  'cron proximas horas': ['próximas horas', 'horario', 'cada hora'],
  'próximas horas': ['próximas ejecuciones', 'horario', 'hora'],
  'cron de la tarea de arañas': ['arañas', 'spider', 'morgana', 'tarea'],
  'tarea de arañas': ['arañas', 'spider', 'morgana'],
  'cron de arañas': ['arañas', 'spider', 'morgana'],
  'arañas': ['spider', 'morgana', 'scrapy'],
  'cron de noche': ['noche', 'nocturno', 'madrugada', '2:00', '3:00', '0 2', '0 3'],
  'tareas de noche': ['noche', 'nocturno', 'madrugada'],
  'backup': ['backup', 'respaldo', 'copia'],
  'diario': ['diario', 'cada día', '0 0', 'día'],
  'cada hora': ['cada hora', '0 *', '* * * * *', 'horario']
};

/**
 * Extrae palabras clave del comando (rutas, nombres de script) para búsqueda.
 * @param {string} command
 * @returns {string[]}
 */
function extractKeywordsFromCommand(command) {
  if (!command || typeof command !== 'string') return [];
  const parts = command.split(/[/\s]+/).filter(Boolean);
  const keywords = [];
  const lower = command.toLowerCase();
  if (lower.includes('morgana') || lower.includes('spider')) keywords.push('arañas', 'spider', 'morgana');
  if (lower.includes('backup')) keywords.push('backup');
  if (lower.includes('log')) keywords.push('log');
  parts.forEach(p => {
    const clean = p.replace(/[^\w\-.]/g, '');
    if (clean.length >= 3 && !/^\d+$/.test(clean)) keywords.push(clean.toLowerCase());
  });
  return [...new Set(keywords)];
}

/**
 * Construye el índice de documentos para Fuse a partir de las tareas parseadas.
 * @param {Array<{ schedule: string, command: string, line: string }>} tasks
 * @returns {Array<{ schedule, command, line, keywords, searchText, searchTextNorm }>}
 */
function buildSearchIndex(tasks) {
  return tasks.map((t, i) => {
    const keywords = extractKeywordsFromCommand(t.command);
    const searchText = [t.schedule, t.command, ...keywords].join(' ');
    return {
      id: i,
      schedule: t.schedule,
      command: t.command,
      line: t.line,
      keywords,
      searchText,
      searchTextNorm: normalize(searchText)
    };
  });
}

/**
 * Expande la consulta del usuario con sinónimos para crontab.
 * @param {string} query
 * @returns {string[]} Términos de búsqueda (incluida la query normalizada)
 */
function getSearchTerms(query) {
  if (!query || typeof query !== 'string') return [];
  const q = query.trim().toLowerCase();
  const qNorm = normalize(q);
  const terms = [qNorm.length >= 2 ? qNorm : q];
  for (const [key, synonyms] of Object.entries(CRON_QUERY_SYNONYMS)) {
    const keyNorm = normalize(key);
    if (qNorm.includes(keyNorm) || keyNorm.includes(qNorm)) {
      synonyms.forEach(s => {
        const sn = normalize(s);
        if (sn.length >= 2 && !terms.includes(sn)) terms.push(sn);
      });
    }
  }
  return [...new Set(terms)];
}

/**
 * Busca tareas en el índice que coincidan con la consulta.
 * @param {Array<{ schedule, command, line, keywords, searchText, searchTextNorm }>} index
 * @param {string} query
 * @param {number} limit
 * @returns {Array<{ schedule, command, line, score? }>}
 */
function search(index, query, limit = 20) {
  if (!index || index.length === 0) return [];
  if (!query || typeof query !== 'string' || query.trim().length < 1) return index.slice(0, limit);

  const terms = getSearchTerms(query);
  const fuse = new Fuse(index, {
    keys: [
      { name: 'searchTextNorm', weight: 0.5 },
      { name: 'searchText', weight: 0.3 },
      { name: 'command', weight: 0.15 },
      { name: 'schedule', weight: 0.05 }
    ],
    threshold: 0.4,
    includeScore: true,
    minMatchCharLength: 1,
    ignoreLocation: true,
    findAllMatches: true,
    shouldSort: true
  });

  const seen = new Map();
  const primaryQuery = terms[0] || query.trim();
  const primaryNorm = normalize(primaryQuery);
  let results = fuse.search(primaryNorm.length >= 1 ? primaryNorm : primaryQuery);

  if (results.length === 0 && terms.length > 1) {
    for (let i = 1; i < terms.length; i++) {
      const part = fuse.search(terms[i]);
      part.forEach(r => {
        const key = r.item.id;
        if (!seen.has(key) || (seen.get(key).score != null && (r.score == null || r.score < seen.get(key).score))) {
          seen.set(key, { item: r.item, score: r.score });
        }
      });
    }
    results = Array.from(seen.values()).map(v => ({ item: v.item, score: v.score }));
    results.sort((a, b) => (a.score ?? 1) - (b.score ?? 1));
  }

  return results
    .slice(0, limit)
    .map(r => ({
      schedule: r.item.schedule,
      command: r.item.command,
      line: r.item.line,
      score: r.score
    }));
}

module.exports = {
  buildSearchIndex,
  getSearchTerms,
  search,
  extractKeywordsFromCommand,
  CRON_QUERY_SYNONYMS
};
