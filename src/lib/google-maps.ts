// Lightweight Google Maps JS API loader (singleton)
// Falls back to Leaflet/OpenStreetMap if no valid authorized Google Maps API key is available,
// or if Google Maps fails authentication (e.g. RefererNotAllowedMapError).

let loaderPromise: Promise<any> | null = null;
let provider: "google" | "leaflet" | null = null;

// Restricted Lovable fallback key that is blocked on non-lovable domains (ais-dev-*.run.app)
const RESTRICTED_FALLBACK_KEY = "AIzaSyBmvJph4LmrbtW7skeczzpBIyb9WWzFKo4";

export function getMapProvider(): "google" | "leaflet" | null {
  return provider;
}

// Hook gm_authFailure early to suppress broken key popups and fallback seamlessly
if (typeof window !== "undefined") {
  const originalAuthFailure = (window as any).gm_authFailure;
  (window as any).gm_authFailure = () => {
    console.warn("Google Maps authorization failed (RefererNotAllowedMapError); falling back to Leaflet/OpenStreetMap");
    provider = "leaflet";
    if (typeof originalAuthFailure === "function") {
      try {
        originalAuthFailure();
      } catch {}
    }
    // Remove error overlays injected by Google Maps
    const errorContainers = document.querySelectorAll(".gm-err-container, .gm-err-content, .dismissButton");
    errorContainers.forEach((el) => {
      el.closest(".gm-err-container")?.remove();
      el.remove();
    });
  };
}

