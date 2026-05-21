const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const USERS_FILE = path.join(__dirname, 'users.json');
const MENUS_FILE = path.join(__dirname, 'menus.json');

let users = [];
let menus = {
  appMenu: [
    { id: 'MAP', title: 'Harita', icon: '🗺️', order: 1, visible: true },
    { id: 'ROUTE', title: 'Rota', icon: '🧭', order: 2, visible: true },
    { id: 'PROFILE', title: 'Profil', icon: '👤', order: 3, visible: true }
  ],
  adminMenu: [
    { id: 'REPORTS', title: 'İhbarlar', icon: '🚨', order: 1, visible: true },
    { id: 'USERS', title: 'Kullanıcılar', icon: '👥', order: 2, visible: true }
  ]
};

if (fs.existsSync(USERS_FILE)) {
  users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
} else {
  users.push({ id: 'admin_1', email: 'admin', password: 'admin', role: 'ADMIN' });
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

const saveUsers = () => {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
};

if (fs.existsSync(MENUS_FILE)) {
  try {
    menus = JSON.parse(fs.readFileSync(MENUS_FILE, 'utf8'));
  } catch(e) {
    console.error('menus.json okunamadı, varsayılan menüler kullanılacak.');
  }
}

const saveMenus = () => {
  fs.writeFileSync(MENUS_FILE, JSON.stringify(menus, null, 2));
};

let riskZones = [];
let reports = [];

const getDistanceInMeters = (lat1, lon1, lat2, lon2) => {
  const R = 6371e3;
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
};

io.on('connection', (socket) => {
  socket.emit('syncData', { riskZones, reports });
  socket.emit('syncMenus', menus);

  socket.on('register', (data) => {
    const exists = users.find(u => u.email === data.email);
    if (exists) {
      socket.emit('authError', 'Bu e-posta adresi zaten kullanımda.');
      return;
    }
    const newUser = { id: Math.random().toString(), email: data.email, password: data.password, role: 'USER' };
    users.push(newUser);
    saveUsers();
    socket.emit('authSuccess', { email: data.email, role: 'USER' });
    io.emit('syncAdminUsers', users);
  });

  socket.on('login', (data) => {
    const user = users.find(u => u.email === data.email && u.password === data.password);
    if (user) {
      socket.emit('authSuccess', { email: data.email, role: user.role });
    } else {
      socket.emit('authError', 'E-Posta veya Şifre hatalı!');
    }
  });

  socket.on('changeMyPassword', (data) => {
    const { email, oldPassword, newPassword } = data;
    const user = users.find(u => u.email === email && u.password === oldPassword);
    if (user) {
      user.password = newPassword;
      saveUsers();
      socket.emit('passwordChangeSuccess', 'Şifreniz başarıyla değiştirildi.');
      io.emit('syncAdminUsers', users);
    } else {
      socket.emit('passwordChangeError', 'Eski şifreniz hatalı.');
    }
  });

  socket.on('deleteMyAccount', (data) => {
    const { email, password } = data;
    const userIndex = users.findIndex(u => u.email === email && u.password === password);
    if (userIndex !== -1) {
      users.splice(userIndex, 1);
      saveUsers();
      socket.emit('accountDeleted', 'Hesabınız kalıcı olarak silindi.');
      io.emit('syncAdminUsers', users);
    } else {
      socket.emit('accountDeleteError', 'Şifreniz hatalı, hesap silinemedi.');
    }
  });

  socket.on('requestAdminUsers', () => {
    socket.emit('syncAdminUsers', users);
  });

  socket.on('updateUserRole', (data) => {
    const { userId, newRole } = data;
    const user = users.find(u => u.id === userId);
    if (user) {
      user.role = newRole;
      saveUsers();
      io.emit('syncAdminUsers', users);
    }
  });

  socket.on('updateUserPassword', (data) => {
    const { userId, newPassword } = data;
    const user = users.find(u => u.id === userId);
    if (user) {
      user.password = newPassword;
      saveUsers();
      io.emit('syncAdminUsers', users);
    }
  });

  socket.on('deleteUser', (userId) => {
    users = users.filter(u => u.id !== userId);
    saveUsers();
    io.emit('syncAdminUsers', users);
  });

  socket.on('updateMenus', (newMenus) => {
    menus = newMenus;
    saveMenus();
    io.emit('syncMenus', menus);
  });

  socket.on('newReport', (data) => {
    const newReport = {
      id: Math.random().toString(),
      type: data.categoryTitle,
      reporter: data.email || 'Anonim',
      lat: data.lat,
      lng: data.lng,
      status: 'OTOMATİK ONAYLANDI',
      time: new Date().toLocaleTimeString(),
      clusterSize: 1,
      risk: 'YELLOW'
    };
    
    let addedToExisting = false;
    for (let i = 0; i < riskZones.length; i++) {
      let zone = riskZones[i];
      let distance = getDistanceInMeters(data.lat, data.lng, zone.lat, zone.lng);
      
      if (distance <= 1000) { 
        zone.count = (zone.count || 1) + 1; 
        if (zone.count >= 15) { zone.risk = 'RED'; } 
        else if (zone.count >= 6) { zone.risk = 'ORANGE'; } 
        else { zone.risk = 'YELLOW'; }
        
        newReport.clusterSize = zone.count;
        newReport.risk = zone.risk;
        addedToExisting = true;
        break;
      }
    }

    if (!addedToExisting) {
      riskZones.push({ id: Math.random().toString(), lat: data.lat, lng: data.lng, risk: 'YELLOW', count: 1, radius: 1000 });
    }

    reports.unshift(newReport);
    if (reports.length > 100) reports.pop();

    io.emit('syncData', { riskZones, reports });
  });
});

const PORT = 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`YETER Merkezi Sunucusu http://0.0.0.0:${PORT} adresinde başladı!`);
});
