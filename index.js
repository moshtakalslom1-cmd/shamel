const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_PATH = path.join(__dirname, 'data.json');

app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

function loadDatabase() {
  if (!fs.existsSync(DATA_PATH)) {
    const initialData = { users: [], ads: [], messages: [] };
    fs.writeFileSync(DATA_PATH, JSON.stringify(initialData, null, 2));
    return initialData;
  }
  try {
    const raw = fs.readFileSync(DATA_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch (e) {
    return { users: [], ads: [], messages: [] };
  }
}

function saveDatabase(data) {
  try {
    fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('Failed to save database', e);
  }
}

app.get('/api/ads', (req, res) => {
  const db = loadDatabase();
  res.json(db.ads || []);
});

app.get('/api/ads/:id', (req, res) => {
  const db = loadDatabase();
  const ad = (db.ads || []).find(a => a.id === req.params.id);
  if (!ad) return res.status(404).json({ error: 'Ad not found' });
  res.json(ad);
});

app.post('/api/ads', (req, res) => {
  const db = loadDatabase();
  const newAd = req.body;
  if (!db.ads) db.ads = [];
  db.ads.unshift(newAd);
  saveDatabase(db);
  res.status(201).json(newAd);
});

app.get('/api/users/:username', (req, res) => {
  const db = loadDatabase();
  const targetUser = decodeURIComponent(req.params.username).toLowerCase();
  
  const userRecord = (db.users || []).find(u => (u.username || '').toLowerCase() === targetUser);
  const userAds = (db.ads || []).filter(a => (a.ownerUsername || '').toLowerCase() === targetUser);
  
  const userData = {
    username: userRecord ? userRecord.username : decodeURIComponent(req.params.username),
    city: userRecord ? userRecord.city : 'دمشق',
    phone: userRecord ? userRecord.phone : '',
    bio: userRecord ? userRecord.bio : '',
    avatar: userRecord ? userRecord.avatar : '',
    adsCount: userAds.length,
    ads: userAds
  };
  
  res.json(userData);
});

app.put('/api/profile/settings', (req, res) => {
  const db = loadDatabase();
  const { username, city, phone, bio, avatar } = req.body;
  if (!username) return res.status(400).json({ error: 'Username required' });
  
  const targetLower = username.toLowerCase();
  if (!db.users) db.users = [];
  
  let userIndex = db.users.findIndex(u => (u.username || '').toLowerCase() === targetLower);
  const updatedUser = { username, city: city || 'دمشق', phone: phone || '', bio: bio || '', avatar: avatar || '' };
  
  if (userIndex >= 0) {
    db.users[userIndex] = updatedUser;
  } else {
    db.users.push(updatedUser);
  }
  
  saveDatabase(db);
  res.json({ success: true, user: updatedUser });
});

app.post('/api/auth/login', (req, res) => {
  const db = loadDatabase();
  const { username } = req.body;
  if (!username) return res.status(400).json({ error: 'Username required' });
  
  const targetLower = username.toLowerCase();
  if (!db.users) db.users = [];
  let user = db.users.find(u => (u.username || '').toLowerCase() === targetLower);
  
  if (!user) {
    user = { username, city: 'دمشق', phone: '', bio: '', avatar: '' };
    db.users.push(user);
    saveDatabase(db);
  }
  
  res.json({ success: true, user });
});

app.post('/api/auth/register', (req, res) => {
  const db = loadDatabase();
  const { username } = req.body;
  if (!username) return res.status(400).json({ error: 'Username required' });
  
  const targetLower = username.toLowerCase();
  if (!db.users) db.users = [];
  let user = db.users.find(u => (u.username || '').toLowerCase() === targetLower);
  
  if (user) {
    return res.status(400).json({ error: 'User already exists' });
  }
  
  user = { username, city: 'دمشق', phone: '', bio: '', avatar: '' };
  db.users.push(user);
  saveDatabase(db);
  res.status(201).json({ success: true, user });
});

app.get('/api/messages', (req, res) => {
  const db = loadDatabase();
  const user = (req.query.user || '').toLowerCase();
  if (!user) return res.json({ messages: [], conversations: [] });
  
  const msgs = (db.messages || []).filter(m => 
    (m.from && m.from.toLowerCase() === user) || (m.to && m.to.toLowerCase() === user)
  );
  
  const peerMap = new Map();
  msgs.forEach(m => {
    const isFromMe = (m.from || '').toLowerCase() === user;
    const peer = isFromMe ? m.to : m.from;
    if (peer && peer.toLowerCase() !== user) {
      if (!peerMap.has(peer.toLowerCase())) {
        peerMap.set(peer.toLowerCase(), { username: peer, lastMessage: m.text || '', lastTime: m.timestamp || '' });
      }
    }
  });
  
  res.json({ messages: msgs, conversations: Array.from(peerMap.values()) });
});

app.post('/api/messages', (req, res) => {
  const db = loadDatabase();
  const newMsg = req.body;
  if (!newMsg.from || !newMsg.to || !newMsg.text) {
    return res.status(400).json({ error: 'Invalid message payload' });
  }
  if (!db.messages) db.messages = [];
  db.messages.push(newMsg);
  saveDatabase(db);
  res.status(201).json({ success: true });
});

app.get('/chat', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'chat.html'));
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running seamlessly on port ${PORT}`);
});