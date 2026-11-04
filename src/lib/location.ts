export type Coordinates = { lat: number; lng: number };

export function getCurrentLocation(geolocation: Pick<Geolocation, "getCurrentPosition">): Promise<Coordinates> {
  return new Promise((resolve, reject) => {
    const success = (position: GeolocationPosition) => resolve({ lat: position.coords.latitude, lng: position.coords.longitude });
    geolocation.getCurrentPosition(success, (error) => {
      if (error.code === 1) return reject(error);
      geolocation.getCurrentPosition(success, reject, { enableHighAccuracy: false, timeout: 15000, maximumAge: 30000 });
    }, { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 });
  });
}

export function locationError(error: { code?: number }) {
  if (error.code === 1) return "اسمح بالوصول للموقع من إعدادات المتصفح، ثم حاول مرة ثانية.";
  if (error.code === 3) return "تأخر تحديد موقعك؛ فعّل GPS وحاول مرة ثانية.";
  return "تعذّر تحديد موقعك؛ فعّل خدمات الموقع وحاول مرة ثانية.";
}