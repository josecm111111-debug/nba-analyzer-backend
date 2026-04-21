// NBA Analyzer Backend - Proxy API-NBA
const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 10000;

// Tu API Key de API-NBA
const API_NBA_KEY = process.env.API_NBA_KEY || 'a28377994ba7279388c24b6dd28919132c8747afa61d80917fa057726d7064d7';
const API_NBA_BASE = 'https://v2.nba.api-sports.io';
const SEASON = 2025;

// CORS - permite llamadas desde cualquier lado (tu HTML)
app.use(cors());
app.use(express.json());

// Headers para API-NBA
const apiHeaders = {
  'x-rapidapi-host': 'v2.nba.api-sports.io',
  'x-rapidapi-key': API_NBA_KEY
};

// Helper para llamadas a API-NBA
async function callApi(path) {
  const url = `${API_NBA_BASE}${path}`;
  const res = await axios.get(url, { headers: apiHeaders, timeout: 15000 });
  return res.data;
}

// Diccionario de equipos NBA con múltiples variantes de nombre
// Clave: término de búsqueda ideal para API-NBA
// Valores: nombres alternativos que el usuario puede escribir
const NBA_TEAMS_MAP = {
  'Lakers': ['Los Angeles Lakers', 'LA Lakers', 'Lakers', 'L.A. Lakers'],
  'Clippers': ['Los Angeles Clippers', 'LA Clippers', 'Clippers', 'L.A. Clippers'],
  'Warriors': ['Golden State Warriors', 'Warriors', 'GSW', 'Golden State'],
  'Celtics': ['Boston Celtics', 'Celtics', 'Boston'],
  'Nets': ['Brooklyn Nets', 'Nets', 'Brooklyn'],
  'Knicks': ['New York Knicks', 'Knicks', 'NY Knicks', 'New York'],
  '76ers': ['Philadelphia 76ers', '76ers', 'Sixers', 'Philadelphia'],
  'Raptors': ['Toronto Raptors', 'Raptors', 'Toronto'],
  'Bulls': ['Chicago Bulls', 'Bulls', 'Chicago'],
  'Cavaliers': ['Cleveland Cavaliers', 'Cavaliers', 'Cavs', 'Cleveland'],
  'Pistons': ['Detroit Pistons', 'Pistons', 'Detroit'],
  'Pacers': ['Indiana Pacers', 'Pacers', 'Indiana'],
  'Bucks': ['Milwaukee Bucks', 'Bucks', 'Milwaukee'],
  'Hawks': ['Atlanta Hawks', 'Hawks', 'Atlanta'],
  'Hornets': ['Charlotte Hornets', 'Hornets', 'Charlotte'],
  'Heat': ['Miami Heat', 'Heat', 'Miami'],
  'Magic': ['Orlando Magic', 'Magic', 'Orlando'],
  'Wizards': ['Washington Wizards', 'Wizards', 'Washington'],
  'Nuggets': ['Denver Nuggets', 'Nuggets', 'Denver'],
  'Timberwolves': ['Minnesota Timberwolves', 'Timberwolves', 'Wolves', 'Minnesota', 'T-Wolves'],
  'Thunder': ['Oklahoma City Thunder', 'Thunder', 'OKC', 'Oklahoma'],
  'Trail Blazers': ['Portland Trail Blazers', 'Trail Blazers', 'Blazers', 'Portland'],
  'Jazz': ['Utah Jazz', 'Jazz', 'Utah'],
  'Mavericks': ['Dallas Mavericks', 'Mavericks', 'Mavs', 'Dallas'],
  'Rockets': ['Houston Rockets', 'Rockets', 'Houston'],
  'Grizzlies': ['Memphis Grizzlies', 'Grizzlies', 'Memphis'],
  'Pelicans': ['New Orleans Pelicans', 'Pelicans', 'New Orleans'],
  'Spurs': ['San Antonio Spurs', 'Spurs', 'San Antonio'],
  'Suns': ['Phoenix Suns', 'Suns', 'Phoenix'],
  'Kings': ['Sacramento Kings', 'Kings', 'Sacramento']
};

// Función inteligente: encuentra el término de búsqueda ideal
function getSearchTerm(inputName) {
  const normalized = inputName.trim().toLowerCase();
  
  // Buscar match exacto en el diccionario
  for (const [searchKey, variants] of Object.entries(NBA_TEAMS_MAP)) {
    const matchFound = variants.some(v => v.toLowerCase() === normalized);
    if (matchFound) return searchKey;
  }
  
  // Buscar match parcial
  for (const [searchKey, variants] of Object.entries(NBA_TEAMS_MAP)) {
    const partialMatch = variants.some(v => 
      v.toLowerCase().includes(normalized) || normalized.includes(v.toLowerCase())
    );
    if (partialMatch) return searchKey;
  }
  
  // Fallback: última palabra (Portland Trail Blazers → Blazers)
  const words = inputName.trim().split(/\s+/);
  return words[words.length - 1];
}

