import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Modal, Dimensions, Linking, TextInput, ScrollView, ActivityIndicator, Animated } from 'react-native';
import MapView, { UrlTile, Circle, Marker } from 'react-native-maps';
import { StatusBar } from 'expo-status-bar';
import * as Location from 'expo-location';
import io from 'socket.io-client';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width, height } = Dimensions.get('window');
const socket = io('https://yeter-app-v1-0.onrender.com');

const CATEGORIES = [
  { id: 'c1', title: 'Sözlü Taciz', icon: '🗣️' },
  { id: 'c2', title: 'Fiziksel Tehdit', icon: '👊' },
  { id: 'c3', title: 'Taşkınlık / Kavga', icon: '🚨' },
  { id: 'c4', title: 'Şüpheli Durum', icon: '⚠️' },
];

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

export default function App() {
  const [isDarkMode, setIsDarkMode] = useState(true);
  
  // --- SPLASH SCREEN STATE ---
  const [showSplash, setShowSplash] = useState(true);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  // --- AUTHENTICATION STATES ---
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userEmail, setUserEmail] = useState(null);
  const [authMode, setAuthMode] = useState('LOGIN');
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');

  // --- PROFILE STATES ---
  const [profileOldPassword, setProfileOldPassword] = useState('');
  const [profileNewPassword, setProfileNewPassword] = useState('');

  // --- DYNAMIC MENU STATE ---
  const [menus, setMenus] = useState({ appMenu: [] });

  const [activeTab, setActiveTab] = useState('MAP'); 

  const [region, setRegion] = useState({ latitude: 41.0082, longitude: 28.9784, latitudeDelta: 0.05, longitudeDelta: 0.05 });
  const [userLocation, setUserLocation] = useState(null);
  const [riskZones, setRiskZones] = useState([]);
  
  const [isDangerAlertVisible, setIsDangerAlertVisible] = useState(false);
  const [reportLocation, setReportLocation] = useState(null);
  
  const [locationSelectModalVisible, setLocationSelectModalVisible] = useState(false);
  const [reportModalVisible, setReportModalVisible] = useState(false);
  
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [isSelectingOnMap, setIsSelectingOnMap] = useState(false);

  const [originText, setOriginText] = useState('Mevcut Konumum');
  const [destinationText, setDestinationText] = useState('');
  
  const [originSuggestions, setOriginSuggestions] = useState([]);
  const [destSuggestions, setDestSuggestions] = useState([]);
  const [originCoords, setOriginCoords] = useState(null); 
  const [destCoords, setDestCoords] = useState(null); 
  const [isSearchingOrigin, setIsSearchingOrigin] = useState(false);
  const [isSearchingDest, setIsSearchingDest] = useState(false);

  const styles = getStyles(isDarkMode);

  const handleAuth = () => {
    if (!emailInput || !passwordInput) {
      alert("Lütfen e-posta ve şifre girin.");
      return;
    }
    if (authMode === 'LOGIN') {
      socket.emit('login', { email: emailInput, password: passwordInput });
    } else {
      socket.emit('register', { email: emailInput, password: passwordInput });
    }
  };

  const searchAddress = async (text, isOrigin) => {
    if (isOrigin) setOriginText(text);
    else setDestinationText(text);
    
    if (text.length < 3) {
      if (isOrigin) setOriginSuggestions([]);
      else setDestSuggestions([]);
      return;
    }

    if (isOrigin) setIsSearchingOrigin(true);
    else setIsSearchingDest(true);

    try {
      const res = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(text)}&limit=4`);
      const data = await res.json();
      
      if (isOrigin) setOriginSuggestions(data.features || []);
      else setDestSuggestions(data.features || []);
    } catch (e) {
      console.log('Adres arama hatası:', e);
    } finally {
      if (isOrigin) setIsSearchingOrigin(false);
      else setIsSearchingDest(false);
    }
  };

  const formatPhotonName = (item) => {
    const p = item.properties;
    let parts = [];
    if (p.name) parts.push(p.name);
    if (p.street && p.street !== p.name) parts.push(p.street);
    if (p.city) parts.push(p.city);
    else if (p.state) parts.push(p.state);
    return parts.join(', ') || 'Bilinmeyen Konum';
  };

  const onSelectSuggestion = (item, isOrigin) => {
    const displayName = formatPhotonName(item);
    const lon = item.geometry.coordinates[0];
    const lat = item.geometry.coordinates[1];

    if (isOrigin) {
      setOriginText(displayName);
      setOriginCoords({ lat, lon });
      setOriginSuggestions([]);
    } else {
      setDestinationText(displayName);
      setDestCoords({ lat, lon });
      setDestSuggestions([]);
    }
  };

  useEffect(() => {
    // Otomatik Giriş Kontrolü
    const checkSavedLogin = async () => {
      try {
        const savedEmail = await AsyncStorage.getItem('userEmail');
        const savedPassword = await AsyncStorage.getItem('userPassword');
        if (savedEmail && savedPassword) {
          socket.emit('login', { email: savedEmail, password: savedPassword });
        }
      } catch (e) {
        console.log("Oto giriş hatası:", e);
      }
    };
    checkSavedLogin();

    socket.on('authSuccess', async (data) => {
      setUserEmail(data.email);
      setIsAuthenticated(true);
      // Sadece manuel girişte inputlar dolu olur, o zaman kaydet
      if (emailInput && passwordInput) {
        try {
          await AsyncStorage.setItem('userEmail', emailInput);
          await AsyncStorage.setItem('userPassword', passwordInput);
        } catch (e) { console.log(e); }
      }
    });

    socket.on('authError', (errorMsg) => {
      alert(errorMsg);
    });

    socket.on('passwordChangeSuccess', async (msg) => {
      alert(msg);
      if (profileNewPassword) {
        try {
          await AsyncStorage.setItem('userPassword', profileNewPassword);
        } catch (e) {}
      }
      setProfileOldPassword('');
      setProfileNewPassword('');
    });

    socket.on('passwordChangeError', (msg) => {
      alert(msg);
    });

    socket.on('accountDeleted', async (msg) => {
      alert(msg);
      setIsAuthenticated(false);
      setUserEmail(null);
      try {
        await AsyncStorage.removeItem('userEmail');
        await AsyncStorage.removeItem('userPassword');
      } catch (e) {}
    });

    socket.on('accountDeleteError', (msg) => {
      alert(msg);
    });

    socket.on('syncMenus', (data) => {
      if (data && data.appMenu) {
        setMenus(data);
      }
    });

    socket.on('syncData', (data) => {
      setRiskZones(data.riskZones);
    });

    (async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;

      Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, distanceInterval: 10 },
        (location) => {
          const coords = { latitude: location.coords.latitude, longitude: location.coords.longitude };
          setUserLocation(coords);

          let inDangerZone = false;
          riskZones.forEach(zone => {
            if (zone.risk === 'ORANGE' || zone.risk === 'RED') {
              if (getDistanceInMeters(coords.latitude, coords.longitude, zone.lat, zone.lng) <= 500) {
                inDangerZone = true;
              }
            }
          });
          setIsDangerAlertVisible(inDangerZone);
        }
      );
    })();

    // Splash Screen Timer
    setTimeout(() => {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 800,
        useNativeDriver: true,
      }).start(() => {
        setShowSplash(false);
      });
    }, 2500);

    return () => {
      socket.off('syncData');
      socket.off('authSuccess');
      socket.off('authError');
      socket.off('passwordChangeSuccess');
      socket.off('passwordChangeError');
      socket.off('accountDeleted');
      socket.off('accountDeleteError');
      socket.off('syncMenus');
    };
  }, [riskZones]);

  const getZoneColor = (risk) => {
    switch (risk) {
      case 'RED': return 'rgba(229, 9, 20, 0.45)';
      case 'ORANGE': return 'rgba(255, 140, 0, 0.35)';
      case 'YELLOW': return 'rgba(255, 215, 0, 0.2)';
      default: return 'transparent';
    }
  };

  const handleMapLongPress = (e) => {
    if (isSelectingOnMap) {
      setReportLocation(e.nativeEvent.coordinate);
      setIsSelectingOnMap(false);
      setReportModalVisible(true);
    }
  };

  const submitReport = () => {
    if (!selectedCategory) return;
    const categoryInfo = CATEGORIES.find(c => c.id === selectedCategory);
    
    socket.emit('newReport', {
      email: userEmail,
      lat: reportLocation.latitude,
      lng: reportLocation.longitude,
      categoryTitle: categoryInfo ? categoryInfo.title : 'Acil Durum'
    });

    setReportModalVisible(false);
    setSelectedCategory(null);
    setReportLocation(null);
  };

  const openGoogleMaps = (type) => {
    if (!destinationText) {
      alert("Lütfen bir varış noktası girin.");
      return;
    }
    
    let finalOrigin = originText;
    let baseLat = 41.0082;
    let baseLng = 28.9784;

    if (originText.toLowerCase() === 'mevcut konumum' && userLocation) {
      finalOrigin = `${userLocation.latitude},${userLocation.longitude}`;
      baseLat = userLocation.latitude;
      baseLng = userLocation.longitude;
    } else if (originCoords) {
      finalOrigin = `${originCoords.lat},${originCoords.lon}`;
      baseLat = originCoords.lat;
      baseLng = originCoords.lon;
    }

    let finalDestination = destinationText;
    if (destCoords) {
      finalDestination = `${destCoords.lat},${destCoords.lon}`;
    }

    let waypoints = '';
    if (type === 'safe') {
      waypoints = `&waypoints=${baseLat - 0.005},${baseLng - 0.005}`;
    } else if (type === 'alt') {
      waypoints = `&waypoints=${baseLat + 0.005},${baseLng + 0.005}`;
    }

    const url = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(finalOrigin)}&destination=${encodeURIComponent(finalDestination)}&travelmode=walking${waypoints}`;
    Linking.openURL(url);
  };

  const ThemeToggleBtn = () => (
    <TouchableOpacity 
      style={styles.themeToggleBtn} 
      onPress={() => setIsDarkMode(!isDarkMode)}
    >
      <Text style={styles.themeToggleText}>{isDarkMode ? '☀️' : '🌙'}</Text>
    </TouchableOpacity>
  );

  const LogoComponent = ({ scale = 1 }) => (
    <View style={{ alignItems: 'center', transform: [{ scale }] }}>
      <View style={styles.logoBox}>
        <Text style={styles.logoText}>YETER</Text>
      </View>
    </View>
  );

  const renderSplashScreen = () => (
    <Animated.View style={[styles.splashScreen, { opacity: fadeAnim }]}>
      <StatusBar style="light" />
      <View style={styles.splashContent}>
        <LogoComponent scale={1.5} />
        <Text style={styles.splashSlogan}>
          "Kaybettiklerimizin anısına,{'\n'}yaşayanların güvenliği için."
        </Text>
      </View>
      <ActivityIndicator size="large" color="#E50914" style={styles.splashLoader} />
    </Animated.View>
  );

  const renderMapScreen = () => (
    <View style={styles.tabContent}>
      <MapView
        style={styles.map}
        initialRegion={region}
        mapType="none"
        showsCompass={false}
        onLongPress={handleMapLongPress}
      >
        <UrlTile 
          urlTemplate={isDarkMode 
            ? "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png" 
            : "https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png"} 
          maximumZ={19} 
          flipY={false} 
        />

        {riskZones.map(zone => (
          <Circle
            key={zone.id}
            center={{ latitude: zone.lat, longitude: zone.lng }}
            radius={zone.radius}
            fillColor={getZoneColor(zone.risk)}
            strokeColor={zone.risk === 'RED' ? 'rgba(229, 9, 20, 0.9)' : 'transparent'}
            strokeWidth={1.5}
          />
        ))}

        {userLocation && (
          <Marker coordinate={userLocation} title="Buradasınız">
            <View style={styles.userDotContainer}>
              <View style={styles.userDotPulse} />
              <View style={styles.userDot} />
            </View>
          </Marker>
        )}

        {reportLocation && <Marker coordinate={reportLocation} title="İhbar Konumu" pinColor="#DC143C" />}
      </MapView>
      
      <ThemeToggleBtn />

      {isDangerAlertVisible && (
        <View style={styles.dangerAlertBanner}>
          <Text style={styles.dangerAlertIcon}>⚠️</Text>
          <View style={{flex:1}}>
            <Text style={styles.dangerAlertTitle}>DİKKAT YÜKSEK RİSK!</Text>
            <Text style={styles.dangerAlertText}>Huzursuz bir bölgeye çok yaklaştınız.</Text>
          </View>
        </View>
      )}

      {isSelectingOnMap && (
        <View style={styles.mapInstructionBanner}>
          <Text style={styles.mapInstructionText}>İhbar noktasını belirlemek için haritaya basılı tutun.</Text>
        </View>
      )}
    </View>
  );

  const renderRouteScreen = () => (
    <View style={styles.tabContent}>
      <ThemeToggleBtn />
      <ScrollView style={styles.routeScreen} contentContainerStyle={{ paddingBottom: 160 }} keyboardShouldPersistTaps="handled">
        <Text style={styles.routeScreenTitle}>Güvenli Rota Oluşturucu</Text>
        <Text style={styles.routeScreenSubtitle}>Gideceğiniz yer için risk faktörlerini hesaplayarak sizin için en uygun alternatifleri çıkarıyoruz.</Text>
        
        <View style={styles.inputCard}>
          <View style={[styles.inputContainer, { zIndex: 2 }]}>
            <Text style={styles.inputLabel}>Nereden Başlıyorsunuz?</Text>
            <View style={styles.inputRow}>
              <TextInput 
                style={styles.textInput} 
                value={originText} 
                onChangeText={(t) => searchAddress(t, true)} 
                placeholderTextColor={isDarkMode ? "#666" : "#A0A0A0"} 
              />
              {isSearchingOrigin && <ActivityIndicator style={styles.inputLoader} color="#E50914" />}
            </View>
            {originSuggestions.length > 0 && (
              <View style={styles.suggestionsContainer}>
                {originSuggestions.map((item, idx) => (
                  <TouchableOpacity key={idx} style={styles.suggestionItem} onPress={() => onSelectSuggestion(item, true)}>
                    <Text style={styles.suggestionText} numberOfLines={1}>{formatPhotonName(item)}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          <View style={[styles.inputContainer, { zIndex: 1, marginBottom: 0 }]}>
            <Text style={styles.inputLabel}>Nereye Gidiyorsunuz?</Text>
            <View style={styles.inputRow}>
              <TextInput 
                style={styles.textInput} 
                value={destinationText} 
                onChangeText={(t) => searchAddress(t, false)} 
                placeholder="Örn: Moda Sahil" 
                placeholderTextColor={isDarkMode ? "#666" : "#A0A0A0"} 
              />
              {isSearchingDest && <ActivityIndicator style={styles.inputLoader} color="#E50914" />}
            </View>
            {destSuggestions.length > 0 && (
              <View style={styles.suggestionsContainer}>
                {destSuggestions.map((item, idx) => (
                  <TouchableOpacity key={idx} style={styles.suggestionItem} onPress={() => onSelectSuggestion(item, false)}>
                    <Text style={styles.suggestionText} numberOfLines={1}>{formatPhotonName(item)}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        </View>

        <View style={styles.optionsContainer}>
          <TouchableOpacity style={styles.routeCardFast} onPress={() => openGoogleMaps('fast')} activeOpacity={0.8}>
            <Text style={styles.routeIcon}>⚡</Text>
            <View style={styles.routeTextContainer}>
              <Text style={styles.routeTitle}>En Hızlı Rota</Text>
              <Text style={styles.routeDesc}>Mesafeyi baz alır. Ana caddeler.</Text>
            </View>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.routeCardSafe} onPress={() => openGoogleMaps('safe')} activeOpacity={0.8}>
            <Text style={styles.routeIcon}>🌊</Text>
            <View style={styles.routeTextContainer}>
              <Text style={styles.routeTitle}>Güvenli Sahil Hattı</Text>
              <Text style={[styles.routeDesc, {color: '#4CAF50'}]}>Aydınlık ve popüler lokasyonlar.</Text>
            </View>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.routeCardAlt} onPress={() => openGoogleMaps('alt')} activeOpacity={0.8}>
            <Text style={styles.routeIcon}>🛡️</Text>
            <View style={styles.routeTextContainer}>
              <Text style={styles.routeTitle}>Alternatif Sokaklar</Text>
              <Text style={[styles.routeDesc, {color: '#0A84FF'}]}>Kırmızı/Riskli bölgeleri dışarıda bırakır.</Text>
            </View>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );

  const handleProfilePasswordChange = () => {
    if (!profileOldPassword || !profileNewPassword) {
      alert("Lütfen mevcut ve yeni şifrenizi girin.");
      return;
    }
    socket.emit('changeMyPassword', { email: userEmail, oldPassword: profileOldPassword, newPassword: profileNewPassword });
  };

  const handleProfileDeleteAccount = () => {
    if (!profileOldPassword) {
      alert("Hesabınızı silmek için güvenlik amacıyla mevcut şifrenizi girmelisiniz.");
      return;
    }
    // React Native'de confirm yerine alert kullanılabilir ama biz UI prototipi için basit emit yapıyoruz
    socket.emit('deleteMyAccount', { email: userEmail, password: profileOldPassword });
  };

  const handleLogout = async () => {
    setIsAuthenticated(false);
    setUserEmail(null);
    setEmailInput('');
    setPasswordInput('');
    try {
      await AsyncStorage.removeItem('userEmail');
      await AsyncStorage.removeItem('userPassword');
    } catch (e) {}
  };

  const renderProfileScreen = () => (
    <View style={styles.tabContent}>
      <ThemeToggleBtn />
      <ScrollView style={styles.routeScreen} contentContainerStyle={{ paddingBottom: 160 }} keyboardShouldPersistTaps="handled">
        <Text style={styles.routeScreenTitle}>Profilim</Text>
        <Text style={styles.routeScreenSubtitle}>Hesap ayarlarınızı buradan yönetebilirsiniz.</Text>
        
        <View style={styles.profileCard}>
          <Text style={styles.profileLabel}>Giriş Yapılan Hesap:</Text>
          <Text style={styles.profileEmail}>{userEmail}</Text>
        </View>

        <View style={styles.inputCard}>
          <Text style={styles.routeTitle}>Şifre Değiştir</Text>
          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>Mevcut Şifre</Text>
            <TextInput style={styles.textInput} value={profileOldPassword} onChangeText={setProfileOldPassword} secureTextEntry placeholderTextColor={isDarkMode ? "#666" : "#A0A0A0"} />
          </View>
          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>Yeni Şifre</Text>
            <TextInput style={styles.textInput} value={profileNewPassword} onChangeText={setProfileNewPassword} secureTextEntry placeholderTextColor={isDarkMode ? "#666" : "#A0A0A0"} />
          </View>
          <TouchableOpacity style={styles.profileSaveBtn} onPress={handleProfilePasswordChange}>
            <Text style={styles.profileSaveBtnText}>Şifreyi Güncelle</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.optionsContainer}>
          <TouchableOpacity style={styles.routeCardFast} onPress={handleLogout} activeOpacity={0.8}>
            <Text style={styles.routeIcon}>🚪</Text>
            <View style={styles.routeTextContainer}>
              <Text style={styles.routeTitle}>Çıkış Yap</Text>
              <Text style={styles.routeDesc}>Oturumunuzu güvenle kapatır.</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.routeCardFast, { borderColor: 'rgba(229, 9, 20, 0.3)' }]} onPress={handleProfileDeleteAccount} activeOpacity={0.8}>
            <Text style={styles.routeIcon}>⚠️</Text>
            <View style={styles.routeTextContainer}>
              <Text style={[styles.routeTitle, { color: '#E50914' }]}>Hesabımı Kalıcı Olarak Sil</Text>
              <Text style={styles.routeDesc}>Bu işlem geri alınamaz. Doğrulamak için üstteki "Mevcut Şifre" alanını doldurun.</Text>
            </View>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );

  const renderAuthScreen = () => (
    <View style={styles.authScreen}>
      <StatusBar style={isDarkMode ? "light" : "dark"} />
      <ThemeToggleBtn />

      <View style={styles.authHeader}>
        <LogoComponent scale={0.8} />
        <Text style={styles.authSlogan}>
          "Kaybettiklerimizin anısına, yaşayanların güvenliği için."
        </Text>
      </View>
      
      <View style={styles.authCard}>
        <Text style={styles.authCardTitle}>{authMode === 'LOGIN' ? 'Giriş Yap' : 'Kayıt Ol'}</Text>
        
        <View style={styles.authInputContainer}>
          <Text style={styles.authInputLabel}>E-Posta Adresi</Text>
          <TextInput 
            style={styles.authInput} 
            placeholder="ornek@posta.com" 
            placeholderTextColor={isDarkMode ? "#555" : "#AAA"} 
            value={emailInput} 
            onChangeText={setEmailInput} 
            keyboardType="email-address"
            autoCapitalize="none"
          />
        </View>

        <View style={styles.authInputContainer}>
          <Text style={styles.authInputLabel}>Şifre</Text>
          <TextInput 
            style={styles.authInput} 
            placeholder="••••••••" 
            placeholderTextColor={isDarkMode ? "#555" : "#AAA"} 
            value={passwordInput} 
            onChangeText={setPasswordInput} 
            secureTextEntry 
          />
        </View>

        <TouchableOpacity style={styles.authButton} onPress={handleAuth} activeOpacity={0.8}>
          <Text style={styles.authButtonText}>{authMode === 'LOGIN' ? 'SİSTEME GİR' : 'HESAP OLUŞTUR'}</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.authSwitchBtn} 
          onPress={() => setAuthMode(authMode === 'LOGIN' ? 'REGISTER' : 'LOGIN')}
        >
          <Text style={styles.authSwitchText}>
            {authMode === 'LOGIN' ? 'Hesabınız yok mu? Kayıt Olun' : 'Zaten hesabınız var mı? Giriş Yapın'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  if (showSplash) {
    return renderSplashScreen();
  }

  if (!isAuthenticated) {
    return renderAuthScreen();
  }

  return (
    <View style={styles.container}>
      <StatusBar style={isDarkMode ? "light" : "dark"} />
      
      {activeTab === 'MAP' && renderMapScreen()}
      {activeTab === 'ROUTE' && renderRouteScreen()}
      {activeTab === 'PROFILE' && renderProfileScreen()}

      <View style={styles.bottomNavContainer}>
        {menus.appMenu && menus.appMenu.filter(m => m.visible).sort((a,b) => a.order - b.order).map((menu, index, array) => {
          const spacerIndex = Math.ceil(array.length / 2);
          return (
            <React.Fragment key={menu.id}>
              {index === spacerIndex && <View style={{width: 60}} />}
              <TouchableOpacity style={[styles.navItem, activeTab === menu.id && styles.navItemActive]} onPress={() => setActiveTab(menu.id)}>
                <Text style={[styles.navIcon, activeTab === menu.id && {color: isDarkMode ? '#FFF' : '#000'}]}>{menu.icon}</Text>
                <Text style={[styles.navText, activeTab === menu.id && {color: isDarkMode ? '#FFF' : '#000', fontWeight: 'bold'}]}>{menu.title}</Text>
              </TouchableOpacity>
            </React.Fragment>
          );
        })}

        {/* Acil İhbar Butonu Daima Sabit ve Ortada */}
        <TouchableOpacity style={styles.centerFab} onPress={() => setLocationSelectModalVisible(true)} activeOpacity={0.9}>
          <View style={styles.centerFabInner}>
            <Text style={styles.centerFabIcon}>🚨</Text>
          </View>
        </TouchableOpacity>
      </View>

      <Modal animationType="fade" transparent={true} visible={locationSelectModalVisible} onRequestClose={() => setLocationSelectModalVisible(false)}>
        <View style={styles.modalOverlayCenter}>
          <TouchableOpacity style={styles.modalDismissArea} onPress={() => setLocationSelectModalVisible(false)} />
          <View style={styles.centerSheet}>
            <Text style={styles.sheetTitleCenter}>İhbar Konumu</Text>
            <TouchableOpacity style={styles.actionBtn} onPress={() => {
              if (!userLocation) { alert("GPS aranıyor..."); return; }
              setReportLocation(userLocation);
              setLocationSelectModalVisible(false);
              setReportModalVisible(true);
            }}>
              <Text style={styles.actionBtnText}>📍 Mevcut Konumumu Bildir</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionBtnOutline} onPress={() => {
              setLocationSelectModalVisible(false);
              setIsSelectingOnMap(true);
              setActiveTab('MAP');
            }}>
              <Text style={styles.actionBtnTextOutline}>🗺️ Haritadan Farklı Yer Seç</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal animationType="slide" transparent={true} visible={reportModalVisible} onRequestClose={() => setReportModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={styles.modalDismissArea} onPress={() => setReportModalVisible(false)} />
          <View style={styles.bottomSheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Acil Durum Bildir</Text>
            <View style={styles.categoryContainer}>
              {CATEGORIES.map((cat) => (
                <TouchableOpacity key={cat.id} style={[styles.categoryCard, selectedCategory === cat.id && styles.categoryCardSelected]} onPress={() => setSelectedCategory(cat.id)}>
                  <Text style={styles.categoryIcon}>{cat.icon}</Text>
                  <Text style={[styles.categoryTitle, selectedCategory === cat.id && styles.categoryTitleSelected]}>{cat.title}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity style={[styles.submitButton, !selectedCategory && styles.submitButtonDisabled]} disabled={!selectedCategory} onPress={submitReport}>
              <Text style={[styles.submitButtonText, !selectedCategory && styles.submitButtonTextDisabled]}>İHBARI ONAYLA</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const getStyles = (isDark) => StyleSheet.create({
  container: { flex: 1, backgroundColor: isDark ? '#0a0a0a' : '#F5F5F7' },
  tabContent: { flex: 1 },
  map: { width: width, height: height },
  userDotContainer: { justifyContent: 'center', alignItems: 'center' },
  userDot: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#0A84FF', borderWidth: 3, borderColor: '#FFFFFF', shadowColor: '#0A84FF', shadowOpacity: 1, shadowRadius: 8, elevation: 6, zIndex: 2 },
  userDotPulse: { position: 'absolute', width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(10, 132, 255, 0.3)', zIndex: 1 },
  
  dangerAlertBanner: { position: 'absolute', top: 90, left: 16, right: 16, backgroundColor: '#E50914', borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'center', shadowColor: '#E50914', shadowOpacity: 0.8, shadowRadius: 20, elevation: 15 },
  dangerAlertIcon: { fontSize: 32, marginRight: 16 },
  dangerAlertTitle: { color: '#FFF', fontSize: 18, fontWeight: '900', letterSpacing: 1 },
  dangerAlertText: { color: '#FFD1D1', fontSize: 13, marginTop: 4 },
  mapInstructionBanner: { position: 'absolute', top: 120, alignSelf: 'center', backgroundColor: isDark ? '#333' : '#FFF', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 10 },
  mapInstructionText: { color: isDark ? 'white' : '#000', fontWeight: 'bold' },

  themeToggleBtn: { position: 'absolute', top: 50, right: 20, width: 44, height: 44, borderRadius: 22, backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : '#FFF', justifyContent: 'center', alignItems: 'center', zIndex: 10, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8, elevation: 5 },
  themeToggleText: { fontSize: 22 },

  // --- LOGO DESIGN ---
  logoBox: {
    borderWidth: 4,
    borderColor: '#9a1321', // Yeni görseldeki koyu/vişne kırmızı tonu
    paddingHorizontal: 25,
    paddingVertical: 10,
    backgroundColor: isDark ? '#111' : '#FFF', // Karanlık modda içi siyah, aydınlıkta beyaz
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  logoText: {
    color: isDark ? '#FFF' : '#000', // Karanlık modda metin beyaz
    fontSize: 54,
    fontWeight: '900',
    letterSpacing: 2,
    fontFamily: 'sans-serif-condensed', // Stencil etkisine en yakın default font
  },

  // --- SPLASH SCREEN ---
  splashScreen: { flex: 1, backgroundColor: '#050505', justifyContent: 'center', alignItems: 'center' },
  splashContent: { alignItems: 'center', marginTop: -50 },
  splashSlogan: { color: '#E5E5E5', fontSize: 16, marginTop: 40, textAlign: 'center', fontStyle: 'italic', letterSpacing: 1, lineHeight: 26, paddingHorizontal: 40 },
  splashLoader: { position: 'absolute', bottom: 100 },

  // Route Screen Styles
  routeScreen: { flex: 1, paddingTop: 100, paddingHorizontal: 24, backgroundColor: isDark ? '#0A0A0A' : '#F5F5F7' },
  routeScreenTitle: { color: isDark ? '#FFF' : '#111', fontSize: 28, fontWeight: '900', marginBottom: 8 },
  routeScreenSubtitle: { color: isDark ? '#888' : '#666', fontSize: 14, marginBottom: 30, lineHeight: 22 },
  inputCard: { backgroundColor: isDark ? '#151515' : '#FFF', borderRadius: 24, padding: 24, borderWidth: 1, borderColor: isDark ? '#222' : '#E5E5EA', marginBottom: 30, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10 },
  inputContainer: { marginBottom: 20 },
  inputLabel: { color: isDark ? '#AAA' : '#555', fontSize: 12, marginBottom: 8, fontWeight: '600', marginLeft: 4 },
  inputRow: { flexDirection: 'row', alignItems: 'center' },
  textInput: { flex: 1, backgroundColor: isDark ? '#222' : '#F2F2F7', color: isDark ? '#FFF' : '#000', borderRadius: 16, paddingHorizontal: 20, paddingVertical: 16, fontSize: 16, borderWidth: 1, borderColor: isDark ? '#333' : '#E5E5EA' },
  inputLoader: { position: 'absolute', right: 15 },
  
  suggestionsContainer: { backgroundColor: isDark ? '#222' : '#FFF', borderRadius: 12, marginTop: 4, borderWidth: 1, borderColor: isDark ? '#333' : '#E5E5EA', maxHeight: 150, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 10 },
  suggestionItem: { padding: 12, borderBottomWidth: 1, borderBottomColor: isDark ? '#333' : '#F2F2F7' },
  suggestionText: { color: isDark ? '#DDD' : '#333', fontSize: 13 },

  optionsContainer: { flex: 1 },
  routeCardFast: { backgroundColor: isDark ? '#151515' : '#FFF', padding: 20, borderRadius: 20, flexDirection: 'row', alignItems: 'center', marginBottom: 12, borderWidth: 1, borderColor: isDark ? '#333' : '#E5E5EA', shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 5 },
  routeCardSafe: { backgroundColor: isDark ? 'rgba(76, 175, 80, 0.1)' : '#E8F5E9', padding: 20, borderRadius: 20, flexDirection: 'row', alignItems: 'center', marginBottom: 12, borderWidth: 1, borderColor: isDark ? 'rgba(76, 175, 80, 0.3)' : '#C8E6C9' },
  routeCardAlt: { backgroundColor: isDark ? 'rgba(10, 132, 255, 0.1)' : '#E3F2FD', padding: 20, borderRadius: 20, flexDirection: 'row', alignItems: 'center', marginBottom: 12, borderWidth: 1, borderColor: isDark ? 'rgba(10, 132, 255, 0.3)' : '#BBDEFB' },
  routeIcon: { fontSize: 32, marginRight: 20 },
  routeTextContainer: { flex: 1 },
  routeTitle: { color: isDark ? '#FFF' : '#111', fontSize: 18, fontWeight: 'bold', marginBottom: 4 },
  routeDesc: { color: isDark ? '#999' : '#666', fontSize: 13 },

  // Profile Styles
  profileCard: { backgroundColor: isDark ? 'rgba(10, 132, 255, 0.1)' : '#E3F2FD', padding: 20, borderRadius: 20, marginBottom: 20, borderWidth: 1, borderColor: isDark ? 'rgba(10, 132, 255, 0.3)' : '#BBDEFB' },
  profileLabel: { color: isDark ? '#888' : '#666', fontSize: 12, textTransform: 'uppercase', marginBottom: 4, fontWeight: 'bold' },
  profileEmail: { color: isDark ? '#FFF' : '#000', fontSize: 20, fontWeight: 'bold' },
  profileSaveBtn: { backgroundColor: '#0A84FF', paddingVertical: 16, borderRadius: 16, alignItems: 'center', marginTop: 10 },
  profileSaveBtnText: { color: '#FFF', fontSize: 16, fontWeight: 'bold' },

  // Auth Screen Styles
  authScreen: { flex: 1, backgroundColor: isDark ? '#0a0a0a' : '#F5F5F7', justifyContent: 'center', paddingHorizontal: 30 },
  authHeader: { alignItems: 'center', marginBottom: 40 },
  authSlogan: { color: isDark ? '#888' : '#555', fontSize: 13, marginTop: 15, fontStyle: 'italic', textAlign: 'center', paddingHorizontal: 20 },
  authCard: { backgroundColor: isDark ? '#151515' : '#FFF', borderRadius: 24, padding: 30, borderWidth: 1, borderColor: isDark ? '#222' : '#E5E5EA', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 15 },
  authCardTitle: { color: isDark ? '#FFF' : '#111', fontSize: 24, fontWeight: 'bold', marginBottom: 30, textAlign: 'center' },
  authInputContainer: { marginBottom: 20 },
  authInputLabel: { color: isDark ? '#888' : '#555', fontSize: 12, fontWeight: '600', marginBottom: 8, marginLeft: 4 },
  authInput: { backgroundColor: isDark ? '#0a0a0a' : '#F2F2F7', color: isDark ? '#FFF' : '#000', borderRadius: 16, paddingHorizontal: 20, paddingVertical: 18, fontSize: 16, borderWidth: 1, borderColor: isDark ? '#333' : '#E5E5EA' },
  authButton: { backgroundColor: '#E50914', paddingVertical: 18, borderRadius: 16, alignItems: 'center', marginTop: 10, shadowColor: '#E50914', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 10, elevation: 8 },
  authButtonText: { color: '#FFF', fontSize: 16, fontWeight: 'bold', letterSpacing: 1 },
  authSwitchBtn: { marginTop: 24, alignItems: 'center' },
  authSwitchText: { color: isDark ? '#888' : '#555', fontSize: 14, textDecorationLine: 'underline' },

  // Floating Bottom Navigation
  bottomNavContainer: {
    position: 'absolute', bottom: 30, left: 24, right: 24, height: 75,
    backgroundColor: isDark ? 'rgba(25, 25, 25, 0.95)' : 'rgba(255, 255, 255, 0.95)', borderRadius: 40,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 30,
    borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
    shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: isDark ? 0.6 : 0.15, shadowRadius: 30, elevation: 20
  },
  navItem: { alignItems: 'center', justifyContent: 'center' },
  navItemActive: { opacity: 1 },
  navIcon: { fontSize: 22, color: isDark ? '#666' : '#999', marginBottom: 4 },
  navText: { color: isDark ? '#666' : '#999', fontSize: 11, fontWeight: '600' },
  
  // Center FAB
  centerFab: {
    width: 80, height: 80, borderRadius: 40, backgroundColor: isDark ? '#0A0A0A' : '#FFF',
    justifyContent: 'center', alignItems: 'center',
    position: 'absolute', left: width/2 - 64, 
    top: -30, 
    shadowColor: '#E50914', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.5, shadowRadius: 15, elevation: 20
  },
  centerFabInner: {
    width: 66, height: 66, borderRadius: 33, backgroundColor: '#E50914',
    justifyContent: 'center', alignItems: 'center', borderWidth: 3, borderColor: isDark ? '#222' : '#FFF'
  },
  centerFabIcon: { fontSize: 28 },

  // Modals
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
  modalOverlayCenter: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', alignItems: 'center' },
  modalDismissArea: { flex: 1, width: '100%' },
  
  centerSheet: { width: '85%', backgroundColor: isDark ? '#1A1A1A' : '#FFF', borderRadius: 24, padding: 24, borderWidth: 1, borderColor: isDark ? '#333' : '#E5E5EA' },
  sheetTitleCenter: { color: isDark ? '#FFF' : '#111', fontSize: 22, fontWeight: 'bold', marginBottom: 24, textAlign: 'center' },
  actionBtn: { backgroundColor: '#0A84FF', paddingVertical: 16, borderRadius: 16, alignItems: 'center', marginBottom: 12 },
  actionBtnText: { color: 'white', fontSize: 16, fontWeight: 'bold' },
  actionBtnOutline: { backgroundColor: 'transparent', paddingVertical: 16, borderRadius: 16, alignItems: 'center', borderWidth: 1, borderColor: isDark ? '#555' : '#CCC' },
  actionBtnTextOutline: { color: isDark ? '#DDD' : '#333', fontSize: 16, fontWeight: 'bold' },

  bottomSheet: { backgroundColor: isDark ? '#1A1A1A' : '#FFF', borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 24, paddingBottom: 40, borderWidth: 1, borderColor: isDark ? '#222' : '#E5E5EA' },
  sheetHandle: { width: 40, height: 5, backgroundColor: isDark ? '#333' : '#DDD', borderRadius: 3, alignSelf: 'center', marginBottom: 24 },
  sheetTitle: { color: isDark ? '#FFF' : '#111', fontSize: 24, fontWeight: 'bold', marginBottom: 24 },
  categoryContainer: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 24 },
  categoryCard: { width: '48%', backgroundColor: isDark ? '#242424' : '#F2F2F7', borderRadius: 20, padding: 20, marginBottom: 16, alignItems: 'center', borderWidth: 1, borderColor: isDark ? '#333' : '#E5E5EA' },
  categoryCardSelected: { backgroundColor: 'rgba(229, 9, 20, 0.15)', borderColor: '#E50914' },
  categoryIcon: { fontSize: 36, marginBottom: 12 },
  categoryTitle: { color: isDark ? '#AAA' : '#666', fontSize: 14, fontWeight: '600' },
  categoryTitleSelected: { color: isDark ? '#FFF' : '#000' },
  submitButton: { backgroundColor: '#E50914', paddingVertical: 18, borderRadius: 16, alignItems: 'center' },
  submitButtonDisabled: { backgroundColor: isDark ? '#2A2A2A' : '#E5E5EA' },
  submitButtonText: { color: '#FFF', fontSize: 16, fontWeight: 'bold', letterSpacing: 2 },
  submitButtonTextDisabled: { color: isDark ? '#555' : '#AAA' },
});
