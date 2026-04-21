// NBA Analyzer Backend v3.0 - usando API-BASKETBALL (no API-NBA viejo)
const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 10000;

// API-BASKETBALL (NBA está en league=12)
const API_KEY = process.env.API_NBA_KEY || 'a28377994ba7279388c24b6dd28919132c8747afa61d80917fa057726d7064d7';
const API_BASE = 'https://v1.basketball.api-sports.io';
const NBA_LEAGUE_ID = 12; // NBA en API-BASKETBALL
const SEASON = '2025-2026';

// CORS
app.use(cors());
app.use(express.json());

const apiHeaders = {
  'x-rapidapi-host': 'v1.basketball.api-sports.io',
  'x-rapidapi-key': API_KEY
};

async function callApi(path) {
  const url = `${API_BASE}${path}`;
  console.log(`→ Llamando: ${url}`);
  const res = await axios.get(url, { headers: apiHeaders, timeout: 15000 });
  return res.data;
}

// Cache de equipos NBA
let NBA_TEAMS_CACHE = null;

async function loadAllNBATeams() {
  if (NBA_TEAMS_CACHE) return NBA_TEAMS_CACHE;
  
  try {
    const data = await callApi(`/teams?league=${NBA_LEAGUE_ID}&season=${SEASON}`);
    NBA_TEAMS_CACHE = data.response || [];
    console.log(`Cargados ${NBA_TEAMS_CACHE.length} equipos NBA`);
    return NBA_TEAMS_CACHE;
  } catch (err) {
    console.error('Error cargando equipos NBA:', err.message);
    return [];
  }
}

async function findTeam(inputName) {
  const teams = await loadAllNBATeams();
  if (teams.length === 0) return null;
  
  const normalized = inputName.trim().toLowerCase();
  
  let match = teams.find(t => t.name && t.name.toLowerCase() === normalized);
  if (match) return match;
  
  match = teams.find(t => {
    if (!t.name) return false;
    const teamWords = t.name.toLowerCase().split(' ');
    const lastWord = teamWords[teamWords.length - 1];
    return normalized.includes(lastWord) || lastWord === normalized;
  });
  if (match) return match;
  
  match = teams.find(t => {
    if (!t.name) return false;
    const teamName = t.name.toLowerCase();
    return teamName.includes(normalized) || normalized.includes(teamName);
  });
  return match || null;
}

// Healthcheck
app.get('/', (req, res) => {
  const uptimeSecs = Math.floor(process.uptime());
  const uptimeStr = uptimeSecs < 60 
    ? `${uptimeSecs}s` 
    : `${Math.floor(uptimeSecs/60)}m`;
  
  res.json({ 
    status: 'NBA Analyzer Backend OK', 
    version: '3.0',
    api_service: 'API-BASKETBALL',
    api_base: API_BASE,
    league_id: NBA_LEAGUE_ID,
    season: SEASON,
    uptime: uptimeStr,
    memory_mb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
    timestamp: new Date().toISOString()
  });
});

app.get('/debug-teams', async (req, res) => {
  try {
    const teams = await loadAllNBATeams();
    res.json({
      total: teams.length,
      teams: teams.map(t => ({
        id: t.id,
        name: t.name,
        code: t.code
      }))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/test-team', async (req, res) => {
  const name = req.query.name;
  if (!name) return res.status(400).json({ error: 'Falta ?name=' });
  
  const match = await findTeam(name);
  res.json({
    input: name,
    found: !!match,
    team: match ? { id: match.id, name: match.name, code: match.code } : null
  });
});

app.post('/analyze', async (req, res) => {
  try {
    const { homeTeam, awayTeam } = req.body;
    if (!homeTeam || !awayTeam) return res.status(400).json({ error: 'Faltan equipos' });

    console.log(`\n=== Analizando: ${homeTeam} vs ${awayTeam} ===`);

    const [homeMatch, awayMatch] = await Promise.all([
      findTeam(homeTeam),
      findTeam(awayTeam)
    ]);

    if (!homeMatch || !awayMatch) {
      return res.json({ 
        success: false, 
        error: `Equipo no encontrado: ${!homeMatch ? homeTeam : awayTeam}` 
      });
    }

    let homeStats = null, awayStats = null, homeStanding = null, awayStanding = null, h2hGames = [];
    
    try {
      const [homeStatsData, awayStatsData] = await Promise.all([
        callApi(`/statistics?league=${NBA_LEAGUE_ID}&season=${SEASON}&team=${homeMatch.id}`).catch(() => null),
        callApi(`/statistics?league=${NBA_LEAGUE_ID}&season=${SEASON}&team=${awayMatch.id}`).catch(() => null)
      ]);
      homeStats = homeStatsData?.response || null;
      awayStats = awayStatsData?.response || null;
    } catch(e) {}
    
    try {
      const standingsData = await callApi(`/standings?league=${NBA_LEAGUE_ID}&season=${SEASON}`);
      const allStandings = (standingsData.response || []).flat();
      homeStanding = allStandings.find(s => s.team && s.team.id === homeMatch.id);
      awayStanding = allStandings.find(s => s.team && s.team.id === awayMatch.id);
    } catch(e) {}
    
    try {
      const h2hData = await callApi(`/games/h2h?h2h=${homeMatch.id}-${awayMatch.id}&league=${NBA_LEAGUE_ID}&season=${SEASON}`);
      h2hGames = (h2hData.response || [])
        .filter(g => g.status && g.status.short === 'FT')
        .slice(0, 5);
    } catch(e) {}

    const getAvgPoints = (stats) => {
      if (!stats || !stats.games) return null;
      const totalGames = stats.games?.played?.all || 0;
      const totalPoints = stats.points?.for?.total?.all || 0;
      if (totalGames === 0) return null;
      return (totalPoints / totalGames).toFixed(1);
    };

    const result = {
      success: true,
      home: {
        name: homeMatch.name,
        id: homeMatch.id,
        pointsForPerGame: getAvgPoints(homeStats),
        record: homeStanding ? `${homeStanding.games?.win?.total || 0}-${homeStanding.games?.lose?.total || 0}` : 'N/A',
        conferenceRank: homeStanding?.position || 'N/A'
      },
      away: {
        name: awayMatch.name,
        id: awayMatch.id,
        pointsForPerGame: getAvgPoints(awayStats),
        record: awayStanding ? `${awayStanding.games?.win?.total || 0}-${awayStanding.games?.lose?.total || 0}` : 'N/A',
        conferenceRank: awayStanding?.position || 'N/A'
      },
      h2h: h2hGames.map(g => ({
        date: g.date,
        home: g.teams?.home?.name,
        away: g.teams?.away?.name,
        homeScore: g.scores?.home?.total,
        awayScore: g.scores?.away?.total,
        total: (g.scores?.home?.total || 0) + (g.scores?.away?.total || 0)
      }))
    };

    console.log('✓ Análisis exitoso');
    res.json(result);

  } catch (err) {
    console.error('Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`🏀 NBA Analyzer Backend v3.0 en puerto ${PORT}`);
  console.log(`📡 API: ${API_BASE}`);
  console.log(`🏀 League: ${NBA_LEAGUE_ID} (NBA)`);
  console.log(`📅 Season: ${SEASON}`);
});
