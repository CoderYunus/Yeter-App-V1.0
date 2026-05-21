const functions = require("firebase-functions");
const admin = require("firebase-admin");
admin.initializeApp();

const db = admin.firestore();

// 1. Yeni ihbar eklendiğinde Risk Seviyesini (Threshold) hesaplama
exports.onNewReport = functions.firestore
  .document("reports/{reportId}")
  .onCreate(async (snap, context) => {
    const newReport = snap.data();
    const { location, device_id, ip_address } = newReport;
    
    // Son 24 saati al
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    // Firestore'dan son 24 saatteki raporları çek
    const recentReportsSnapshot = await db.collection("reports")
        .where("timestamp", ">=", yesterday)
        .get();

    const uniqueDevices = new Set();
    const uniqueIPs = new Set();
    
    // 1km çapındakileri filtrele
    recentReportsSnapshot.forEach(doc => {
        const report = doc.data();
        if (report.location && report.location.lat && report.location.lng) {
            const dist = getDistanceFromLatLonInKm(
                location.lat, location.lng, 
                report.location.lat, report.location.lng
            );
            if (dist <= 1.0) { // 1 km sınır
                uniqueDevices.add(report.device_id);
                uniqueIPs.add(report.ip_address);
            }
        }
    });

    // Spam Koruması: Eşsiz Cihaz ve IP sayısı
    const validReportsCount = Math.min(uniqueDevices.size, uniqueIPs.size);

    // Eşik Değerleri (Threshold)
    let riskLevel = "GREEN";
    if (validReportsCount >= 1 && validReportsCount <= 5) {
        riskLevel = "YELLOW"; // Gözlem Altında
    } else if (validReportsCount >= 6 && validReportsCount <= 15) {
        riskLevel = "ORANGE"; // Huzursuz
    } else if (validReportsCount > 15) {
        riskLevel = "RED"; // Yüksek Risk
    }

    // Harita için grid tabanlı ID oluştur (veya geohash kullanılır)
    const zoneId = `zone_${Math.floor(location.lat * 100)}_${Math.floor(location.lng * 100)}`;
    await db.collection("risk_zones").doc(zoneId).set({
        center_location: location,
        radius_meters: 1000,
        recent_report_count: validReportsCount,
        risk_level: riskLevel,
        last_updated: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log(`Bölge ${zoneId} güncellendi. Yeni seviye: ${riskLevel} (${validReportsCount} rapor)`);
});

// 2. 48 Saatlik Zaman Aşımı (Decay) - Her saat başı çalışır
exports.decayOldReports = functions.pubsub.schedule('every 1 hours').onRun(async (context) => {
    const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);

    const oldReportsSnapshot = await db.collection("reports")
        .where("timestamp", "<", twoDaysAgo)
        .get();

    const batch = db.batch();
    oldReportsSnapshot.forEach(doc => {
        batch.delete(doc.ref);
    });

    if (!oldReportsSnapshot.empty) {
        await batch.commit();
        console.log(`${oldReportsSnapshot.size} adet süresi dolmuş (48s+) ihbar temizlendi.`);
    }
});

// Haversine Formülü ile mesafe (km)
function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
  const R = 6371; 
  const dLat = deg2rad(lat2-lat1);  
  const dLon = deg2rad(lon2-lon1); 
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * 
    Math.sin(dLon/2) * Math.sin(dLon/2); 
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
  return R * c; 
}
function deg2rad(deg) { return deg * (Math.PI/180); }
