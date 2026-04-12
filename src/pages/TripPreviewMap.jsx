import React, { useState, useEffect, useMemo } from "react";
import {
  APIProvider,
  Map,
  AdvancedMarker,
  useMap,
  useMapsLibrary,
} from "@vis.gl/react-google-maps";
import { getTripHotels } from "../firebase";

// Native Google Polyline Renderer (Vis.gl doesn't use a <Polyline> component, we draw it directly)
const PreviewRoute = ({ path }) => {
  const map = useMap();
  const mapsLib = useMapsLibrary("maps");
  const [polyline, setPolyline] = useState(null);

  // Initialize the line once
  useEffect(() => {
    if (!map || !mapsLib) return;
    const line = new mapsLib.Polyline({
      map,
      strokeColor: "#cdc2eb", // Theme Lavender
      strokeWeight: 3,
      strokeOpacity: 0.8,
    });
    setPolyline(line);
    return () => line.setMap(null);
  }, [map, mapsLib]);

  // Update the path coordinates
  useEffect(() => {
    if (polyline) polyline.setPath(path);
  }, [polyline, path]);

  // Auto-fit the camera to the preview route
  useEffect(() => {
    if (!map || path.length === 0) return;
    const bounds = new window.google.maps.LatLngBounds();
    path.forEach((coord) => bounds.extend(coord));
    map.fitBounds(bounds, { padding: 20 });
  }, [map, mapsLib, path]);

  return null;
};

export default function TripPreviewMap({ tripId }) {
  const [hotels, setHotels] = useState([]);

  useEffect(() => {
    if (!tripId) return;
    getTripHotels(tripId).then(setHotels);
  }, [tripId]);

  // Convert hotel data to exact {lat, lng} objects
  const path = useMemo(
    () => hotels.map((h) => ({ lat: h.lat, lng: h.lng })),
    [hotels],
  );

  // Show your CSS placeholder while data fetches
  if (!tripId || hotels.length === 0) {
    return <div className="map-preview-placeholder" />;
  }

  return (
    <div className="map-preview-container">
      <APIProvider apiKey={import.meta.env.VITE_GOOGLE_MAPS_API_KEY}>
        <Map
          defaultCenter={path[0] || { lat: 41.3275, lng: 19.8187 }}
          defaultZoom={6}
          mapId="PREVIEW_MAP_ID" // Required by Google for AdvancedMarkers
          disableDefaultUI={true}
          gestureHandling="none" // Completely locks the map so it acts like a static image
          keyboardShortcuts={false}
          style={{ width: "100%", height: "100%" }}
        >
          {/* Draw the Route Trail */}
          <PreviewRoute path={path} />

          {/* Minimalist HTML Dots (No more ugly SVGs!) */}
          {path.map((coord, idx) => {
            const isEnd = idx === 0 || idx === path.length - 1;
            return (
              <AdvancedMarker key={idx} position={coord}>
                <div
                  style={{
                    width: isEnd ? 12 : 8,
                    height: isEnd ? 12 : 8,
                    backgroundColor: "#1a1a24",
                    borderRadius: "50%",
                    border: "2px solid #ffffff",
                    boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
                  }}
                />
              </AdvancedMarker>
            );
          })}
        </Map>
      </APIProvider>
    </div>
  );
}