// Búsqueda robusta de equipo con múltiples intentos
async function findTeam(inputName) {
  // Intento 1: usar término del diccionario
  const primarySearch = getSearchTerm(inputName);
  
  try {
    let data = await callApi(`/teams?search=${encodeURIComponent(primarySearch)}`);
    let matches = (data.response || []).filter(t => t.nbaFranchise === true);
    
    if (matches.length > 0) {
      console.log(`✓ Encontrado "${inputName}" como "${matches[0].name}" (búsqueda: "${primarySearch}")`);
      return matches[0];
    }
    
    // Intento 2: buscar por cada palabra del input
    const words = inputName.trim().split(/\s+/);
    for (const word of words) {
      if (word.length < 3) continue; // saltar preposiciones cortas
      
      data = await callApi(`/teams?search=${encodeURIComponent(word)}`);
      matches = (data.response || []).filter(t => t.nbaFranchise === true);
      
      if (matches.length > 0) {
        // Si hay varios matches, buscar el que mejor coincida
        const best = matches.find(t => 
          t.name.toLowerCase().includes(inputName.toLowerCase()) ||
          inputName.toLowerCase().includes(t.name.toLowerCase())
        ) || matches[0];
        
        console.log(`✓ Encontrado "${inputName}" como "${best.name}" (búsqueda alt: "${word}")`);
        return best;
      }
    }
    
    console.warn(`✗ No encontrado: "${inputName}"`);
    return null;
    
  } catch (err) {
    console.error(`Error buscando "${inputName}":`, err.message);
    return null;
  }
}

// Healthcheck con métricas útiles
app.get('/', (req, res) => {
  const uptimeSecs = Math.floor(process.uptime());
  const uptimeStr = uptimeSecs < 60 
    ? `${uptimeSecs}s` 
    : uptimeSecs < 3600 
      ? `${Math.floor(uptimeSecs/60)}m` 
      : `${Math.floor(uptimeSecs/3600)}h ${Math.floor((uptimeSecs%3600)/60)}m`;
  
  res.json({ 
    status: 'NBA Analyzer Backend OK', 
    version: '1.0',
    uptime: uptimeStr,
    uptime_seconds: uptimeSecs,
    memory_mb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
    api_nba_configured: !!API_NBA_KEY,
    timestamp: new Date().toISOString()
  });
});

// Endpoint principal: analizar partido
app.post('/analyze', async (req, res) => {
  try {
    const { homeTeam, awayTeam } = req.body;

    if (!homeTeam || !awayTeam) {
      return res.status(400).json({ error: 'Faltan equipos' });
    }

    console.log(`Analizando: ${homeTeam} vs ${awayTeam}`);

    // 1. Buscar equipos con la nueva función robusta
    const [homeMatch, awayMatch] = await Promise.all([
      findTeam(homeTeam),
      findTeam(awayTeam)
    ]);

    if (!homeMatch || !awayMatch) {
      return res.json({ 
        success: false, 
        error: `Equipo no encontrado: ${!homeMatch ? homeTeam : awayTeam}. Probá con el nombre completo (ej: "Los Angeles Lakers")` 
      });
    }

    // 2. Obtener stats + standings + H2H en paralelo
    const [homeStatsData, awayStatsData, standingsData, h2hData] = await Promise.all([
      callApi(`/teams/statistics?id=${homeMatch.id}&season=${SEASON}`),
      callApi(`/teams/statistics?id=${awayMatch.id}&season=${SEASON}`),
      callApi(`/standings?league=standard&season=${SEASON}`),
      callApi(`/games?h2h=${homeMatch.id}-${awayMatch.id}&season=${SEASON}`)
    ]);

    const homeStats = homeStatsData.response?.[0];
    const awayStats = awayStatsData.response?.[0];
    const homeStanding = (standingsData.response || []).find(s => s.team.id === homeMatch.id);
    const awayStanding = (standingsData.response || []).find(s => s.team.id === awayMatch.id);
    const h2hGames = (h2hData.response || []).filter(g => g.status.long === 'Finished').slice(0, 5);

    const result = {
      success: true,
      home: {
        name: homeMatch.name,
        id: homeMatch.id,
        pointsForPerGame: homeStats ? (homeStats.points / homeStats.games).toFixed(1) : null,
        games: homeStats?.games || null,
        fieldGoalPct: homeStats?.fgp || null,
        record: homeStanding ? `${homeStanding.win.total}-${homeStanding.loss.total}` : 'N/A',
        conference: homeStanding?.conference?.name || '',
        conferenceRank: homeStanding?.conference?.rank || 'N/A'
      },
      away: {
        name: awayMatch.name,
        id: awayMatch.id,
        pointsForPerGame: awayStats ? (awayStats.points / awayStats.games).toFixed(1) : null,
        games: awayStats?.games || null,
        fieldGoalPct: awayStats?.fgp || null,
        record: awayStanding ? `${awayStanding.win.total}-${awayStanding.loss.total}` : 'N/A',
        conference: awayStanding?.conference?.name || '',
        conferenceRank: awayStanding?.conference?.rank || 'N/A'
      },
      h2h: h2hGames.map(g => ({
        date: g.date.start,
        home: g.teams.home.name,
        away: g.teams.visitors.name,
        homeScore: g.scores.home.points,
        awayScore: g.scores.visitors.points,
        total: (g.scores.home.points || 0) + (g.scores.visitors.points || 0)
      }))
    };

    console.log('✓ Análisis exitoso');
    res.json(result);

  } catch (err) {
    console.error('Error:', err.message);
    res.status(500).json({ 
      success: false, 
      error: err.message 
    });
  }
});

