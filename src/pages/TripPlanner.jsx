import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from "react";
import { useParams, Link } from "react-router-dom";
import {
  APIProvider,
  Map,
  AdvancedMarker,
  useMap,
  useMapsLibrary,
} from "@vis.gl/react-google-maps";
import {
  ArrowLeft,
  Plus,
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
  Car,
  Landmark,
  Link as LinkIcon,
  Loader2,
  MousePointer2,
  GripVertical,
} from "lucide-react";
import {
  getTrip,
  getStops,
  addStop,
  updateStop,
  deleteStop,
} from "../firebase";

// --- THEME CONSTANTS ---
const COLOR_DRIVE = "#cdc2eb";
const COLOR_WALK = "#bed67d";
const COLOR_ACTIVITY = "#b7c39b";

const ICON_CONFIG = [
  { id: "map-pin", label: "Point", icon: <MapPin size={20} /> },
  { id: "landmark", label: "Attraction", icon: <Landmark size={20} /> },
  { id: "bed", label: "Hotel", icon: <Bed size={20} /> },
  { id: "coffee", label: "Food", icon: <Coffee size={20} /> },
  { id: "footprints", label: "Walking", icon: <Footprints size={20} /> },
  { id: "flag", label: "Pit Stop", icon: <Flag size={20} /> },
];

const renderIconById = (id, size = 12) => {
  const config = ICON_CONFIG.find((c) => c.id === id) || ICON_CONFIG[0];
  return React.cloneElement(config.icon, { size });
};

// --- DURATION CALCULATOR ---
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
  const distance = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const isWalk = mode === "attraction";
  const mins = Math.round(
    ((distance * (isWalk ? 1.2 : 1.5)) / (isWalk ? 4.5 : 40)) * 60,
  );
  if (mins < 1) return "1 min";
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
};

const formatLinkText = (url) => {
  if (!url) return "Link";
  try {
    return new URL(url).hostname.replace("www.", "");
  } catch {
    return "Link";
  }
};

const defaultCenter = { lat: 41.3275, lng: 19.8187 };

// =====================================================================
// NATIVE GOOGLE MAPS CONTROLLERS
// =====================================================================

function MapRouteRenderer({ listItems, activeDay }) {
  const map = useMap();
  const routesLib = useMapsLibrary("routes");
  const mapsLib = useMapsLibrary("maps");
  const [directionsRenderer, setDirectionsRenderer] = useState(null);
  const [overviewPolyline, setOverviewPolyline] = useState(null);

  useEffect(() => {
    if (!map || !routesLib || !mapsLib) return;
    setDirectionsRenderer(
      new routesLib.DirectionsRenderer({
        map,
        suppressMarkers: true,
        preserveViewport: true,
        polylineOptions: {
          strokeColor: COLOR_DRIVE,
          strokeWeight: 5,
          strokeOpacity: 0.8,
        },
      }),
    );
    setOverviewPolyline(
      new mapsLib.Polyline({
        map,
        strokeColor: "#a0a0a0",
        strokeOpacity: 0,
        strokeWeight: 3,
        icons: [
          {
            icon: { path: "M 0,-1 0,1", strokeOpacity: 1, scale: 3 },
            offset: "0",
            repeat: "15px",
          },
        ],
      }),
    );
  }, [map, routesLib, mapsLib]);

  useEffect(() => {
    if (!directionsRenderer || !overviewPolyline || !routesLib) return;

    if (activeDay === "Overview" || listItems.length < 2) {
      directionsRenderer.set("directions", null);
      if (activeDay === "Overview" && listItems.length > 1) {
        overviewPolyline.setPath(
          listItems.map((s) => ({ lat: s.lat, lng: s.lng })),
        );
        overviewPolyline.setMap(map);
      } else {
        overviewPolyline.setMap(null);
      }
      return;
    }

    overviewPolyline.setMap(null);
    const directionsService = new routesLib.DirectionsService();
    directionsService
      .route({
        origin: { lat: listItems[0].lat, lng: listItems[0].lng },
        destination: {
          lat: listItems[listItems.length - 1].lat,
          lng: listItems[listItems.length - 1].lng,
        },
        waypoints: listItems
          .slice(1, -1)
          .slice(0, 10)
          .map((s) => ({
            location: { lat: s.lat, lng: s.lng },
            stopover: true,
          })),
        travelMode: routesLib.TravelMode.DRIVING,
      })
      .then((res) => directionsRenderer.setDirections(res))
      .catch(console.warn);
  }, [
    listItems,
    activeDay,
    directionsRenderer,
    overviewPolyline,
    routesLib,
    map,
  ]);

  useEffect(() => {
    if (!map || listItems.length === 0) return;
    const bounds = new window.google.maps.LatLngBounds();
    listItems.forEach((stop) =>
      bounds.extend({ lat: stop.lat, lng: stop.lng }),
    );
    map.fitBounds(bounds, {
      top: 40,
      right: 40,
      left: 40,
      bottom: window.innerHeight * 0.45,
    });
  }, [map, listItems]);

  return null;
}

