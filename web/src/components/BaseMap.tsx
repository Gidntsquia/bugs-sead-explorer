import { MapContainer, TileLayer, GeoJSON, Pane } from "react-leaflet";
import { feature } from "topojson-client";
import world from "world-atlas/countries-110m.json";
import type { ReactNode } from "react";

// Country outlines ship with the app and sit underneath the map tiles, so the map still shows land
// when the internet (and the tiles) are unavailable.
const countries = feature(world as any, (world as any).objects.countries) as any;

export function BaseMap({ children, center = [54, 6], zoom = 4, className = "" }: { children?: ReactNode; center?: [number, number]; zoom?: number; className?: string }) {
  return (
    <MapContainer center={center} zoom={zoom} minZoom={2} worldCopyJump preferCanvas className={className}>
      <Pane name="offline-countries" style={{ zIndex: 150 }}>
        <GeoJSON data={countries} style={{ color: "#b8ab94", weight: 0.8, fillColor: "#f1ead9", fillOpacity: 1 }} interactive={false} />
      </Pane>
      <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' maxZoom={18} opacity={0.75} />
      {children}
    </MapContainer>
  );
}
