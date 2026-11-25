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
    const parsed = JSON.parse(raw);
    return {
      users: Array.isArray(parsed.users) ? parsed.users : [],
      ads: Array.isArray(parsed.ads) ? parsed.ads : [],
      messages: Array.isArray(parsed.messages) ? parsed.messages : []
    };
  } catch (e) {
    return { users: [], ads: [], messages: [] };
  }
}

function saveDatabase(data) {
  try {
    fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('Failed to save database:', e);
  }
}

// الإعلانات
app.get('/api/ads', (req, res) => {
  const db = loadDatabase();
  res.json(db.ads);
});

app.get('/api/ads/:id', (req, res) => {
  const db = loadDatabase();
  const ad = db.ads.find(a => String(a.id) === String(req.params.id));
  if (!ad) return res.status(404).json({ error: 'Ad not found' });
  res.json(ad);
});

app.post('/api/ads', (req, res) => {
  const db = loadDatabase();
  const body = req.body || {};
  const cleanPrice = String(body.price || '').replace(/[^\d]/g, '');

  if (!body.title || !cleanPrice) {
    return res.status(400).json({ error: 'Title and numeric price are required' });
  }

  const newAd = {
    id: body.id ? String(body.id) : `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    title: String(body.title).trim(),
    price: cleanPrice,
    currency: 'ل.س',
    category: body.category || 'عام',
    city: body.city || 'دمشق',
    condition: body.condition || 'مستعمل',
    description: body.description || '',
    ownerUsername: body.ownerUsername || 'مستخدم',
    image: typeof body.image === 'string' ? body.image : '',
    reviews: Array.isArray(body.reviews) ? body.reviews : [],
    createdAt: body.createdAt || new Date().toISOString()
  };

  db.ads.unshift(newAd);
  saveDatabase(db);
  res.status(201).json(newAd);
});

app.delete('/api/ads/:id', (req, res) => {
  const db = loadDatabase();
  const beforeCount = db.ads.length;
  db.ads = db.ads.filter(a => String(a.id) !== String(req.params.id));
  if (db.ads.length === beforeCount) {
    return res.status(404).json({ error: 'Ad not found' });
  }
  saveDatabase(db);
  res.json({ success: true });
});

// التقييمات والآراء على الإعلان
app.post('/api/ads/:id/reviews', (req, res) => {
  const db = loadDatabase();
  const adIndex = db.ads.findIndex(a => String(a.id) === String(req.params.id));
  if (adIndex < 0) return res.status(404).json({ error: 'Ad not found' });

  const { author, rating, comment } = req.body || {};
  if (!comment || !String(comment).trim()) {
    return res.status(400).json({ error: 'Comment is required' });
  }

  if (!Array.isArray(db.ads[adIndex].reviews)) {
    db.ads[adIndex].reviews = [];
  }

  const newReview = {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    author: String(author || 'مستخدم').trim(),
    rating: Number(rating) || 5,
    comment: String(comment).trim(),
    createdAt: new Date().toISOString()
  };

  db.ads[adIndex].reviews.push(newReview);
  saveDatabase(db);
  res.status(201).json(db.ads[adIndex]);
});

// الملف الشخصي والإعدادات
app.get('/api/users/:username', (req, res) => {
  const db = loadDatabase();
  const rawName = decodeURIComponent(req.params.username || '').trim();
  const targetLower = rawName.toLowerCase();

  const userRecord = db.users.find(u => String(u.username || '').toLowerCase() === targetLower);
  const userAds = db.ads.filter(a => String(a.ownerUsername || '').toLowerCase() === targetLower);

  res.json({
    username: userRecord ? userRecord.username : rawName,
    city: userRecord ? (userRecord.city || 'دمشق') : 'دمشق',
    phone: userRecord ? (userRecord.phone || '') : '',
    bio: userRecord ? (userRecord.bio || '') : '',
    avatar: userRecord ? (userRecord.avatar || '') : '',
    adsCount: userAds.length,
    ads: userAds
  });
});

app.put('/api/profile/settings', (req, res) => {
  const db = loadDatabase();
  const { username, city, phone, bio, avatar } = req.body || {};
  if (!username || !String(username).trim()) {
    return res.status(400).json({ error: 'Username is required' });
  }

  const cleanUsername = String(username).trim();
  const targetLower = cleanUsername.toLowerCase();
  const idx = db.users.findIndex(u => String(u.username || '').toLowerCase() === targetLower);
  const existing = idx >= 0 ? db.users[idx] : {};

  const updatedUser = {
    username: cleanUsername,
    city: city !== undefined ? String(city).trim() : (existing.city || 'دمشق'),
    phone: phone !== undefined ? String(phone).trim() : (existing.phone || ''),
    bio: bio !== undefined ? String(bio).trim() : (existing.bio || ''),
    avatar: avatar !== undefined ? String(avatar) : (existing.avatar || '')
  };

  if (idx >= 0) {
    db.users[idx] = updatedUser;
  } else {
    db.users.push(updatedUser);
  }

  saveDatabase(db);
  res.json({ success: true, user: updatedUser });
});

// المصادقة
app.post('/api/auth/login', (req, res) => {
  const db = loadDatabase();
  const { username } = req.body || {};
  if (!username || !String(username).trim()) {
    return res.status(400).json({ error: 'Username is required' });
  }

  const cleanUsername = String(username).trim();
  const targetLower = cleanUsername.toLowerCase();
  let user = db.users.find(u => String(u.username || '').toLowerCase() === targetLower);

  if (!user) {
    user = { username: cleanUsername, city: 'دمشق', phone: '', bio: '', avatar: '' };
    db.users.push(user);
    saveDatabase(db);
  }

  res.json({ success: true, user });
});

app.post('/api/auth/register', (req, res) => {
  const db = loadDatabase();
  const { username } = req.body || {};
  if (!username || !String(username).trim()) {
    return res.status(400).json({ error: 'Username is required' });
  }

  const cleanUsername = String(username).trim();
  const targetLower = cleanUsername.toLowerCase();
  const existing = db.users.find(u => String(u.username || '').toLowerCase() === targetLower);

  if (existing) {
    return res.json({ success: true, user: existing });
  }

  const user = { username: cleanUsername, city: 'دمشق', phone: '', bio: '', avatar: '' };
  db.users.push(user);
  saveDatabase(db);
  res.status(201).json({ success: true, user });
});

// الرسائل والمحادثات
app.get('/api/messages', (req, res) => {
  const db = loadDatabase();
  const user = String(req.query.user || '').trim().toLowerCase();
  if (!user) return res.json({ messages: [], conversations: [] });

  const msgs = db.messages.filter(m =>
    String(m.from || m.sender || '').toLowerCase() === user ||
    String(m.to || m.receiver || '').toLowerCase() === user
  );

  const peerMap = new Map();
  msgs.forEach(m => {
    const fromUser = String(m.from || m.sender || '').trim();
    const toUser = String(m.to || m.receiver || '').trim();
    const isFromMe = fromUser.toLowerCase() === user;
    const peer = isFromMe ? toUser : fromUser;
    if (!peer || peer.toLowerCase() === user) return;

    const userObj = db.users.find(u => String(u.username || '').toLowerCase() === peer.toLowerCase());
    peerMap.set(peer.toLowerCase(), {
      username: peer,
      avatar: userObj ? (userObj.avatar || '') : '',
      lastMessage: m.text || m.message || '',
      lastTime: m.timestamp || ''
    });
  });

  res.json({
    messages: msgs,
    conversations: Array.from(peerMap.values())
  });
});

app.post('/api/messages', (req, res) => {
  const db = loadDatabase();
  const body = req.body || {};
  const from = String(body.from || body.sender || '').trim();
  const to = String(body.to || body.receiver || '').trim();
  const text = String(body.text || body.message || '').trim();

  if (!from || !to || !text) {
    return res.status(400).json({ error: 'Invalid message payload' });
  }

  const msgRecord = {
    id: body.id || `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    from,
    to,
    sender: from,
    receiver: to,
    text,
    message: text,
    adId: body.adId ? String(body.adId) : '',
    timestamp: body.timestamp || new Date().toISOString()
  };

  db.messages.push(msgRecord);
  saveDatabase(db);
  res.status(201).json({ success: true, message: msgRecord });
});

// المسارات
app.get('/chat', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'chat.html'));
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});