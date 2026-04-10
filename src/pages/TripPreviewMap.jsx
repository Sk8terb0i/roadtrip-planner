import React, { useState, useEffect, useMemo } from "react";
import { renderToString } from "react-dom/server";
import {
  MapContainer,
  TileLayer,
  Marker,
  Polyline,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import { Bed } from "lucide-react";
import { getTripHotels } from "../firebase";
import "leaflet/dist/leaflet.css";

// Reuse the Bed Icon styling with custom text
const createHotelPreviewIcon = (text) => {
  const iconHtml = renderToString(
    <div style={{ position: "relative", width: "24px", height: "24px" }}>
      <div
        style={{
          width: "24px",
          height: "24px",
          background: "#1a1a24",
          borderRadius: "50%",
          border: "2px solid #fff",
          boxShadow: "0 2px 6px rgba(0,0,0,0.15)",
          color: "#fff",
          fontSize: "11px",
          fontWeight: "700",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 2,
          position: "relative",
        }}
      >
        {text}
      </div>
      <Bed
        style={{
          position: "absolute",
          left: "-1px",
          bottom: "-4px",
          opacity: 0.15,
          zIndex: 1,
        }}
        size={16}
      />
    </div>,
  );
  return L.divIcon({
    className: "custom-map-marker",
    html: `<div style="display:flex; align-items:center; justify-content:center; width:100%; height:100%;">${iconHtml}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
};

function MapUpdater({ hotels }) {
  const map = useMap();
  useEffect(() => {
    if (hotels.length > 0) {
      const bounds = L.latLngBounds(hotels.map((h) => [h.lat, h.lng]));
      map.flyToBounds(bounds, {
        padding: [10, 10],
        maxZoom: 8,
        animate: true,
        duration: 1.0,
      });
    }
  }, [hotels, map]);
  return null;
}

export default function TripPreviewMap({ tripId }) {
  const [hotels, setHotels] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadHotels = async () => {
      const fetchedHotels = await getTripHotels(tripId);
      setHotels(fetchedHotels);
      setIsLoading(false);
    };
    loadHotels();
  }, [tripId]);

  const simplifiedPath = useMemo(() => {
    if (hotels.length < 2) return [];
    return hotels.map((h) => [h.lat, h.lng]);
  }, [hotels]);

  if (isLoading)
    return (
      <div
        className="map-preview-container"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#f5f5f7",
        }}
      ></div>
    );

  // Default center for preview if no route data
  const center =
    hotels.length > 0 ? [hotels[0].lat, hotels[0].lng] : [41.3275, 19.8187];

  return (
    <div className="map-preview-container">
      <MapContainer
        center={center}
        zoom={5} // default zoom
        zoomControl={false}
        dragging={false}
        scrollWheelZoom={false}
        doubleClickZoom={false}
        touchZoom={false}
        style={{ height: "100%", width: "100%", zIndex: 1 }}
      >
        <TileLayer
          url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}"
          attribution="&copy; Esri, HERE, Garmin, FAO, NOAA, USGS"
          className="editorial-map-filter"
        />
        <MapUpdater hotels={hotels} />

        {simplifiedPath.length > 0 && (
          <Polyline
            positions={simplifiedPath}
            color="#646473" // Dashed gray like overview
            weight={2}
            dashArray="6, 8"
            opacity={0.6}
          />
        )}

        {hotels.map((hotel) => (
          <Marker
            key={hotel.id}
            position={[hotel.lat, hotel.lng]}
            icon={createHotelPreviewIcon(hotel.name.charAt(0))}
          />
        ))}
      </MapContainer>
    </div>
  );
}
