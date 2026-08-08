export type GoogleDataFeature = { getProperty(name: string): unknown };
export type GoogleDataMouseEvent = { feature: GoogleDataFeature; latLng: unknown };
export type GoogleMapStyle = Record<string, string | number | boolean>;
export type GoogleDataLayer = {
  addGeoJson(geojson: unknown): unknown;
  addListener(eventName: "click" | "mouseover", handler: (event: GoogleDataMouseEvent) => void): unknown;
  addListener(eventName: "mouseout", handler: () => void): unknown;
  setStyle(style: (feature: GoogleDataFeature) => GoogleMapStyle): void;
};
export type GoogleMapInstance = {
  data: GoogleDataLayer;
  setCenter(center: { lat: number; lng: number }): void;
  setZoom(zoom: number): void;
};
export type GoogleInfoWindow = {
  setContent(content: string): void;
  setPosition(position: unknown): void;
  open(options: { map: GoogleMapInstance; anchor?: GoogleMarker }): void;
  close(): void;
};
export type GoogleMarker = {
  addListener(eventName: "click" | "mouseover" | "mouseout", handler: () => void): unknown;
  setMap(map: GoogleMapInstance | null): void;
};
export type GoogleCircle = {
  addListener(eventName: "click" | "mouseover" | "mouseout", handler: () => void): unknown;
  setMap(map: GoogleMapInstance | null): void;
};
export type GoogleMapsNamespace = {
  Map: new (element: HTMLElement, options: Record<string, unknown>) => GoogleMapInstance;
  InfoWindow: new (options: Record<string, unknown>) => GoogleInfoWindow;
  Marker: new (options: Record<string, unknown>) => GoogleMarker;
  Circle: new (options: Record<string, unknown>) => GoogleCircle;
};

declare global {
  interface Window {
    google?: { maps: GoogleMapsNamespace };
    __borocastGoogleMapsReady?: () => void;
  }
}

let mapsLoader: Promise<GoogleMapsNamespace> | null = null;

export function loadGoogleMaps(apiKey: string) {
  if (window.google?.maps) return Promise.resolve(window.google.maps);
  if (mapsLoader) return mapsLoader;

  mapsLoader = new Promise((resolve, reject) => {
    window.__borocastGoogleMapsReady = () => resolve(window.google!.maps);
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&loading=async&callback=__borocastGoogleMapsReady&v=weekly&auth_referrer_policy=origin`;
    script.async = true;
    script.onerror = () => reject(new Error("Google Maps could not be loaded."));
    document.head.appendChild(script);
  });

  return mapsLoader;
}

export async function getGoogleMaps() {
  const configResponse = await fetch("/api/maps-config", { cache: "no-store" });
  if (!configResponse.ok) throw new Error("Google Maps configuration is unavailable.");
  const config = await configResponse.json() as { apiKey?: string };
  if (!config.apiKey) throw new Error("Google Maps configuration is unavailable.");
  return loadGoogleMaps(config.apiKey);
}

export const BOROCAST_MAP_STYLES = [
  { elementType: "geometry", stylers: [{ color: "#0b203d" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#0b203d" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#8393aa" }] },
  { featureType: "administrative", elementType: "geometry.stroke", stylers: [{ color: "#415674" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#1b3655" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#8191a7" }] },
  { featureType: "transit", elementType: "geometry", stylers: [{ color: "#24425f" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#041229" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#526983" }] },
];