// Endpoint nuevo: traer partidos del día (considerando zona horaria America)
app.get('/games-today', async (req, res) => {
  try {
    // Buscar partidos en rango de 2 días (ayer, hoy, mañana UTC)
    // porque los partidos NBA cruzan días en UTC según zona horaria
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    
    const dates = [
      yesterday.toISOString().split('T')[0],
      now.toISOString().split('T')[0],
      tomorrow.toISOString().split('T')[0]
    ];
    
    console.log(`Buscando partidos en fechas: ${dates.join(', ')}`);
    
    // Consultar API-NBA para cada fecha en paralelo
    const allResponses = await Promise.all(
      dates.map(d => callApi(`/games?date=${d}`).catch(() => ({ response: [] })))
    );
    
    // Combinar todos los partidos y deduplicar por ID
    const allGames = [];
    const seenIds = new Set();
    
    allResponses.forEach(data => {
      (data.response || []).forEach(g => {
        if (!seenIds.has(g.id)) {
          seenIds.add(g.id);
          allGames.push(g);
        }
      });
    });
    
    // Filtrar solo partidos NBA (no WNBA u otros)
    const nbaGames = allGames.filter(g => {
      const leagueName = (g.league || '').toLowerCase();
      return leagueName === 'standard' || leagueName === '' || !g.league;
    });
    
    // Filtrar solo partidos en rango "hoy" desde la perspectiva del usuario
    // (NBA juega entre 18:00 y 03:00 ET, así que damos margen amplio)
    const todayStart = new Date();
    todayStart.setUTCHours(todayStart.getUTCHours() - 24); // margen hacia atrás
    
    const tomorrowEnd = new Date();
    tomorrowEnd.setUTCHours(tomorrowEnd.getUTCHours() + 30); // margen hacia adelante
    
    const relevantGames = nbaGames.filter(g => {
      const gameTime = new Date(g.date.start);
      return gameTime >= todayStart && gameTime <= tomorrowEnd;
    });
    
    const games = relevantGames.map(g => ({
      id: g.id,
      date: g.date.start,
      status: g.status.long,
      home: g.teams.home.name,
      away: g.teams.visitors.name,
      homeShort: g.teams.home.code,
      awayShort: g.teams.visitors.code,
      homeScore: g.scores?.home?.points || null,
      awayScore: g.scores?.visitors?.points || null
    }));
    
    games.sort((a, b) => new Date(a.date) - new Date(b.date));
    
    console.log(`✓ ${games.length} partidos NBA relevantes encontrados (de ${allGames.length} totales)`);
    res.json({ 
      success: true, 
      date: now.toISOString().split('T')[0],
      total: games.length,
      games 
    });
    
  } catch (err) {
    console.error('Error games-today:', err.message);
    res.status(500).json({ 
      success: false, 
      error: err.message 
    });
  }
});

// Endpoint de debug: probar si un equipo se encuentra
app.get('/test-team', async (req, res) => {
  const name = req.query.name;
  if (!name) {
    return res.status(400).json({ error: 'Falta parámetro "name". Ej: /test-team?name=Los Angeles Lakers' });
  }
  
  const searchTerm = getSearchTerm(name);
  const match = await findTeam(name);
  
  res.json({
    input: name,
    searchTermUsed: searchTerm,
    found: !!match,
    team: match ? {
      id: match.id,
      name: match.name,
      code: match.code
    } : null
  });
});

app.listen(PORT, () => {
  console.log(`🏀 NBA Analyzer Backend corriendo en puerto ${PORT}`);
});