export function loadGoogleMaps(): Promise<any> {
  if (typeof window === "undefined") return Promise.reject(new Error("SSR"));
  if ((window as any).google?.maps) {
    provider = "google";
    return Promise.resolve((window as any).google);
  }
  if (loaderPromise) return loaderPromise;

  const rawKey =
    typeof import.meta !== "undefined" && import.meta.env
      ? ((import.meta.env["VITE_GOOGLE_MAPS_API_KEY"] as string | undefined) ||
         (import.meta.env["VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY"] as string | undefined))
      : undefined;

  // If no key or if the key is the restricted Lovable domain key that fails on AI Studio / custom domains:
  const isKeyValidForDomain = Boolean(rawKey && rawKey !== RESTRICTED_FALLBACK_KEY);

  if (!isKeyValidForDomain) {
    loaderPromise = loadLeafletFallback();
    return loaderPromise;
  }

  const key = rawKey!;
  const channel =
    typeof import.meta !== "undefined" && import.meta.env
      ? (import.meta.env["VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_TRACKING_ID"] as string | undefined)
      : undefined;

  loaderPromise = new Promise((resolve, reject) => {
    const cbName = `__gmInit_${Date.now()}`;
    let settled = false;

    const fallback = () => {
      if (settled) return;
      settled = true;
      delete (window as any)[cbName];
      loadLeafletFallback().then(resolve).catch(reject);
    };

    const timeout = setTimeout(fallback, 4000);

    (window as any).gm_authFailure = () => {
      console.warn("Google Maps auth failure callback fired; falling back to Leaflet");
      fallback();
    };

    (window as any)[cbName] = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      provider = "google";
      resolve((window as any).google);
      delete (window as any)[cbName];
    };

    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${key}&loading=async&callback=${cbName}&language=ar&region=IQ${channel ? `&channel=${channel}` : ""}`;
    s.async = true;
    s.defer = true;
    s.onerror = () => {
      fallback();
    };
    document.head.appendChild(s);
  });

  return loaderPromise;
}

async function loadLeafletFallback(): Promise<any> {
  if (typeof document === "undefined") return Promise.reject(new Error("SSR"));

  if (!document.querySelector('link[href*="leaflet"]')) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    document.head.appendChild(link);
  }

  if ((window as any).L) {
    provider = "leaflet";
    return createLeafletAdapter((window as any).L);
  }

  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    s.async = true;
    s.onload = () => {
      provider = "leaflet";
      resolve(createLeafletAdapter((window as any).L));
    };
    s.onerror = () => {
      loaderPromise = null;
      reject(new Error("Failed to load map"));
    };
    document.head.appendChild(s);
  });
}

function createLeafletAdapter(L: any): any {
  class Point {
    constructor(
      public x: number,
      public y: number,
    ) {}
  }
  class Size {
    constructor(
      public width: number,
      public height: number,
    ) {}
  }
  class LatLng {
    constructor(
      public _lat: number,
      public _lng: number,
    ) {}
    lat() {
      return this._lat;
    }
    lng() {
      return this._lng;
    }
  }

  const adapter = {
    maps: {
      Point,
      Size,
      LatLng,
      Animation: {
        DROP: 1,
        BOUNCE: 2,
      },
      SymbolPath: {
        CIRCLE: 0,
        FORWARD_CLOSED_ARROW: 1,
        BACKWARD_CLOSED_ARROW: 2,
      },
      Map: class {
        constructor(el: HTMLElement, opts: any) {
          const lat =
            typeof opts.center?.lat === "function" ? opts.center.lat() : opts.center?.lat ?? 33.3152;
          const lng =
            typeof opts.center?.lng === "function" ? opts.center.lng() : opts.center?.lng ?? 44.3661;
          const map = L.map(el, {
            center: [lat, lng],
            zoom: opts.zoom || 14,
            zoomControl: opts.zoomControl !== false,
            attributionControl: false,
          });
          L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            maxZoom: 19,
          }).addTo(map);
          this._map = map;
          this._listeners = {};
        }
        _map: any;
        _listeners: Record<string, Function[]>;
        getCenter() {
          const c = this._map.getCenter();
          return {
            lat: () => c.lat,
            lng: () => c.lng,
            _lat: c.lat,
            _lng: c.lng,
          };
        }
        panTo(pos: any) {
          if (!pos) return;
          const lat = typeof pos.lat === "function" ? pos.lat() : pos.lat;
          const lng = typeof pos.lng === "function" ? pos.lng() : pos.lng;
          this._map.panTo([lat, lng]);
        }
        setZoom(z: number) {
          this._map.setZoom(z);
        }
        fitBounds(bounds: any, padding?: number | [number, number] | any) {
          try {
            const sw = bounds.getSouthWest();
            const ne = bounds.getNorthEast();
            const swLat = typeof sw.lat === "function" ? sw.lat() : sw.lat;
            const swLng = typeof sw.lng === "function" ? sw.lng() : sw.lng;
            const neLat = typeof ne.lat === "function" ? ne.lat() : ne.lat;
            const neLng = typeof ne.lng === "function" ? ne.lng() : ne.lng;
            const b = L.latLngBounds([
              [swLat, swLng],
              [neLat, neLng],
            ]);
            const padVal = typeof padding === "number" ? [padding, padding] : [50, 50];
            this._map.fitBounds(b, { padding: padVal });
          } catch {}
        }
        addListener(event: string, cb: Function) {
          if (event === "click") {
            const wrapped = (e: any) => {
              cb({
                latLng: {
                  lat: () => e.latlng.lat,
                  lng: () => e.latlng.lng,
                },
              });
            };
            this._map.on("click", wrapped);
            return;
          }
          const leafletEvent = event === "idle" ? "moveend" : event;
          this._map.on(leafletEvent, cb);
          if (!this._listeners[leafletEvent]) this._listeners[leafletEvent] = [];
          this._listeners[leafletEvent].push(cb);
        }
      },
      Marker: class {
        constructor(opts: any) {
          const lat =
            typeof opts.position?.lat === "function" ? opts.position.lat() : opts.position?.lat ?? 33.3152;
          const lng =
            typeof opts.position?.lng === "function" ? opts.position.lng() : opts.position?.lng ?? 44.3661;
          const map = opts.map?._map || opts.map;
          const isDraggable = Boolean(opts.draggable);

          const marker = L.marker([lat, lng], {
            draggable: isDraggable,
            title: opts.title || "",
            icon: L.divIcon({
              className: "custom-leaflet-marker",
              html: '<div style="width:24px;height:24px;background:#0ea5e9;border:3px solid white;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,0.35);"></div>',
              iconSize: [24, 24],
              iconAnchor: [12, 12],
            }),
          });
          if (map) marker.addTo(map);
          this._marker = marker;
          if (opts.icon) this.setIcon(opts.icon);
        }
        _marker: any;
        addListener(event: string, cb: Function) {
          if (event === "dragend") {
            this._marker.on("dragend", () => {
              cb();
            });
            return;
          }
          this._marker.on(event, cb);
        }
        setPosition(pos: any) {
          if (!pos) return;
          const lat = typeof pos.lat === "function" ? pos.lat() : pos.lat;
          const lng = typeof pos.lng === "function" ? pos.lng() : pos.lng;
          this._marker.setLatLng([lat, lng]);
        }
        getPosition() {
          const ll = this._marker.getLatLng();
          return {
            lat: () => ll.lat,
            lng: () => ll.lng,
          };
        }
        setMap(map: any) {
          if (!map) {
            this._marker?.remove?.();
          } else {
            this._marker?.addTo?.(map._map || map);
          }
        }
        setIcon(icon: any) {
          if (!icon) return;
          const color = icon.fillColor || "#0ea5e9";
          const rotation = icon.rotation || 0;
          let innerHtml = "";
          if (icon.path === 1 || rotation) {
            innerHtml = `<div style="transform: rotate(${rotation}deg); transform-origin: center; display: flex; align-items: center; justify-content: center; width: 34px; height: 34px; font-size: 20px; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));">🚕</div>`;
          } else if (color === "#e11d48") {
            innerHtml = `<div style="display: flex; align-items: center; justify-content: center; width: 30px; height: 30px; background: #e11d48; border: 2.5px solid white; border-radius: 50%; box-shadow: 0 3px 8px rgba(0,0,0,0.35); font-size: 14px; color: white;">📍</div>`;
          } else {
            innerHtml = `<div style="display: flex; align-items: center; justify-content: center; width: 26px; height: 26px; background: ${color}; border: 2.5px solid white; border-radius: 50%; box-shadow: 0 2px 6px rgba(0,0,0,0.3);"></div>`;
          }
          this._marker.setIcon(
            L.divIcon({
              className: "custom-leaflet-marker",
              html: innerHtml,
              iconSize: [34, 34],
              iconAnchor: [17, 17],
            }),
          );
        }
        getIcon() {
          return {};
        }
      },
      Polyline: class {
        constructor(opts: any) {
          const rawPath = opts.path || [];
          const latlngs = rawPath.map((p: any) => [
            typeof p.lat === "function" ? p.lat() : p.lat,
            typeof p.lng === "function" ? p.lng() : p.lng,
          ]);
          this._line = L.polyline(latlngs, {
            color: opts.strokeColor || "#0284c7",
            weight: opts.strokeWeight || 4,
            opacity: opts.strokeOpacity || 0.85,
          });
          const map = opts.map?._map || opts.map;
          if (map) this._line.addTo(map);
        }
        _line: any;
        setPath(path: any[]) {
          const latlngs = (path || []).map((p: any) => [
            typeof p.lat === "function" ? p.lat() : p.lat,
            typeof p.lng === "function" ? p.lng() : p.lng,
          ]);
          this._line.setLatLngs(latlngs);
        }
        setMap(map: any) {
          if (!map) {
            this._line?.remove?.();
          } else {
            this._line?.addTo?.(map._map || map);
          }
        }
      },
      LatLngBounds: class {
        constructor() {
          this._points = [];
        }
        _points: any[];
        extend(pos: any) {
          if (!pos) return;
          const lat = typeof pos.lat === "function" ? pos.lat() : pos.lat;
          const lng = typeof pos.lng === "function" ? pos.lng() : pos.lng;
          this._points.push([lat, lng]);
        }
        getSouthWest() {
          if (!this._points.length) return { lat: () => 33.3, lng: () => 44.3 };
          const minLat = Math.min(...this._points.map((p) => p[0]));
          const minLng = Math.min(...this._points.map((p) => p[1]));
          return { lat: () => minLat, lng: () => minLng };
        }
        getNorthEast() {
          if (!this._points.length) return { lat: () => 33.4, lng: () => 44.4 };
          const maxLat = Math.max(...this._points.map((p) => p[0]));
          const maxLng = Math.max(...this._points.map((p) => p[1]));
          return { lat: () => maxLat, lng: () => maxLng };
        }
      },
      Geocoder: class {
        geocode(req: any, cb: Function) {
          const lat =
            typeof req.location?.lat === "function" ? req.location.lat() : req.location?.lat;
          const lng =
            typeof req.location?.lng === "function" ? req.location.lng() : req.location?.lng;
          fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=ar`,
          )
            .then((r) => r.json())
            .then((data) => {
              if (data?.display_name) {
                cb([{ formatted_address: data.display_name }], "OK");
              } else {
                cb(null, "ZERO_RESULTS");
              }
            })
            .catch(() => cb(null, "ERROR"));
        }
      },
      places: {
        AutocompleteService: class {
          getPlacePredictions(req: any, cb: Function) {
            fetch(
              `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(req.input)}&countrycodes=iq&accept-language=ar&limit=6`,
            )
              .then((r) => r.json())
              .then((data) => {
                cb(
                  (data || []).map((d: any) => ({
                    place_id: d.place_id?.toString() || d.osm_id?.toString(),
                    description: d.display_name,
                    structured_formatting: {
                      main_text: d.name || d.display_name?.split(",")[0] || "",
                      secondary_text:
                        d.display_name?.split(",").slice(1).join(",").trim() || "",
                    },
                  })),
                  "OK",
                );
              })
              .catch(() => cb([], "ERROR"));
          }
        },
        AutocompleteSessionToken: class {},
        PlacesService: class {
          constructor(_map: any) {}
          getDetails(req: any, cb: Function) {
            fetch(
              `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(req.placeId)}&accept-language=ar&limit=1`,
            )
              .then((r) => r.json())
              .then((data) => {
                if (data && data[0]) {
                  cb(
                    {
                      geometry: {
                        location: {
                          lat: () => parseFloat(data[0].lat),
                          lng: () => parseFloat(data[0].lon),
                        },
                      },
                      formatted_address: data[0].display_name,
                      name: data[0].name || data[0].display_name?.split(",")[0],
                    },
                    "OK",
                  );
                } else {
                  cb(null, "ZERO_RESULTS");
                }
              })
              .catch(() => cb(null, "ERROR"));
          }
        },
      },
    },
  };
  (window as any).google = adapter;
  return adapter;
}
