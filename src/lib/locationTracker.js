// RideTalk — Çevrimdışı GPS Mesafe Ölçümü & Hotspot Menzil Takipçisi
// %100 Çevrimdışı Çalışır (Uydu GPS). Sürücüler arası mesafeyi (metre) hesaplar ve menzil uyarısı verir.

// Haversine Formülü: İki koordinat arası mesafeyi metre cinsinden hesaplar
export function calculateDistanceInMeters(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return null;

  const R = 6371000; // Dünya yarıçapı (metre)
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

export class LocationTracker {
  constructor(onLocationUpdate = null) {
    this.onLocationUpdate = onLocationUpdate;
    this.watchId = null;
    this.currentLocation = null;
    this.peerLocations = new Map(); // peerId -> { lat, lon, speed, accuracy, ts }
    this.warningCooldowns = new Map(); // peerId -> timestamp
  }

  start() {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      console.warn('[LocationTracker] Geolocation bu cihazda desteklenmiyor.');
      return;
    }

    this.watchId = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude, speed, accuracy } = position.coords;
        this.currentLocation = {
          lat: latitude,
          lon: longitude,
          speed: speed ? Math.round(speed * 3.6) : 0, // km/s
          accuracy: Math.round(accuracy || 0),
          ts: Date.now(),
        };

        if (this.onLocationUpdate) {
          this.onLocationUpdate(this.currentLocation);
        }
      },
      (err) => {
        console.warn('[LocationTracker] GPS konumu alınamadı:', err.message);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 3000,
        timeout: 10000,
      }
    );
  }

  updatePeerLocation(peerId, locationData) {
    if (!peerId || !locationData) return null;

    this.peerLocations.set(peerId, {
      ...locationData,
      receivedAt: Date.now(),
    });

    if (this.currentLocation && locationData.lat && locationData.lon) {
      const distance = calculateDistanceInMeters(
        this.currentLocation.lat,
        this.currentLocation.lon,
        locationData.lat,
        locationData.lon
      );
      return distance;
    }
    return null;
  }

  getDistanceToPeer(peerId) {
    const peerLoc = this.peerLocations.get(peerId);
    if (!peerLoc || !this.currentLocation) return null;

    return calculateDistanceInMeters(
      this.currentLocation.lat,
      this.currentLocation.lon,
      peerLoc.lat,
      peerLoc.lon
    );
  }

  // Menzil uyarısı tetikleme kontrolü (Hotspot sınırı ~65m, 25 saniye aralıkla)
  shouldTriggerWarning(peerId, distance, thresholdMeters = 65) {
    if (!distance || distance < thresholdMeters) return false;

    const now = Date.now();
    const lastWarn = this.warningCooldowns.get(peerId) || 0;
    if (now - lastWarn > 25000) {
      this.warningCooldowns.set(peerId, now);
      return true;
    }
    return false;
  }

  removePeer(peerId) {
    this.peerLocations.delete(peerId);
    this.warningCooldowns.delete(peerId);
  }

  destroy() {
    if (this.watchId !== null && typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
    this.peerLocations.clear();
    this.warningCooldowns.clear();
    this.currentLocation = null;
  }
}
