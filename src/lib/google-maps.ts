// Lightweight Google Maps JS API loader (singleton)
// Falls back to Leaflet/OpenStreetMap if no API key is available.

let loaderPromise: Promise<any> | null = null;
let provider: "google" | "leaflet" | null = null;

export function getMapProvider(): "google" | "leaflet" | null {
  return provider;
}

export function loadGoogleMaps(): Promise<any> {
  if (typeof window === "undefined") return Promise.reject(new Error("SSR"));
  if ((window as any).google?.maps) {
    provider = "google";
    return Promise.resolve((window as any).google);
  }
  if (loaderPromise) return loaderPromise;

  const key =
    (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined) ||
    (import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY as string | undefined);
  const channel = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_TRACKING_ID as string | undefined;

  if (!key) {
    loaderPromise = loadLeafletFallback();
    return loaderPromise;
  }

  loaderPromise = new Promise((resolve, reject) => {
    const cbName = `__gmInit_${Date.now()}`;
    let settled = false;

    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      delete (window as any)[cbName];
      loadLeafletFallback().then(resolve).catch(reject);
    }, 6000);

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
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      loaderPromise = null;
      loadLeafletFallback().then(resolve).catch(reject);
    };
    document.head.appendChild(s);
  });

  return loaderPromise;
}

async function loadLeafletFallback(): Promise<any> {
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
  const adapter = {
    maps: {
      Map: class {
        constructor(el: HTMLElement, opts: any) {
          const map = L.map(el, {
            center: opts.center ? [opts.center.lat, opts.center.lng] : [33.3152, 44.3661],
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
          return { lat: c.lat, lng: c.lng };
        }
        panTo(pos: any) {
          this._map.panTo([pos.lat, pos.lng]);
        }
        setZoom(z: number) {
          this._map.setZoom(z);
        }
        fitBounds(bounds: any, padding?: number) {
          const b = L.latLngBounds([
            [bounds.getSouthWest().lat(), bounds.getSouthWest().lng()],
            [bounds.getNorthEast().lat(), bounds.getNorthEast().lng()],
          ]);
          this._map.fitBounds(b, { padding: padding ? [padding, padding] : undefined });
        }
        addListener(event: string, cb: Function) {
          const leafletEvent = event === "idle" ? "moveend" : event;
          this._map.on(leafletEvent, cb);
          if (!this._listeners[leafletEvent]) this._listeners[leafletEvent] = [];
          this._listeners[leafletEvent].push(cb);
        }
      },
      Marker: class {
        constructor(opts: any) {
          this._marker = L.marker([opts.position.lat, opts.position.lng], {
            icon: L.divIcon({
              className: "custom-marker",
              html: '<div style="width:20px;height:20px;background:#0ea5e9;border:2px solid white;border-radius:50%;"></div>',
              iconSize: [20, 20],
            }),
          }).addTo(opts.map?._map || opts.map);
        }
        _marker: any;
        addListener(event: string, cb: Function) {
          this._marker.on(event, cb);
        }
        setPosition(pos: any) {
          this._marker.setLatLng([pos.lat, pos.lng]);
        }
        getPosition() {
          const ll = this._marker.getLatLng();
          return { lat: () => ll.lat, lng: () => ll.lng };
        }
        setMap(map: any) {
          if (!map) (this as any)._marker?.remove?.();
        }
        setIcon(icon: any) {}
        getIcon() {
          return {};
        }
      },
      Polyline: class {
        constructor(opts: any) {
          this._line = L.polyline([], {
            color: opts.strokeColor || "#0284c7",
            weight: opts.strokeWeight || 3,
            opacity: opts.strokeOpacity || 0.5,
          }).addTo(opts.map?._map || opts.map);
        }
        _line: any;
        setPath(path: any[]) {
          this._line.setLatLngs(path.map((p) => [p.lat, p.lng]));
        }
        setMap(map: any) {
          if (!map) (this as any)._line?.remove?.();
        }
      },
      Geocoder: class {
        geocode(req: any, cb: Function) {
          fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${req.location.lat}&lon=${req.location.lng}&accept-language=ar`
          )
            .then((r) => r.json())
            .then((data) => {
              cb([{ formatted_address: data.display_name }], "OK");
            })
            .catch(() => cb(null, "ERROR"));
        }
      },
      places: {
        AutocompleteService: class {
          getPlacePredictions(req: any, cb: Function) {
            fetch(
              `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(req.input)}&countrycodes=iq&accept-language=ar&limit=6`
            )
              .then((r) => r.json())
              .then((data) => {
                cb(
                  (data || []).map((d: any) => ({
                    place_id: d.place_id?.toString() || d.osm_id?.toString(),
                    description: d.display_name,
                    structured_formatting: {
                      main_text: d.name || d.display_name?.split(",")[0] || "",
                      secondary_text: d.display_name?.split(",").slice(1).join(",").trim() || "",
                    },
                  })),
                  "OK"
                );
              })
              .catch(() => cb([], "ERROR"));
          }
        },
        AutocompleteSessionToken: class {},
        PlacesService: class {
          constructor(map: any) {}
          getDetails(req: any, cb: Function) {
            fetch(
              `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(req.placeId)}&accept-language=ar&limit=1`
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
                    "OK"
                  );
                } else {
                  cb(null, "ZERO_RESULTS");
                }
              })
              .catch(() => cb(null, "ERROR"));
          }
        },
      },
      SymbolPath: {
        FORWARD_CLOSED_ARROW: 1,
        CIRCLE: 0,
      },
      LatLngBounds: class {
        constructor() {
          this._bounds = L.latLngBounds([]);
        }
        _bounds: any;
        extend(pos: any) {
          this._bounds.extend([pos.lat, pos.lng]);
        }
        getSouthWest() {
          const sw = this._bounds.getSouthWest();
          return { lat: () => sw.lat, lng: () => sw.lng };
        }
        getNorthEast() {
          const ne = this._bounds.getNorthEast();
          return { lat: () => ne.lat, lng: () => ne.lng };
        }
      },
    },
  };
  (window as any).google = adapter;
  return adapter;
}
