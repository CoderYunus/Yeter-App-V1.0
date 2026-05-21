import React, { useState, useEffect } from 'react';
import io from 'socket.io-client';
import './App.css';

const socket = io('http://192.168.0.104:3000');

function App() {
  const [reports, setReports] = useState([]);
  const [riskZones, setRiskZones] = useState([]);
  const [users, setUsers] = useState([]);
  const [menus, setMenus] = useState({ appMenu: [], adminMenu: [] });
  
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const [activeTab, setActiveTab] = useState('REPORTS'); // 'REPORTS' veya 'USERS'

  useEffect(() => {
    socket.on('syncData', (data) => {
      setReports(data.reports);
      setRiskZones(data.riskZones);
    });

    socket.on('syncAdminUsers', (data) => {
      setUsers(data);
    });

    socket.on('syncMenus', (data) => {
      setMenus(data);
    });

    socket.on('authSuccess', (data) => {
      if (data.role === 'ADMIN') {
        setIsAuthenticated(true);
        socket.emit('requestAdminUsers');
        socket.emit('requestMenus');
      } else {
        alert('Erişim Reddedildi! Sadece Yöneticiler (ADMIN) girebilir.');
      }
    });

    socket.on('authError', (errorMsg) => {
      alert('Hatalı Giriş: ' + errorMsg);
    });

    socket.on('passwordChangeSuccess', (msg) => {
      alert(msg);
    });

    socket.on('passwordChangeError', (msg) => {
      alert(msg);
    });

    return () => {
      socket.off('syncData');
      socket.off('syncAdminUsers');
      socket.off('syncMenus');
      socket.off('authSuccess');
      socket.off('authError');
      socket.off('passwordChangeSuccess');
      socket.off('passwordChangeError');
    };
  }, []);

  const handleLogin = (e) => {
    e.preventDefault();
    if (!username || !password) {
      alert('Lütfen e-posta ve şifrenizi girin.');
      return;
    }
    socket.emit('login', { email: username, password: password });
  };

  const handleRoleToggle = (user) => {
    const newRole = user.role === 'ADMIN' ? 'USER' : 'ADMIN';
    if (window.confirm(`${user.email} kullanıcısının yetkisini ${newRole} yapmak istiyor musunuz?`)) {
      socket.emit('updateUserRole', { userId: user.id, newRole });
    }
  };

  const handlePasswordChange = (user) => {
    const newPassword = window.prompt(`${user.email} için yeni şifreyi girin:`, user.password);
    if (newPassword && newPassword !== user.password) {
      socket.emit('updateUserPassword', { userId: user.id, newPassword });
    }
  };

  const handleDeleteUser = (user) => {
    if (window.confirm(`DİKKAT: ${user.email} hesabını kalıcı olarak sistemden silmek istediğinize emin misiniz?`)) {
      socket.emit('deleteUser', user.id);
    }
  };

  const handleMyPasswordChange = () => {
    const oldPassword = window.prompt("Mevcut şifrenizi girin:");
    if (!oldPassword) return;
    const newPassword = window.prompt("Yeni şifrenizi girin:");
    if (!newPassword) return;
    socket.emit('changeMyPassword', { email: username, oldPassword, newPassword });
  };

  const handleLogout = () => {
    if (window.confirm('Sistemden çıkış yapmak istiyor musunuz?')) {
      setIsAuthenticated(false);
      setUsername('');
      setPassword('');
    }
  };

  const renderReportsTab = () => (
    <div className="table-container">
      <table>
        <thead>
          <tr>
            <th>Tip</th>
            <th>Kullanıcı (Reporter)</th>
            <th>Koordinat</th>
            <th>Zaman</th>
            <th>Durum</th>
            <th>Risk Seviyesi</th>
          </tr>
        </thead>
        <tbody>
          {reports.map((report) => (
            <tr key={report.id}>
              <td>{report.type}</td>
              <td style={{ color: '#0A84FF', fontWeight: 'bold' }}>{report.reporter}</td>
              <td>{report.lat.toFixed(4)}, {report.lng.toFixed(4)}</td>
              <td>{report.time}</td>
              <td><span className="status-badge">{report.status}</span></td>
              <td>
                <span className={`risk-badge risk-${report.risk.toLowerCase()}`}>
                  {report.risk === 'RED' ? 'YÜKSEK RİSK (15+)' : report.risk === 'ORANGE' ? 'HUZURSUZ (6-14)' : 'GÖZLEM (1-5)'}
                </span>
              </td>
            </tr>
          ))}
          {reports.length === 0 && (
            <tr>
              <td colSpan="6" style={{ textAlign: 'center', color: '#555' }}>Henüz sistemde hiç ihbar yok.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );

  const renderUsersTab = () => (
    <div className="table-container">
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>E-Posta Adresi</th>
            <th>Şifre</th>
            <th>Yetki (Rol)</th>
            <th>Aksiyonlar</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr key={user.id}>
              <td style={{ color: '#666', fontSize: '12px' }}>{user.id.substring(0,8)}...</td>
              <td style={{ fontWeight: 'bold' }}>{user.email}</td>
              <td style={{ letterSpacing: '2px', color: '#888' }}>••••••••</td>
              <td>
                <span className={`role-badge ${user.role === 'ADMIN' ? 'role-admin' : 'role-user'}`}>
                  {user.role}
                </span>
              </td>
              <td>
                <div className="action-buttons">
                  <button className="btn-action btn-role" onClick={() => handleRoleToggle(user)}>Yetki Değiştir</button>
                  <button className="btn-action btn-pass" onClick={() => handlePasswordChange(user)}>Şifre Değiştir</button>
                  <button className="btn-action btn-delete" onClick={() => handleDeleteUser(user)}>Sil (Banla)</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const renderMenusTab = () => {
    const handleChange = (type, index, field, value) => {
      const updated = { ...menus };
      updated[type][index][field] = value;
      setMenus(updated);
    };

    const handleSaveMenu = () => {
      socket.emit('updateMenus', menus);
      alert('Menü değişiklikleri sunucuya ve uygulamaya anında kaydedildi!');
    };

    const renderMenuGroup = (title, type) => (
      <div className="menu-group">
        <h3 className="menu-group-title">{title}</h3>
        <div className="menu-edit-header">
          <span className="col-icon">İkon</span>
          <span className="col-title">Başlık (Metin)</span>
          <span className="col-order">Sıra</span>
          <span className="col-visible">Göster</span>
        </div>
        {menus[type] && menus[type].sort((a,b) => a.order - b.order).map((m, i) => (
          <div key={m.id} className="menu-edit-row">
            <input className="input-icon" value={m.icon} onChange={e => handleChange(type, i, 'icon', e.target.value)} />
            <input className="input-title" value={m.title} onChange={e => handleChange(type, i, 'title', e.target.value)} />
            <input className="input-order" type="number" value={m.order} onChange={e => handleChange(type, i, 'order', Number(e.target.value))} />
            <label className="input-visible">
              <input type="checkbox" checked={m.visible} onChange={e => handleChange(type, i, 'visible', e.target.checked)} />
            </label>
          </div>
        ))}
      </div>
    );

    return (
      <div className="menu-manager-container">
        {renderMenuGroup('📱 Mobil Uygulama Alt Menüleri', 'appMenu')}
        {renderMenuGroup('💻 Admin Panel Sol Menüleri', 'adminMenu')}
        
        <button className="btn-save-menus" onClick={handleSaveMenu}>
          Tüm Menüleri Kaydet ve Canlıya Al
        </button>
      </div>
    );
  };

  if (!isAuthenticated) {
    return (
      <div className="login-container">
        <div className="login-card">
          <h1>YETER <span>MERKEZ</span></h1>
          <p>Yönetici Paneli Girişi</p>
          <form onSubmit={handleLogin}>
            <input type="email" placeholder="Yönetici E-Posta Adresi" value={username} onChange={(e) => setUsername(e.target.value)} />
            <input type="password" placeholder="Şifre" value={password} onChange={(e) => setPassword(e.target.value)} />
            <button type="submit">SİSTEME GİR</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-container">
      <div className="sidebar">
        <div className="sidebar-header">
          <h2>YETER</h2>
          <span>Admin</span>
        </div>
        
        <ul className="sidebar-menu">
          {menus.adminMenu && menus.adminMenu.filter(m => m.visible).sort((a,b) => a.order - b.order).map(menu => (
            <li key={menu.id} className={activeTab === menu.id ? 'active' : ''} onClick={() => setActiveTab(menu.id)}>
              <span className="icon">{menu.icon}</span> {menu.title}
            </li>
          ))}
          <li className={activeTab === 'MENUS' ? 'active' : ''} onClick={() => setActiveTab('MENUS')}>
            <span className="icon">⚙️</span> Menü Yönetimi
          </li>
        </ul>
        
        <div className="stats-box">
          <div className="stat">
            <label>Aktif Risk Bölgesi</label>
            <div className="value">{riskZones.length}</div>
          </div>
          <div className="stat">
            <label>Sistemdeki Kullanıcı</label>
            <div className="value">{users.length}</div>
          </div>
        </div>

        <div className="sidebar-profile-section">
          <div className="my-profile-info">
            <span className="my-profile-icon">👤</span>
            <div className="my-profile-text">
              <span className="my-profile-email">{username}</span>
              <span className="my-profile-role">ADMIN</span>
            </div>
          </div>
          <div className="my-profile-actions">
            <button className="btn-my-pass" onClick={handleMyPasswordChange}>Şifre Değiştir</button>
            <button className="btn-my-logout" onClick={handleLogout}>Çıkış Yap</button>
          </div>
        </div>
      </div>

      <div className="main-content">
        <div className="main-header">
          <h1>
            {activeTab === 'REPORTS' && 'Canlı İhbarlar'}
            {activeTab === 'USERS' && 'Sistem Kullanıcıları'}
            {activeTab === 'MENUS' && 'Dinamik Menü Yönetimi'}
          </h1>
          <div className="status-badge">🟢 Sistem Aktif</div>
        </div>
        
        <div className="tab-content">
          {activeTab === 'REPORTS' && renderReportsTab()}
          {activeTab === 'USERS' && renderUsersTab()}
          {activeTab === 'MENUS' && renderMenusTab()}
        </div>
      </div>
    </div>
  );
}

export default App;