function PlaceAutocomplete({ onPlaceSelect }) {
  const inputRef = useRef(null);
  const placesLib = useMapsLibrary("places");

  useEffect(() => {
    if (!placesLib || !inputRef.current) return;
    const autocomplete = new placesLib.Autocomplete(inputRef.current, {
      fields: ["geometry", "name", "formatted_address"],
    });
    const listener = autocomplete.addListener("place_changed", () => {
      onPlaceSelect(autocomplete.getPlace());
    });
    return () => window.google.maps.event.removeListener(listener);
  }, [placesLib, onPlaceSelect]);

  return (
    <input
      ref={inputRef}
      type="text"
      className="input-field"
      style={{ marginBottom: 0, flex: 1 }}
      placeholder="Search hotels, landmarks..."
    />
  );
}

// =====================================================================
// MAIN APP
// =====================================================================

export default function TripPlanner() {
  const { tripId } = useParams();
  const [trip, setTrip] = useState(null);
  const [stops, setStops] = useState([]);
  const [activeDay, setActiveDay] = useState("Overview");
  const [sheetHeight, setSheetHeight] = useState(55);
  const [isDragging, setIsDragging] = useState(false);

  // Modals & States
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingStopId, setEditingStopId] = useState(null);
  const [isPickingOnMap, setIsPickingOnMap] = useState(false);
  const [draggedStopId, setDraggedStopId] = useState(null);

  const [formData, setFormData] = useState({
    name: "",
    type: "main",
    icon: "map-pin",
    day: 1,
    lat: "",
    lng: "",
    desc: "",
    link: "",
  });

  useEffect(() => {
    loadData();
  }, [tripId]);

  const loadData = async () => {
    setTrip(await getTrip(tripId));
    setStops(await getStops(tripId));
  };

  // --- DATE CALCULATOR ---
  const getDateForDay = useCallback(
    (dayNum) => {
      if (!trip || !trip.startDate) return "";
      const d = new Date(trip.startDate);
      if (isNaN(d)) return "";
      d.setDate(d.getDate() + (parseInt(dayNum) - 1));
      return d.toLocaleDateString("en-US", {
        weekday: "long",
        month: "short",
        day: "numeric",
      });
    },
    [trip],
  );

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

  const anchorStop = useMemo(() => {
    if (activeDay === "Overview" || displayedStops.length === 0) return null;
    const firstIdx = sortedStops.findIndex(
      (s) => s.id === displayedStops[0].id,
    );
    for (let i = firstIdx - 1; i >= 0; i--)
      if (sortedStops[i].icon === "bed") return sortedStops[i];
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
    return items;
  }, [activeDay, displayedStops, anchorStop]);

  // --- MAP PICKING LOGIC ---
  const handleMapClick = async (e) => {
    if (!isPickingOnMap || !e.detail.latLng) return;
    const { lat, lng } = e.detail.latLng;
    let locationName = "Pinned Location";

    try {
      const geocoder = new window.google.maps.Geocoder();
      const res = await geocoder.geocode({ location: { lat, lng } });
      if (res.results && res.results.length > 0) {
        locationName =
          res.results[0].address_components[0].short_name ||
          res.results[0].formatted_address.split(",")[0];
      }
    } catch (err) {
      console.warn("Geocoding failed", err);
    }

    setFormData((prev) => ({ ...prev, lat, lng, name: locationName }));
    setIsPickingOnMap(false);
    setIsFormOpen(true);
  };

  const handlePlaceSelect = useCallback((place) => {
    if (!place.geometry) return;
    setFormData((prev) => ({
      ...prev,
      name: place.name || place.formatted_address,
      lat: place.geometry.location.lat(),
      lng: place.geometry.location.lng(),
    }));
  }, []);

  const handleSaveStop = async (e) => {
    e.preventDefault();
    if (!formData.lat || !formData.lng)
      return alert("Please select a place from the Google search or map.");
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

  // --- DRAG AND DROP LOGIC ---
  const handleDragStart = (e, id) => {
    setDraggedStopId(id);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", id);
  };

  const handleDragOver = (e) => {
    e.preventDefault(); // Necessary to allow dropping
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = async (e, targetId) => {
    e.preventDefault();
    if (!draggedStopId || draggedStopId === targetId) {
      setDraggedStopId(null);
      return;
    }

    const dayStops = stops
      .filter((s) => s.day === parseInt(activeDay))
      .sort((a, b) => a.order - b.order);
    const draggedIdx = dayStops.findIndex((s) => s.id === draggedStopId);
    const targetIdx = dayStops.findIndex((s) => s.id === targetId);

    if (draggedIdx === -1 || targetIdx === -1) {
      setDraggedStopId(null);
      return;
    }

    const newStops = [...dayStops];
    const [draggedItem] = newStops.splice(draggedIdx, 1);
    newStops.splice(targetIdx, 0, draggedItem);

    // Batch update the new order indices
    const updates = newStops.map((s, index) =>
      updateStop(tripId, s.id, { order: index }),
    );
    await Promise.all(updates);
    loadData();
    setDraggedStopId(null);
  };

  // Bottom Sheet Drag
  useEffect(() => {
    const handleMove = (e) => {
      if (!isDragging) return;
      const clientY = e.type.includes("touch")
        ? e.touches[0].clientY
        : e.clientY;
      const h = ((window.innerHeight - clientY) / window.innerHeight) * 100;
      if (h >= 15 && h <= 90) setSheetHeight(h);
    };
    if (isDragging) {
      window.addEventListener("mousemove", handleMove);
      window.addEventListener("mouseup", () => setIsDragging(false));
      window.addEventListener("touchmove", handleMove, { passive: false });
      window.addEventListener("touchend", () => setIsDragging(false));
    }
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", () => setIsDragging(false));
      window.removeEventListener("touchmove", handleMove);
      window.removeEventListener("touchend", () => setIsDragging(false));
    };
  }, [isDragging]);

  if (!trip)
    return (
      <div
        style={{
          display: "flex",
          height: "100vh",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <Loader2 className="animate-spin" size={40} />
      </div>
    );
  const uniqueDays = [...new Set(stops.map((s) => Number(s.day)))].sort(
    (a, b) => a - b,
  );

  return (
    <div className="planner-layout">
      {/* Map Picking Banner */}
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
            <MousePointer2 size={16} /> Tap map to pin location
            <button
              onClick={() => {
                setIsPickingOnMap(false);
                setIsFormOpen(true);
              }}
              style={{
                background: "rgba(255,255,255,0.2)",
                border: "none",
                color: "#fff",
                padding: "4px 8px",
                borderRadius: "4px",
                marginLeft: 10,
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* --- GOOGLE MAP CORE --- */}
      <APIProvider apiKey={import.meta.env.VITE_GOOGLE_MAPS_API_KEY}>
        <div className="map-half">
          <Link
            to="/"
            style={{
              position: "absolute",
              top: 20,
              left: 20,
              zIndex: 10,
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
          <Map
            defaultCenter={defaultCenter}
            defaultZoom={8}
            mapId="DEMO_MAP_ID"
            gestureHandling="greedy"
            disableDefaultUI={true}
            style={{ width: "100%", height: "100%" }}
            onClick={handleMapClick}
          >
            <MapRouteRenderer listItems={listItems} activeDay={activeDay} />

            {listItems.map((stop) => (
              <AdvancedMarker
                key={stop.uniqueKey}
                position={{ lat: stop.lat, lng: stop.lng }}
                title={stop.name}
              >
                <div
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: "50%",
                    border: "2px solid white",
                    backgroundColor:
                      stop.icon === "bed" ? COLOR_ACTIVITY : "#1a1a24",
                    color: "white",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: "0 4px 10px rgba(0,0,0,0.3)",
                  }}
                >
                  {renderIconById(stop.icon, 16)}
                </div>
              </AdvancedMarker>
            ))}
          </Map>
        </div>

        {/* --- BOTTOM SHEET --- */}
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
            <h1
              style={{
                fontSize: "20px",
                fontWeight: "600",
                margin: "0 0 16px 0",
              }}
            >
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
            {/* The Current Date Header (Only shows in specific day view) */}
            {activeDay !== "Overview" && trip.startDate && (
              <div style={{ marginBottom: "24px" }}>
                <h2
                  style={{
                    fontSize: "18px",
                    fontWeight: "600",
                    margin: "0 0 6px 0",
                    color: "#1a1a24",
                  }}
                >
                  {getDateForDay(activeDay)}
                </h2>
                <div
                  style={{
                    height: "3px",
                    width: "32px",
                    background: COLOR_ACTIVITY,
                    borderRadius: "2px",
                  }}
                ></div>
              </div>
            )}

            {listItems.map((stop, idx) => {
              const showDayHeader =
                activeDay === "Overview" &&
                (idx === 0 || listItems[idx - 1].day !== stop.day);
              const nextStop = listItems[idx + 1];
              const roughDur = nextStop
                ? calculateRoughDuration(stop, nextStop, nextStop.type)
                : null;

              const isDraggable = activeDay !== "Overview" && !stop.isAnchor;

              return (
                <React.Fragment key={stop.uniqueKey}>
                  {showDayHeader && (
                    <div className="day-separator">
                      Day {stop.day}
                      <span
                        style={{
                          fontWeight: "500",
                          opacity: 0.5,
                          marginLeft: 6,
                        }}
                      >
                        • {getDateForDay(stop.day)}
                      </span>
                    </div>
                  )}

                  <div
                    className="timeline-item"
                    draggable={isDraggable}
                    onDragStart={(e) => handleDragStart(e, stop.id)}
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, stop.id)}
                    onDragEnd={() => setDraggedStopId(null)}
                    style={{
                      opacity: stop.isAnchor
                        ? 0.7
                        : draggedStopId === stop.id
                          ? 0.4
                          : 1,
                      transition: "opacity 0.2s",
                    }}
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
                          {stop.isAnchor
                            ? `Start from: ${stop.name}`
                            : stop.name}
                        </h3>
                        {stop.desc && (
                          <p
                            style={{
                              fontSize: "12px",
                              color: "#646473",
                              margin: "4px 0 0 0",
                            }}
                          >
                            {stop.desc}
                          </p>
                        )}

                        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                          <button
                            onClick={() =>
                              window.open(
                                `https://www.google.com/maps/search/?api=1&query=$${stop.lat},${stop.lng}`,
                                "_blank",
                              )
                            }
                            style={{
                              background: "#f0f0f5",
                              border: "none",
                              padding: "4px 8px",
                              borderRadius: 6,
                              fontSize: 11,
                              display: "flex",
                              alignItems: "center",
                              gap: 4,
                              cursor: "pointer",
                            }}
                          >
                            <Search size={12} /> Map
                          </button>
                          {stop.link && (
                            <button
                              onClick={() => window.open(stop.link, "_blank")}
                              style={{
                                background: "#e8f4ff",
                                color: "#007aff",
                                border: "none",
                                padding: "4px 8px",
                                borderRadius: 6,
                                fontSize: 11,
                                display: "flex",
                                alignItems: "center",
                                gap: 4,
                                fontWeight: "600",
                                cursor: "pointer",
                              }}
                            >
                              <LinkIcon size={12} /> {formatLinkText(stop.link)}
                            </button>
                          )}
                        </div>
                      </div>

                      {!stop.isAnchor && (
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 4,
                            marginLeft: 12,
                          }}
                        >
                          <button
                            onClick={() => {
                              setFormData({ ...stop });
                              setEditingStopId(stop.id);
                              setIsFormOpen(true);
                            }}
                            style={{
                              color: "#a0a0a0",
                              background: "none",
                              border: "none",
                              cursor: "pointer",
                              padding: 4,
                            }}
                          >
                            <Edit2 size={16} />
                          </button>

                          {activeDay !== "Overview" && (
                            <>
                              {/* Mobile Fallback Buttons */}
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
                                    cursor: "pointer",
                                    height: 16,
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
                                    cursor: "pointer",
                                    height: 16,
                                  }}
                                >
                                  <ChevronDown size={16} />
                                </button>
                              </div>
                              {/* Desktop Drag Handle */}
                              <div
                                style={{
                                  color: "#d0d0d0",
                                  cursor: "grab",
                                  padding: 4,
                                }}
                              >
                                <GripVertical size={16} />
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {nextStop && activeDay !== "Overview" && (
                    <div style={{ paddingLeft: "11px", margin: "0" }}>
                      <div
                        style={{
                          borderLeft: `2px dashed ${nextStop.type === "attraction" ? COLOR_WALK : COLOR_DRIVE}`,
                          paddingLeft: "19px",
                          paddingBottom: "24px",
                          paddingTop: "8px",
                        }}
                      >
                        <button
                          onClick={() =>
                            window.open(
                              `https://www.google.com/maps/dir/?api=1&origin=$${stop.lat},${stop.lng}&destination=${nextStop.lat},${nextStop.lng}&travelmode=${nextStop.type === "attraction" ? "walking" : "driving"}`,
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
                            border: "none",
                          }}
                        >
                          {nextStop.type === "attraction" ? (
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
            <div style={{ marginTop: "10px", paddingBottom: "40px" }}>
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
                    link: "",
                  });
                  setEditingStopId(null);
                  setIsFormOpen(true);
                }}
              >
                <Plus size={16} /> Add Location
              </button>
            </div>
          </div>
        </div>

        {/* --- FORM MODAL --- */}
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
                  marginBottom: 20,
                }}
              >
                <h2>{editingStopId ? "Update Stop" : "Add Location"}</h2>
                {editingStopId && (
                  <button
                    type="button"
                    onClick={() =>
                      deleteStop(tripId, editingStopId).then(() => {
                        setIsFormOpen(false);
                        loadData();
                      })
                    }
                    style={{
                      color: "red",
                      border: "none",
                      background: "none",
                      cursor: "pointer",
                    }}
                  >
                    <Trash2 size={20} />
                  </button>
                )}
              </div>

              <form onSubmit={handleSaveStop}>
                <div
                  style={{
                    background: "#f8f9fa",
                    padding: 16,
                    borderRadius: 12,
                    marginBottom: 20,
                    border: "1px solid #eee",
                  }}
                >
                  <span className="label">1. Find Location</span>

                  <div
                    style={{ display: "flex", gap: 8, alignItems: "center" }}
                  >
                    <PlaceAutocomplete onPlaceSelect={handlePlaceSelect} />
                    <button
                      type="button"
                      onClick={() => {
                        setIsPickingOnMap(true);
                        setIsFormOpen(false);
                      }}
                      style={{
                        background: "#fff",
                        border: "1px solid #ccc",
                        padding: "0 12px",
                        height: "44px",
                        borderRadius: 8,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        marginBottom: 8,
                      }}
                      title="Pick on map"
                    >
                      <MousePointer2 size={18} color="#1a1a24" />
                    </button>
                  </div>

                  {formData.lat && (
                    <div
                      style={{
                        fontSize: 11,
                        color: "#4caf50",
                        fontWeight: 600,
                      }}
                    >
                      ✓ Coordinates locked
                    </div>
                  )}
                </div>

                <div style={{ marginBottom: 20 }}>
                  <span className="label">
                    2. Booking / Info Link (Optional)
                  </span>
                  <input
                    className="input-field"
                    placeholder="https://booking.com/..."
                    value={formData.link || ""}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, link: e.target.value }))
                    }
                  />
                </div>

                <div style={{ marginBottom: 20 }}>
                  <span className="label">3. Activity Icon</span>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(6, 1fr)",
                      gap: 8,
                    }}
                  >
                    {ICON_CONFIG.map((ic) => (
                      <button
                        type="button"
                        key={ic.id}
                        onClick={() =>
                          setFormData((prev) => ({ ...prev, icon: ic.id }))
                        }
                        style={{
                          padding: 10,
                          borderRadius: 8,
                          border:
                            formData.icon === ic.id
                              ? "2px solid #1a1a24"
                              : "1px solid #eee",
                          background: "#fff",
                          cursor: "pointer",
                        }}
                      >
                        {renderIconById(ic.id, 18)}
                      </button>
                    ))}
                  </div>
                </div>

                <div style={{ marginBottom: 20 }}>
                  <span className="label">4. Mode</span>
                  <div style={{ display: "flex", gap: 12 }}>
                    <button
                      type="button"
                      onClick={() =>
                        setFormData((prev) => ({ ...prev, type: "main" }))
                      }
                      style={{
                        flex: 1,
                        padding: "14px",
                        borderRadius: "8px",
                        border:
                          formData.type === "main"
                            ? `2px solid ${COLOR_DRIVE}`
                            : "1px solid #eee",
                        background:
                          formData.type === "main" ? "#fdfff1" : "#fff",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 10,
                        cursor: "pointer",
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
                        setFormData((prev) => ({ ...prev, type: "attraction" }))
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
                        cursor: "pointer",
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
                    <span className="label">Display Name</span>
                    <input
                      className="input-field"
                      value={formData.name}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          name: e.target.value,
                        }))
                      }
                      required
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <span className="label">Day of Trip</span>
                    <input
                      type="number"
                      min="1"
                      className="input-field"
                      value={formData.day}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          day: e.target.value,
                        }))
                      }
                      required
                    />
                  </div>
                </div>

                <div style={{ marginBottom: 24 }}>
                  <span className="label">Notes</span>
                  <textarea
                    className="input-field"
                    style={{
                      height: "80px",
                      paddingTop: "12px",
                      resize: "none",
                    }}
                    value={formData.desc}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, desc: e.target.value }))
                    }
                  />
                </div>
                <button type="submit" className="btn-primary">
                  Save to Itinerary
                </button>
              </form>
            </div>
          </div>
        )}
      </APIProvider>
    </div>
  );
}
