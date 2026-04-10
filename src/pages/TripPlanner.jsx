import React, { useState, useEffect, useMemo } from "react";
import { renderToString } from "react-dom/server";
import { useParams, Link } from "react-router-dom";
import {
  MapContainer,
  TileLayer,
  Marker,
  Polyline,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import {
  ArrowLeft,
  Plus,
  Map as MapIcon,
  Coffee,
  Bed,
  Flag,
  MapPin,
  Search,
  Edit2,
  Trash2,
  ChevronUp,
  ChevronDown,
  Footprints,
  ExternalLink,
  Info,
  Car,
  MousePointer2,
} from "lucide-react";
import {
  getTrip,
  getStops,
  addStop,
  updateStop,
  deleteStop,
} from "../firebase";

import "leaflet/dist/leaflet.css";

// --- THEME CONSTANTS ---
const COLOR_DRIVE = "#cdc2eb";
const COLOR_WALK = "#bed67d";
const COLOR_ACTIVITY = "#b7c39b";
const COLOR_INFO_PANEL = "#fdfff1";

// --- Instant Rough Estimation Logic ---
const calculateRoughDuration = (start, end, mode) => {
  if (!start || !end || !start.lat || !end.lat) return null;
  const R = 6371;
  const dLat = ((end.lat - start.lat) * Math.PI) / 180;
  const dLon = ((end.lng - start.lng) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((start.lat * Math.PI) / 180) *
      Math.cos((end.lat * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;
  const isWalk = mode === "attraction";
  const windingFactor = isWalk ? 1.2 : 1.5;
  const speedKmH = isWalk ? 4.5 : 40;
  const mins = Math.round(((distance * windingFactor) / speedKmH) * 60);
  if (mins < 1) return "1 min";
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
};

const calculateDistanceRaw = (lat1, lon1, lat2, lon2) => {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const ICON_CONFIG = [
  { id: "map-pin", label: "Point", icon: <MapPin size={20} /> },
  { id: "footprints", label: "Walking", icon: <Footprints size={20} /> },
  { id: "coffee", label: "Food", icon: <Coffee size={20} /> },
  { id: "bed", label: "Hotel", icon: <Bed size={20} /> },
  { id: "flag", label: "Pit Stop", icon: <Flag size={20} /> },
];

const renderIconById = (id, size = 12) => {
  const config = ICON_CONFIG.find((c) => c.id === id) || ICON_CONFIG[0];
  return React.cloneElement(config.icon, { size });
};

const createCustomIcon = (iconId) => {
  const iconHtml = renderToString(renderIconById(iconId, 16));
  return L.divIcon({
    className: "custom-map-marker",
    html: `<div style="display:flex; align-items:center; justify-content:center; width:100%; height:100%; background:${COLOR_ACTIVITY}; color:#fff; border-radius:50%;">${iconHtml}</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
};

function MapUpdater({ mapStops, setIsMapMoving }) {
  const map = useMap();
  const stopsSignature = mapStops.map((s) => s.uniqueKey).join(",");
  useMapEvents({
    movestart: () => setIsMapMoving(true),
    moveend: () => setIsMapMoving(false),
  });
  useEffect(() => {
    if (mapStops.length > 0) {
      const bounds = L.latLngBounds(mapStops.map((s) => [s.lat, s.lng]));
      map.flyToBounds(bounds, {
        paddingBottomRight: [40, window.innerHeight * 0.4],
        maxZoom: 15,
        animate: true,
        duration: 1.2,
      });
    }
  }, [stopsSignature, map]);
  return null;
}

// --- NEW: Map Click Handler Component ---
function MapClickHandler({ isPicking, onPick }) {
  useMapEvents({
    click: async (e) => {
      if (!isPicking) return;
      const { lat, lng } = e.latlng;

      // Optional: Reverse Geocoding to get a name for the pinned spot
      let locationName = "Dropped Pin";
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`,
        );
        const data = await res.json();
        locationName =
          data.name ||
          data.address.road ||
          data.address.suburb ||
          "Dropped Pin";
      } catch (err) {
        console.error("Reverse geocode failed", err);
      }

      onPick(lat, lng, locationName);
    },
  });
  return null;
}

export default function TripPlanner() {
  const { tripId } = useParams();
  const [trip, setTrip] = useState(null);
  const [stops, setStops] = useState([]);
  const [activeDay, setActiveDay] = useState("Overview");
  const [sheetHeight, setSheetHeight] = useState(55);
  const [isDragging, setIsDragging] = useState(false);
  const [isMapMoving, setIsMapMoving] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingStopId, setEditingStopId] = useState(null);
  const [isPickingOnMap, setIsPickingOnMap] = useState(false); // Picking State
  const [inputMode, setInputMode] = useState("search"); // "search" or "picker"

  const [formData, setFormData] = useState({
    name: "",
    type: "main",
    icon: "map-pin",
    day: 1,
    lat: "",
    lng: "",
    desc: "",
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);

  useEffect(() => {
    loadData();
  }, [tripId]);
  const loadData = async () => {
    const t = await getTrip(tripId);
    setTrip(t);
    const s = await getStops(tripId);
    setStops(s);
  };

  const sortedStops = useMemo(
    () =>
      [...stops].sort((a, b) =>
        a.day !== b.day ? a.day - b.day : a.order - b.order,
      ),
    [stops],
  );
  const displayedStops =
    activeDay === "Overview"
      ? sortedStops
      : sortedStops.filter((s) => s.day === parseInt(activeDay));
  const lastDayOfTrip = useMemo(
    () =>
      stops.length === 0 ? 0 : Math.max(...stops.map((s) => Number(s.day))),
    [stops],
  );

  const anchorStop = useMemo(() => {
    if (activeDay === "Overview" || displayedStops.length === 0) return null;
    const firstIdx = sortedStops.findIndex(
      (s) => s.id === displayedStops[0].id,
    );
    for (let i = firstIdx - 1; i >= 0; i--) {
      if (sortedStops[i].icon === "bed") return sortedStops[i];
    }
    return firstIdx > 0 ? sortedStops[firstIdx - 1] : null;
  }, [activeDay, displayedStops, sortedStops]);

  const listItems = useMemo(() => {
    if (activeDay === "Overview")
      return displayedStops.map((s) => ({ ...s, uniqueKey: s.id }));
    let items = displayedStops.map((s) => ({ ...s, uniqueKey: s.id }));
    if (anchorStop)
      items = [
        {
          ...anchorStop,
          isAnchor: true,
          uniqueKey: `anchor-start-${anchorStop.id}`,
        },
        ...items,
      ];
    const isLastDay = Number(activeDay) === lastDayOfTrip;
    if (items.length > 1 && anchorStop && !isLastDay) {
      const lastItem = items[items.length - 1];
      if (lastItem.id !== anchorStop.id) {
        const dist = calculateDistanceRaw(
          lastItem.lat,
          lastItem.lng,
          anchorStop.lat,
          anchorStop.lng,
        );
        if (dist < 50) {
          items.push({
            ...anchorStop,
            isAnchor: true,
            isReturn: true,
            uniqueKey: `anchor-end-${anchorStop.id}`,
          });
        }
      }
    }
    return items;
  }, [activeDay, displayedStops, anchorStop, lastDayOfTrip]);

  const handlePickOnMap = (lat, lng, name) => {
    setFormData({ ...formData, lat, lng, name });
    setIsPickingOnMap(false);
    setIsFormOpen(true); // Re-open the form once location is set
  };

  const handleOpenExternalRoute = () => {
    if (listItems.length < 2) return;
    const isIOS =
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    if (isIOS) {
      const start = `${listItems[0].lat},${listItems[0].lng}`;
      const destParts = listItems
        .slice(1)
        .map((s) => `${s.lat},${s.lng}`)
        .join("+to:");
      window.open(
        `http://maps.apple.com/?saddr=${start}&daddr=${destParts}&dirflg=d`,
        "_blank",
      );
    } else {
      const origin = `${listItems[0].lat},${listItems[0].lng}`;
      const destination = `${listItems[listItems.length - 1].lat},${listItems[listItems.length - 1].lng}`;
      const waypoints = listItems
        .slice(1, -1)
        .map((s) => `${s.lat},${s.lng}`)
        .join("|");
      window.open(
        `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}&waypoints=${waypoints}&travelmode=driving`,
        "_blank",
      );
    }
  };

  const handleMoveStop = async (stop, direction) => {
    const dayStops = stops
      .filter((s) => s.day === stop.day)
      .sort((a, b) => a.order - b.order);
    const idx = dayStops.findIndex((s) => s.id === stop.id);
    const otherIdx = direction === "up" ? idx - 1 : idx + 1;
    if (otherIdx < 0 || otherIdx >= dayStops.length) return;
    const other = dayStops[otherIdx];
    await updateStop(tripId, stop.id, { order: other.order });
    await updateStop(tripId, other.id, { order: stop.order });
    loadData();
  };

  const handleSaveStop = async (e) => {
    e.preventDefault();
    const payload = {
      ...formData,
      lat: parseFloat(formData.lat),
      lng: parseFloat(formData.lng),
      day: parseInt(formData.day),
    };
    if (!editingStopId)
      payload.order = stops.filter((s) => s.day === payload.day).length;
    editingStopId
      ? await updateStop(tripId, editingStopId, payload)
      : await addStop(tripId, payload);
    setIsFormOpen(false);
    loadData();
  };

  useEffect(() => {
    const handleMove = (e) => {
      if (!isDragging) return;
      const clientY = e.type.includes("touch")
        ? e.touches[0].clientY
        : e.clientY;
      const h = ((window.innerHeight - clientY) / window.innerHeight) * 100;
      if (h >= 15 && h <= 90) setSheetHeight(h);
    };
    const handleEnd = () => setIsDragging(false);
    if (isDragging) {
      window.addEventListener("mousemove", handleMove);
      window.addEventListener("mouseup", handleEnd);
      window.addEventListener("touchmove", handleMove, { passive: false });
      window.addEventListener("touchend", handleEnd);
    }
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleEnd);
      window.removeEventListener("touchmove", handleMove);
      window.removeEventListener("touchend", handleEnd);
    };
  }, [isDragging]);

  if (!trip) return null;
  const uniqueDays = [...new Set(stops.map((s) => Number(s.day)))].sort(
    (a, b) => a - b,
  );

  return (
    <div className="planner-layout">
      {isPickingOnMap && (
        <div
          style={{
            position: "absolute",
            top: 80,
            left: 0,
            right: 0,
            zIndex: 2000,
            display: "flex",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              background: "#1a1a24",
              color: "#fff",
              padding: "12px 24px",
              borderRadius: "40px",
              fontSize: "14px",
              fontWeight: "600",
              boxShadow: "0 4px 15px rgba(0,0,0,0.3)",
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <MousePointer2 size={16} /> Tap anywhere to set destination
            <button
              onClick={() => setIsPickingOnMap(false)}
              style={{
                background: "rgba(255,255,255,0.2)",
                border: "none",
                color: "#fff",
                padding: "4px 8px",
                borderRadius: "4px",
                marginLeft: 10,
                fontSize: "11px",
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="map-half">
        <Link
          to="/"
          style={{
            position: "absolute",
            top: 20,
            left: 20,
            zIndex: 1000,
            background: "#fff",
            width: 40,
            height: 40,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: "50%",
            boxShadow: "0 2px 10px rgba(0,0,0,0.1)",
          }}
        >
          <ArrowLeft size={20} />
        </Link>
        <MapContainer
          center={[41.3, 19.8]}
          zoom={8}
          zoomControl={false}
          style={{ height: "100%", width: "100%" }}
        >
          <TileLayer
            url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}"
            className="editorial-map-filter"
          />
          <MapUpdater mapStops={listItems} setIsMapMoving={setIsMapMoving} />
          <MapClickHandler
            isPicking={isPickingOnMap}
            onPick={handlePickOnMap}
          />

          {!isMapMoving &&
            listItems.slice(0, -1).map((cur, i) => {
              const nxt = listItems[i + 1];
              return (
                <Polyline
                  key={i}
                  positions={[
                    [cur.lat, cur.lng],
                    [nxt.lat, nxt.lng],
                  ]}
                  color={
                    nxt.type === "attraction" || nxt.isReturn
                      ? COLOR_WALK
                      : COLOR_DRIVE
                  }
                  weight={3}
                  dashArray="8, 10"
                  opacity={0.8}
                />
              );
            })}
          {listItems.map((stop) => (
            <Marker
              key={stop.uniqueKey}
              position={[stop.lat, stop.lng]}
              icon={createCustomIcon(stop.icon)}
            />
          ))}
        </MapContainer>
      </div>

      <div
        className="bottom-sheet"
        style={{
          height: `${sheetHeight}vh`,
          transition: isDragging ? "none" : "height 0.2s ease-out",
        }}
      >
        <div
          className="sheet-handle-container"
          onMouseDown={() => setIsDragging(true)}
          onTouchStart={() => setIsDragging(true)}
        >
          <div className="sheet-handle"></div>
        </div>
        <div className="sheet-header">
          <h1 style={{ fontSize: "20px", fontWeight: "600", marginBottom: 16 }}>
            {trip.name}
          </h1>
          <div className="day-filters">
            <button
              className={`day-pill ${activeDay === "Overview" ? "active" : ""}`}
              onClick={() => setActiveDay("Overview")}
            >
              Overview
            </button>
            {uniqueDays.map((day) => (
              <button
                key={day}
                className={`day-pill ${activeDay === day ? "active" : ""}`}
                onClick={() => setActiveDay(day)}
              >
                Day {day}
              </button>
            ))}
          </div>
        </div>

        <div className="timeline-container">
          {listItems.map((stop, idx) => {
            const showDayHeader =
              activeDay === "Overview" &&
              (idx === 0 || listItems[idx - 1].day !== stop.day);
            const nextStop = listItems[idx + 1];
            const roughDur = nextStop
              ? calculateRoughDuration(
                  stop,
                  nextStop,
                  nextStop.isReturn ? stop.type : nextStop.type,
                )
              : null;

            return (
              <React.Fragment key={stop.uniqueKey}>
                {showDayHeader && (
                  <div className="day-separator">Day {stop.day}</div>
                )}
                <div
                  className="timeline-item"
                  style={{ opacity: stop.isAnchor ? 0.7 : 1, paddingBottom: 0 }}
                >
                  <div className="timeline-icon">
                    {renderIconById(stop.icon, 14)}
                  </div>
                  <div
                    className="timeline-content"
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <h3
                        style={{
                          fontSize: "15px",
                          fontWeight: "600",
                          margin: 0,
                        }}
                      >
                        {stop.isReturn ? `Return to ${stop.name}` : stop.name}
                      </h3>
                      {stop.desc && (
                        <p
                          style={{
                            fontSize: "12px",
                            color: "#646473",
                            margin: "4px 0 0 0",
                            lineHeight: "1.4",
                          }}
                        >
                          {stop.desc}
                        </p>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: 4, marginLeft: 12 }}>
                      {!stop.isAnchor && (
                        <>
                          {activeDay !== "Overview" && (
                            <div
                              style={{
                                display: "flex",
                                flexDirection: "column",
                              }}
                            >
                              <button
                                onClick={() => handleMoveStop(stop, "up")}
                                style={{
                                  background: "transparent",
                                  border: "none",
                                  color: "#a0a0a0",
                                }}
                              >
                                <ChevronUp size={16} />
                              </button>
                              <button
                                onClick={() => handleMoveStop(stop, "down")}
                                style={{
                                  background: "transparent",
                                  border: "none",
                                  color: "#a0a0a0",
                                }}
                              >
                                <ChevronDown size={16} />
                              </button>
                            </div>
                          )}
                          <button
                            onClick={() => {
                              setFormData({ ...stop });
                              setEditingStopId(stop.id);
                              setIsFormOpen(true);
                            }}
                            style={{
                              background: "transparent",
                              border: "none",
                              color: "#a0a0a0",
                              cursor: "pointer",
                              padding: 4,
                            }}
                          >
                            <Edit2 size={16} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {nextStop && activeDay !== "Overview" && (
                  <div style={{ paddingLeft: "11px", margin: "4px 0" }}>
                    <div
                      style={{
                        borderLeft: `2px dashed ${nextStop.type === "attraction" || nextStop.isReturn ? COLOR_WALK : COLOR_DRIVE}`,
                        paddingLeft: "19px",
                        paddingBottom: "20px",
                        paddingTop: "4px",
                      }}
                    >
                      <button
                        onClick={() =>
                          window.open(
                            `https://www.google.com/maps/dir/?api=1&origin=${stop.lat},${stop.lng}&destination=${nextStop.lat},${nextStop.lng}&travelmode=${nextStop.type === "attraction" || nextStop.isReturn ? "walking" : "driving"}`,
                            "_blank",
                          )
                        }
                        className="info-panel-badge"
                        style={{
                          borderRadius: "20px",
                          padding: "6px 12px",
                          fontSize: "11px",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                          cursor: "pointer",
                        }}
                      >
                        {nextStop.type === "attraction" || nextStop.isReturn ? (
                          <Footprints size={12} color={COLOR_WALK} />
                        ) : (
                          <Car size={12} color={COLOR_DRIVE} />
                        )}
                        <span style={{ fontWeight: "700" }}>~{roughDur}</span>
                        <ExternalLink size={10} style={{ opacity: 0.3 }} />
                      </button>
                    </div>
                  </div>
                )}
              </React.Fragment>
            );
          })}

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "10px",
              marginTop: "20px",
              paddingBottom: "40px",
            }}
          >
            {activeDay !== "Overview" && listItems.length > 1 && (
              <button className="btn-primary" onClick={handleOpenExternalRoute}>
                <MapIcon size={16} /> Open Full Day Route
              </button>
            )}
            <button
              className="btn-primary"
              onClick={() => {
                setFormData({
                  name: "",
                  type: "main",
                  icon: "map-pin",
                  day: activeDay !== "Overview" ? parseInt(activeDay) : 1,
                  lat: "",
                  lng: "",
                  desc: "",
                });
                setEditingStopId(null);
                setInputMode("search"); // Reset to search by default
                setIsFormOpen(true);
              }}
            >
              <Plus size={16} /> Add Location
            </button>
          </div>
        </div>
      </div>

      {isFormOpen && (
        <div className="modal-overlay" onClick={() => setIsFormOpen(false)}>
          <div
            className="modal-content"
            onClick={(e) => e.stopPropagation()}
            style={{ height: "90vh", overflowY: "auto" }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: 24,
              }}
            >
              <h2 style={{ fontSize: "20px" }}>
                {editingStopId ? "Edit" : "Add"}
              </h2>
              {editingStopId && (
                <button
                  onClick={async () => {
                    if (window.confirm("Delete stop?")) {
                      await deleteStop(tripId, editingStopId);
                      setIsFormOpen(false);
                      loadData();
                    }
                  }}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "#e53e3e",
                    cursor: "pointer",
                  }}
                >
                  <Trash2 size={18} />
                </button>
              )}
            </div>
            <form onSubmit={handleSaveStop}>
              <div
                style={{
                  marginBottom: 24,
                  background: "#f8f7fa",
                  padding: 16,
                  borderRadius: 12,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 12,
                  }}
                >
                  <span className="label" style={{ marginBottom: 0 }}>
                    1. Set Location
                  </span>
                  <div
                    style={{
                      display: "flex",
                      background: "#eee",
                      borderRadius: "8px",
                      padding: "2px",
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => setInputMode("search")}
                      style={{
                        border: "none",
                        background:
                          inputMode === "search" ? "#fff" : "transparent",
                        padding: "4px 10px",
                        borderRadius: "6px",
                        fontSize: "11px",
                        fontWeight: "600",
                        cursor: "pointer",
                      }}
                    >
                      Search
                    </button>
                    <button
                      type="button"
                      onClick={() => setInputMode("picker")}
                      style={{
                        border: "none",
                        background:
                          inputMode === "picker" ? "#fff" : "transparent",
                        padding: "4px 10px",
                        borderRadius: "6px",
                        fontSize: "11px",
                        fontWeight: "600",
                        cursor: "pointer",
                      }}
                    >
                      Map Picker
                    </button>
                  </div>
                </div>

                {inputMode === "search" ? (
                  <div style={{ display: "flex", gap: 8 }}>
                    <input
                      className="input-field"
                      style={{ marginBottom: 0 }}
                      placeholder="Search..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={async () => {
                        const res = await fetch(
                          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}`,
                        );
                        setSearchResults(await res.json());
                      }}
                      style={{
                        background: "#1a1a24",
                        color: "#fff",
                        padding: "0 16px",
                        borderRadius: 8,
                      }}
                    >
                      <Search size={18} />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setIsPickingOnMap(true);
                      setIsFormOpen(false);
                    }}
                    style={{
                      width: "100%",
                      background: "#fff",
                      border: "1px solid #ddd",
                      padding: "12px",
                      borderRadius: "8px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 10,
                      fontSize: "14px",
                      fontWeight: "500",
                      cursor: "pointer",
                    }}
                  >
                    <MousePointer2 size={16} />
                    {formData.lat
                      ? `${formData.lat.toFixed(4)}, ${formData.lng.toFixed(4)}`
                      : "Select point on map"}
                  </button>
                )}

                {searchResults.slice(0, 5).map((r) => (
                  <div
                    key={r.place_id}
                    onClick={() => {
                      setFormData({
                        ...formData,
                        name: r.display_name.split(",")[0],
                        lat: parseFloat(r.lat),
                        lng: parseFloat(r.lon),
                      });
                      setSearchResults([]);
                      setSearchQuery("");
                    }}
                    style={{
                      padding: "12px 0",
                      cursor: "pointer",
                      borderBottom: "1px solid #eee",
                      fontSize: "14px",
                    }}
                  >
                    <strong>{r.display_name.split(",")[0]}</strong>
                  </div>
                ))}
              </div>

              <div style={{ marginBottom: 24 }}>
                <span className="label">2. Activity Icon</span>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(5, 1fr)",
                    gap: 8,
                  }}
                >
                  {ICON_CONFIG.map((ic) => (
                    <button
                      type="button"
                      key={ic.id}
                      onClick={() => setFormData({ ...formData, icon: ic.id })}
                      style={{
                        padding: "12px 4px",
                        borderRadius: "10px",
                        border:
                          formData.icon === ic.id
                            ? `2px solid ${COLOR_ACTIVITY}`
                            : "1px solid #eee",
                        background:
                          formData.icon === ic.id ? "#fdfff1" : "#fff",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      {React.cloneElement(ic.icon, {
                        size: 18,
                        color:
                          formData.icon === ic.id ? COLOR_ACTIVITY : "#646473",
                      })}
                      <span style={{ fontSize: "8px", fontWeight: "700" }}>
                        {ic.label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ marginBottom: 24 }}>
                <span className="label">3. Mode</span>
                <div style={{ display: "flex", gap: 12 }}>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, type: "main" })}
                    style={{
                      flex: 1,
                      padding: "14px",
                      borderRadius: "8px",
                      border:
                        formData.type === "main"
                          ? `2px solid ${COLOR_DRIVE}`
                          : "1px solid #eee",
                      background: formData.type === "main" ? "#fdfff1" : "#fff",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 10,
                    }}
                  >
                    <Car size={20} color={COLOR_DRIVE} />
                    <span style={{ fontSize: "14px", fontWeight: "500" }}>
                      Driving
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setFormData({ ...formData, type: "attraction" })
                    }
                    style={{
                      flex: 1,
                      padding: "14px",
                      borderRadius: "8px",
                      border:
                        formData.type === "attraction"
                          ? `2px solid ${COLOR_WALK}`
                          : "1px solid #eee",
                      background:
                        formData.type === "attraction" ? "#fdfff1" : "#fff",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 10,
                    }}
                  >
                    <Footprints size={20} color={COLOR_WALK} />
                    <span style={{ fontSize: "14px", fontWeight: "500" }}>
                      Walking
                    </span>
                  </button>
                </div>
              </div>

              <div className="date-row">
                <div style={{ flex: 1 }}>
                  <span className="label">Name</span>
                  <input
                    className="input-field"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                    required
                  />
                </div>
              </div>
              <div style={{ marginBottom: 24 }}>
                <span className="label">Notes</span>
                <textarea
                  className="input-field"
                  style={{ height: "80px", paddingTop: "12px", resize: "none" }}
                  value={formData.desc}
                  onChange={(e) =>
                    setFormData({ ...formData, desc: e.target.value })
                  }
                  placeholder="Parking info, opening times..."
                />
              </div>
              <button type="submit" className="btn-primary">
                Save Location
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
