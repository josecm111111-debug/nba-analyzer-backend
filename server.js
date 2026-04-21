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

// Healthcheck
app.get('/', (req, res) => {
  res.json({ status: 'NBA Analyzer Backend OK', version: '1.0' });
});

// Endpoint principal: analizar partido
app.post('/analyze', async (req, res) => {
  try {
    const { homeTeam, awayTeam } = req.body;

    if (!homeTeam || !awayTeam) {
      return res.status(400).json({ error: 'Faltan equipos' });
    }

    console.log(`Analizando: ${homeTeam} vs ${awayTeam}`);

    // 1. Buscar equipos
    const [homeSearch, awaySearch] = await Promise.all([
      callApi(`/teams?search=${encodeURIComponent(homeTeam.split(' ')[0])}`),
      callApi(`/teams?search=${encodeURIComponent(awayTeam.split(' ')[0])}`)
    ]);

    const homeMatches = (homeSearch.response || []).filter(t => t.nbaFranchise === true);
    const awayMatches = (awaySearch.response || []).filter(t => t.nbaFranchise === true);

    const homeMatch = homeMatches.find(t => 
      t.name.toLowerCase() === homeTeam.toLowerCase() ||
      t.name.toLowerCase().includes(homeTeam.toLowerCase()) ||
      homeTeam.toLowerCase().includes(t.name.toLowerCase())
    ) || homeMatches[0];

    const awayMatch = awayMatches.find(t => 
      t.name.toLowerCase() === awayTeam.toLowerCase() ||
      t.name.toLowerCase().includes(awayTeam.toLowerCase()) ||
      awayTeam.toLowerCase().includes(t.name.toLowerCase())
    ) || awayMatches[0];

    if (!homeMatch || !awayMatch) {
      return res.json({ 
        success: false, 
        error: `Equipo no encontrado: ${!homeMatch ? homeTeam : awayTeam}` 
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

app.listen(PORT, () => {
  console.log(`🏀 NBA Analyzer Backend corriendo en puerto ${PORT}`);
});
