const express = require('express');
const axios = require('axios');

const app = express();
const PORT = 3000;

const GITHUB_M3U_URL = 'https://iptv-org.github.io/iptv/countries/tr.m3u';
const AUTH_USER = 'user123';
const AUTH_PASS = 'pass123';

async function fetchAndParseChannels() {
  try {
    const response = await axios.get(GITHUB_M3U_URL);
    const m3uData = response.data;
    const lines = m3uData.split('\n');
    
    const channels = [];
    let currentChannel = null;
    let streamIdCounter = 1;

    for (let line of lines) {
      line = line.trim();
      if (line.startsWith('#EXTINF:')) {
        const nameMatch = line.match(/,(.+)$/);
        const name = nameMatch ? nameMatch[1].trim() : `Kanal ${streamIdCounter}`;

        const logoMatch = line.match(/tvg-logo="([^"]+)"/);
        const logo = logoMatch ? logoMatch[1] : '';

        const groupMatch = line.match(/group-title="([^"]+)"/);
        const category = groupMatch ? groupMatch[1] : 'Genel';

        currentChannel = {
          stream_id: streamIdCounter++,
          name: name,
          stream_icon: logo,
          category_name: category,
          category_id: category.toLowerCase().replace(/\s+/g, '_')
        };
      } else if (line.startsWith('http') && currentChannel) {
        currentChannel.url = line;
        channels.push(currentChannel);
        currentChannel = null;
      }
    }
    return channels;
  } catch (error) {
    console.error('GitHub M3U çekme hatası:', error.message);
    return [];
  }
}

app.get('/player_api.php', async (req, res) => {
  const { username, password, action } = req.query;

  if (username !== AUTH_USER || password !== AUTH_PASS) {
    return res.status(401).json({ user_info: { auth: 0 }, error: "Hatalı şifre" });
  }

  const channels = await fetchAndParseChannels();

  if (!action) {
    return res.json({
      user_info: {
        username: AUTH_USER,
        password: AUTH_PASS,
        auth: 1,
        status: "Active",
        exp_date: "1773878400",
        is_trial: "0",
        active_cons: "1",
        max_connections: "5"
      },
      server_info: {
        url: req.hostname,
        port: PORT.toString(),
        https_port: "443",
        server_protocol: "http",
        timezone: "Europe/Istanbul"
      }
    });
  }

  if (action === 'get_live_categories') {
    const categoriesMap = {};
    channels.forEach(ch => {
      if (!categoriesMap[ch.category_id]) {
        categoriesMap[ch.category_id] = {
          category_id: ch.category_id,
          category_name: ch.category_name,
          parent_id: 0
        };
      }
    });
    return res.json(Object.values(categoriesMap));
  }

  // BURASI DEĞİŞTİ: Kategori ID ne gelirse gelsin, tüm kanalları göstererek TV'nin boş kalmasını engelliyoruz
  if (action === 'get_live_streams') {
    const responseList = channels.map(ch => ({
      num: ch.stream_id,
      name: ch.name,
      stream_type: "live",
      stream_id: ch.stream_id,
      stream_icon: ch.stream_icon,
      category_id: ch.category_id,
      epg_channel_id: "",
      added: "1600000000"
    }));

    return res.json(responseList);
  }

  return res.json([]);
});

app.get('/live/:user/:pass/:stream_id', async (req, res) => {
  const { user, pass, stream_id } = req.params;
  if (user !== AUTH_USER || pass !== AUTH_PASS) return res.status(403).send("Yetkisiz");

  const cleanId = parseInt(stream_id.split('.')[0]);
  const channels = await fetchAndParseChannels();
  const channel = channels.find(c => c.stream_id === cleanId);

  if (channel && channel.url) {
    return res.redirect(channel.url);
  } else {
    return res.status(404).send("Bulunamadı");
  }
});

app.listen(PORT, () => {
  console.log(`Xtream API Servisi Çalışıyor: http://localhost:${PORT}`);
});