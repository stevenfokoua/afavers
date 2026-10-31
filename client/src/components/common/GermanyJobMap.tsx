import { useEffect, useRef } from 'react';
import 'leaflet/dist/leaflet.css';
import type { Map, CircleMarker } from 'leaflet';

// ── City coordinates [lat, lng] ───────────────────────────────────────────────
const CITY_COORDS: Record<string, [number, number]> = {
  'Düsseldorf':  [51.2217, 6.7762],
  'Koeln':       [50.9333, 6.9578],
  'Köln':        [50.9333, 6.9578],
  'Essen':       [51.4508, 7.0131],
  'Bochum':      [51.4818, 7.2162],
  'Dortmund':    [51.5136, 7.4653],
  'Berlin':      [52.5200, 13.4050],
  'Hamburg':     [53.5753, 10.0153],
  'München':     [48.1351, 11.5820],
  'Munich':      [48.1351, 11.5820],
  'Frankfurt':   [50.1109,  8.6821],
  'Stuttgart':   [48.7758,  9.1829],
  'Hannover':    [52.3759,  9.7320],
  'Leipzig':     [51.3397, 12.3731],
  'Nürnberg':   [49.4521, 11.0771],
  'Bremen':      [53.0793,  8.8017],
  'Köln/Bonn':  [50.9333,  6.9578],
  'Bonn':        [50.7374,  7.0982],
  'Wuppertal':   [51.2562,  7.1888],
  'Bielefeld':   [52.0302,  8.5325],
  'Mannheim':    [49.4875,  8.4660],
  'Karlsruhe':   [49.0069,  8.4037],
  'Münster':    [51.9607,  7.6261],
  'Aachen':      [50.7753,  6.0839],
  'Freiburg':    [47.9990,  7.8421],
  'Kiel':        [54.3233, 10.1228],
  'Rostock':     [54.0887, 12.1405],
  'Dresden':     [51.0504, 13.7373],
  'Magdeburg':   [52.1205, 11.6276],
  'Erfurt':      [50.9848, 11.0299],
};

function findCityCoords(location: string): [number, number] | null {
  if (CITY_COORDS[location]) return CITY_COORDS[location];
  for (const [city, coords] of Object.entries(CITY_COORDS)) {
    if (location.toLowerCase().includes(city.toLowerCase())) return coords;
  }
  return null;
}

// ── Component ─────────────────────────────────────────────────────────────────
interface Props {
  byLocation: { location: string; count: number }[];
  compact?: boolean;
  onCityClick?: (location: string) => void;
}

export const GermanyJobMap = ({ byLocation, compact = false, onCityClick }: Props) => {
  const containerRef  = useRef<HTMLDivElement>(null);
  const mapRef        = useRef<Map | null>(null);
  const markersRef    = useRef<CircleMarker[]>([]);
  const onClickRef    = useRef(onCityClick);
  onClickRef.current  = onCityClick;
  // keep a stable ref to byLocation so effects can read it
  const dataRef = useRef(byLocation);
  dataRef.current = byLocation;

  // Initialise map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const container = containerRef.current;
    let cancelled = false;
    let resizeTimer: ReturnType<typeof setTimeout> | undefined;

    import('leaflet').then((mod) => {
      if (cancelled || mapRef.current || containerRef.current !== container) return;
      const L = mod.default ?? (mod as unknown as typeof import('leaflet'));

      const map = L.map(container, {
        center:            [51.5, 10.0],
        zoom:              compact ? 5 : 6,
        zoomControl:       true,
        dragging:          true,
        scrollWheelZoom:   false,
        doubleClickZoom:   true,
        touchZoom:         true,
        attributionControl: !compact,
      });

      // CartoDB Positron — clean light basemap
      L.tileLayer(
        'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
        {
          attribution: '&copy; <a href="https://carto.com/">CARTO</a> &copy; OSM',
          subdomains: 'abcd',
          maxZoom: 18,
        }
      ).addTo(map);

      mapRef.current = map;
      drawMarkers(L, map, dataRef.current);

      // Ensure map fills container after DOM settles
      resizeTimer = setTimeout(() => { if (!cancelled) map.invalidateSize(); }, 100);
    });

    return () => {
      cancelled = true;
      clearTimeout(resizeTimer);
      mapRef.current?.remove();
      mapRef.current = null;
      markersRef.current = [];
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compact]);

  // Redraw markers whenever data changes
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;
    let cancelled = false;
    import('leaflet').then((mod) => {
      if (cancelled || mapRef.current !== map) return;
      const L = mod.default ?? (mod as unknown as typeof import('leaflet'));
      drawMarkers(L, map, byLocation);
    });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [byLocation]);

  function drawMarkers(
    L: typeof import('leaflet'),
    map: Map,
    data: { location: string; count: number }[]
  ) {
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    if (!data.length) return;
    const maxCount = Math.max(...data.map(l => l.count), 1);

    data.forEach(({ location, count }) => {
      const coords = findCityCoords(location);
      if (!coords) return;

      const ratio  = count / maxCount;
      const radius = compact ? 5 + ratio * 12 : 8 + ratio * 22;

      const marker = L.circleMarker(coords, {
        radius,
        fillColor:   '#16a34a',
        color:       '#fff',
        weight:      2,
        opacity:     0.9,
        fillOpacity: 0.7 + ratio * 0.25,
      });

      const cityName = location.split(/[,/(]/)[0].trim();

      // Popup (full mode: hover; compact mode: click shows brief label)
      marker.bindPopup(
        `<div style="font-family:var(--font-ui),system-ui,sans-serif;cursor:${onClickRef.current ? 'pointer' : 'default'}">
          <p style="font-weight:700;font-size:14px;margin:0 0 2px">${cityName}</p>
          <p style="color:#16a34a;font-weight:600;font-size:13px;margin:0 0 ${onClickRef.current ? '6px' : '0'}">${count} job${count !== 1 ? 's' : ''}</p>
          ${onClickRef.current ? `<p style="font-size:11px;color:#6b7280;margin:0">Click to browse jobs →</p>` : ''}
        </div>`,
        { closeButton: false, offset: [0, -4] }
      );

      if (compact && !onClickRef.current) {
        marker.on('click', () => marker.openPopup());
      } else if (!compact) {
        marker.on('mouseover', () => marker.openPopup());
        marker.on('mouseout',  () => marker.closePopup());
      }

      // Click → navigate to jobs filtered by this city
      if (onClickRef.current) {
        marker.on('click', () => {
          marker.closePopup();
          onClickRef.current!(location);
        });
        // pointer cursor on hover
        marker.on('mouseover', () => {
          (marker.getElement() as HTMLElement | undefined)?.style.setProperty('cursor', 'pointer');
        });
      }

      marker.addTo(map);
      markersRef.current.push(marker);
    });
  }

  return (
    <div
      ref={containerRef}
      style={{ height: compact ? 220 : 420, width: '100%', borderRadius: 6, overflow: 'hidden' }}
    />
  );
};
