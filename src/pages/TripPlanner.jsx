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
// Retained for the modal selection buttons
const COLOR_DRIVE = "#9b8ce3";
const COLOR_WALK = "#98c962";
const COLOR_ACTIVITY = "#b7c39b";

// --- DYNAMIC GRADIENT CALCULATOR ---
// This smoothly scales the color from light (Day 1) to dark (Final Day)
const getDynamicColor = (day, totalDays, hue, sat, minL, maxL) => {
  if (totalDays <= 1) return `hsl(${hue}, ${sat}%, ${(minL + maxL) / 2}%)`;
  const safeDay = Math.min(Math.max(1, day), totalDays);
  const ratio = (safeDay - 1) / (totalDays - 1);
  const l = maxL - ratio * (maxL - minL);
  return `hsl(${hue}, ${sat}%, ${l}%)`;
};

// Lavender: hue 248. Goes from 92% (bright) down to 60% (dark purple)
const getLavender = (day, totalDays) =>
  getDynamicColor(day, totalDays, 248, 85, 60, 92);
// Pistachio: hue 82. Goes from 88% (bright) down to 40% (dark green)
const getPistachio = (day, totalDays) =>
  getDynamicColor(day, totalDays, 82, 65, 40, 88);

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
// NATIVE GOOGLE MAPS CONTROLLERS (100% Loop-Free Manual Drawing)
// =====================================================================

function MapRouteRenderer({
  listItems,
  activeDay,
  onLegsCalculated,
  totalDays,
}) {
  const map = useMap();
  const routesLib = useMapsLibrary("routes");
  const mapsLib = useMapsLibrary("maps");

  const overviewPolylinesRef = useRef([]);
  const activePolylineRef = useRef(null);

  // Initialize the manual Day View line once
  useEffect(() => {
    if (!map || !mapsLib) return;
    activePolylineRef.current = new mapsLib.Polyline({
      map: null,
      strokeOpacity: 0.9,
      strokeWeight: 7,
    });
    return () => {
      if (activePolylineRef.current) activePolylineRef.current.setMap(null);
    };
  }, [map, mapsLib]);

  useEffect(() => {
    if (!routesLib || !mapsLib || !map || !activePolylineRef.current) return;

    // Wipe previous renders clean
    overviewPolylinesRef.current.forEach((p) => p.setMap(null));
    overviewPolylinesRef.current = [];
    activePolylineRef.current.setMap(null);
    onLegsCalculated([]);

    if (activeDay === "Overview" || listItems.length < 2) {
      if (activeDay === "Overview" && listItems.length > 1) {
        const days = [...new Set(listItems.map((s) => s.day))];
        const newPolylines = [];

        days.forEach((day, index) => {
          const dayStops = listItems.filter((s) => s.day === day);

          // Connect to the first stop of the next day so the line is continuous
          const nextDayStops = listItems.filter(
            (s) => s.day === days[index + 1],
          );
          if (nextDayStops.length > 0) {
            dayStops.push(nextDayStops[0]);
          }

          if (dayStops.length > 1) {
            const line = new mapsLib.Polyline({
              map,
              path: dayStops.map((s) => ({ lat: s.lat, lng: s.lng })),
              strokeColor: getLavender(day, totalDays),
              strokeOpacity: 0.9,
              strokeWeight: 4,
              icons: [
                {
                  icon: { path: "M 0,-1 0,1", strokeOpacity: 1, scale: 3 },
                  offset: "0",
                  repeat: "15px",
                },
              ],
            });
            newPolylines.push(line);
          }
        });
        overviewPolylinesRef.current = newPolylines;
      }
      return;
    }

    // --- DAY VIEW MANAUL ROUTE DRAWING ---
    const activeColor = getLavender(parseInt(activeDay), totalDays);
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
      .then((res) => {
        if (res.routes[0]) {
          // Extract exact path points natively so Google doesn't hijack camera
          const fullPath = [];
          res.routes[0].legs.forEach((leg) => {
            leg.steps.forEach((step) => {
              step.path.forEach((pt) =>
                fullPath.push({ lat: pt.lat(), lng: pt.lng() }),
              );
            });
          });

          activePolylineRef.current.setPath(fullPath);
          activePolylineRef.current.setOptions({ strokeColor: activeColor });
          activePolylineRef.current.setMap(map);

          if (res.routes[0].legs) {
            onLegsCalculated(
              res.routes[0].legs.map((leg) => leg.duration.text),
            );
          }
        }
      })
      .catch(console.warn);

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listItems, activeDay, routesLib, mapsLib, map, totalDays]);

  // Handle safe zooming
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
  const [routeLegs, setRouteLegs] = useState([]);

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

  const handleLegsCalculated = useCallback((newLegs) => {
    setRouteLegs((prev) => {
      if (JSON.stringify(prev) === JSON.stringify(newLegs)) return prev;
      return newLegs;
    });
  }, []);

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

  const displayedStops = useMemo(() => {
    return activeDay === "Overview"
      ? sortedStops
      : sortedStops.filter((s) => s.day === parseInt(activeDay));
  }, [activeDay, sortedStops]);

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

  const uniqueDays = [...new Set(stops.map((s) => Number(s.day)))].sort(
    (a, b) => a - b,
  );
  const totalDays = uniqueDays.length > 0 ? Math.max(...uniqueDays) : 1;

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
    e.preventDefault();
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
      window.removeEventListener("touchmove", handleMove);
      window.removeEventListener("touchend", () => setIsDragging(false));
    };
  }, [isDragging]);

  if (!trip)
    return (
      <div className="loader-container">
        <Loader2 className="animate-spin" size={40} />
      </div>
    );

  return (
    <div className="planner-layout">
      {/* Map Picking Banner */}
      {isPickingOnMap && (
        <div className="map-picking-banner">
          <div className="map-picking-content">
            <MousePointer2 size={16} /> Tap map to pin location
            <button
              onClick={() => {
                setIsPickingOnMap(false);
                setIsFormOpen(true);
              }}
              className="map-picking-cancel"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* --- GOOGLE MAP CORE --- */}
      <APIProvider apiKey={import.meta.env.VITE_GOOGLE_MAPS_API_KEY}>
        <div className="map-half">
          <Link to="/" className="back-btn">
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
            <MapRouteRenderer
              listItems={listItems}
              activeDay={activeDay}
              onLegsCalculated={handleLegsCalculated}
              totalDays={totalDays}
            />

            {listItems.map((stop) => {
              const markerBg = stop.isAnchor
                ? "#1a1a24"
                : getPistachio(stop.day, totalDays);

              return (
                <AdvancedMarker
                  key={stop.uniqueKey}
                  position={{ lat: stop.lat, lng: stop.lng }}
                  title={stop.name}
                  onClick={() => {
                    if (activeDay === "Overview" && !stop.isAnchor) {
                      setActiveDay(stop.day);
                    }
                  }}
                >
                  <div
                    className="custom-marker"
                    style={{
                      backgroundColor: markerBg,
                      color: stop.isAnchor ? "#ffffff" : "#1a1a24",
                      cursor: activeDay === "Overview" ? "pointer" : "default",
                    }}
                  >
                    {renderIconById(stop.icon, 16)}
                  </div>
                </AdvancedMarker>
              );
            })}
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
            <h1>{trip.name}</h1>
            <div className="day-filters">
              <button
                className={`day-pill ${activeDay === "Overview" ? "active" : ""}`}
                onClick={() => setActiveDay("Overview")}
                style={{
                  background: "#1a1a24",
                  borderColor: "#1a1a24",
                  color: "#fff",
                }}
              >
                Overview
              </button>
              {uniqueDays.map((day) => {
                const dayColor = getLavender(day, totalDays);
                return (
                  <button
                    key={day}
                    className={`day-pill ${activeDay === day ? "active" : ""}`}
                    onClick={() => setActiveDay(day)}
                    style={{
                      backgroundColor: dayColor,
                      borderColor: dayColor,
                      color: "#fff" /* <-- Changed this from #1a1a24 to #fff */,
                    }}
                  >
                    Day {day}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="timeline-container">
            {activeDay !== "Overview" && trip.startDate && (
              <div className="day-header-container">
                <h2 className="day-header-title">{getDateForDay(activeDay)}</h2>
                <div
                  className="day-header-line"
                  style={{
                    background: getLavender(parseInt(activeDay), totalDays),
                  }}
                ></div>
              </div>
            )}

            {listItems.map((stop, idx) => {
              const showDayHeader =
                activeDay === "Overview" &&
                (idx === 0 || listItems[idx - 1].day !== stop.day);

              const nextStop = listItems[idx + 1];
              const isWalk = nextStop?.type === "attraction";
              const exactDur = routeLegs[idx];
              const roughDur = nextStop
                ? calculateRoughDuration(stop, nextStop, nextStop.type)
                : null;

              const finalDuration =
                !isWalk && exactDur
                  ? exactDur
                  : roughDur
                    ? `~${roughDur}`
                    : null;

              const isDraggable = activeDay !== "Overview" && !stop.isAnchor;
              const iconColor = getPistachio(stop.day, totalDays);
              const roadColor = getLavender(stop.day, totalDays);

              return (
                <React.Fragment key={stop.uniqueKey}>
                  {showDayHeader && (
                    <div className="day-separator">
                      Day {stop.day}
                      <span>• {getDateForDay(stop.day)}</span>
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
                    <div
                      className="timeline-icon"
                      style={{
                        background: stop.isAnchor ? "#1a1a24" : iconColor,
                        color: stop.isAnchor ? "#ffffff" : "#1a1a24",
                      }}
                    >
                      {renderIconById(stop.icon, 14)}
                    </div>
                    <div className="timeline-content">
                      <div style={{ flex: 1 }}>
                        <h3 className="timeline-title">
                          {stop.isAnchor
                            ? `Start from: ${stop.name}`
                            : stop.name}
                        </h3>
                        {stop.desc && (
                          <p className="timeline-desc">{stop.desc}</p>
                        )}

                        <div className="timeline-action-row">
                          <button
                            className="btn-action-small btn-map"
                            onClick={() =>
                              window.open(
                                `https://www.google.com/maps/search/?api=1&query=$${stop.lat},${stop.lng}`,
                                "_blank",
                              )
                            }
                          >
                            <Search size={12} /> Map
                          </button>
                          {stop.link && (
                            <button
                              className="btn-action-small btn-link"
                              onClick={() => window.open(stop.link, "_blank")}
                            >
                              <LinkIcon size={12} /> {formatLinkText(stop.link)}
                            </button>
                          )}
                        </div>
                      </div>

                      {!stop.isAnchor && (
                        <div className="timeline-controls">
                          <button
                            className="btn-icon"
                            onClick={() => {
                              setFormData({ ...stop });
                              setEditingStopId(stop.id);
                              setIsFormOpen(true);
                            }}
                          >
                            <Edit2 size={16} />
                          </button>

                          {activeDay !== "Overview" && (
                            <>
                              <div className="chevron-group">
                                <button
                                  className="btn-icon"
                                  onClick={() => handleMoveStop(stop, "up")}
                                >
                                  <ChevronUp size={16} />
                                </button>
                                <button
                                  className="btn-icon"
                                  onClick={() => handleMoveStop(stop, "down")}
                                >
                                  <ChevronDown size={16} />
                                </button>
                              </div>
                              <div className="drag-handle">
                                <GripVertical size={16} />
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {nextStop && activeDay !== "Overview" && (
                    <div className="duration-bridge-wrapper">
                      <div
                        className="duration-bridge-line"
                        style={{
                          borderLeft: `2px dashed ${isWalk ? COLOR_WALK : roadColor}`,
                        }}
                      >
                        <button
                          onClick={() =>
                            window.open(
                              `https://www.google.com/maps/dir/?api=1&origin=$${stop.lat},${stop.lng}&destination=${nextStop.lat},${nextStop.lng}&travelmode=${isWalk ? "walking" : "driving"}`,
                              "_blank",
                            )
                          }
                          className="info-panel-badge"
                        >
                          {isWalk ? (
                            <Footprints size={12} color={COLOR_WALK} />
                          ) : (
                            <Car size={12} color={roadColor} />
                          )}
                          <span>{finalDuration}</span>
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
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header-row">
                <h2>{editingStopId ? "Update Stop" : "Add Location"}</h2>
                {editingStopId && (
                  <button
                    type="button"
                    className="btn-delete"
                    onClick={() =>
                      deleteStop(tripId, editingStopId).then(() => {
                        setIsFormOpen(false);
                        loadData();
                      })
                    }
                  >
                    <Trash2 size={20} />
                  </button>
                )}
              </div>

              <form onSubmit={handleSaveStop}>
                <div className="form-section">
                  <span className="label">1. Find Location</span>

                  <div className="autocomplete-row">
                    <PlaceAutocomplete onPlaceSelect={handlePlaceSelect} />
                    <button
                      type="button"
                      className="btn-pick-map"
                      onClick={() => {
                        setIsPickingOnMap(true);
                        setIsFormOpen(false);
                      }}
                      title="Pick on map"
                    >
                      <MousePointer2 size={18} color="#1a1a24" />
                    </button>
                  </div>

                  {formData.lat && (
                    <div className="coord-locked">✓ Coordinates locked</div>
                  )}
                </div>

                <div className="form-group">
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

                <div className="form-group">
                  <span className="label">3. Activity Icon</span>
                  <div className="icon-grid">
                    {ICON_CONFIG.map((ic) => (
                      <button
                        type="button"
                        key={ic.id}
                        className="icon-btn"
                        onClick={() =>
                          setFormData((prev) => ({ ...prev, icon: ic.id }))
                        }
                        style={{
                          border:
                            formData.icon === ic.id
                              ? "2px solid #1a1a24"
                              : "1px solid #eee",
                        }}
                      >
                        {renderIconById(ic.id, 18)}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="form-group">
                  <span className="label">4. Mode</span>
                  <div className="mode-group">
                    <button
                      type="button"
                      className="mode-btn"
                      onClick={() =>
                        setFormData((prev) => ({ ...prev, type: "main" }))
                      }
                      style={{
                        border:
                          formData.type === "main"
                            ? `2px solid ${COLOR_DRIVE}`
                            : "1px solid #eee",
                        background:
                          formData.type === "main" ? "#fdfff1" : "#fff",
                      }}
                    >
                      <Car size={20} color={COLOR_DRIVE} />
                      <span>Driving</span>
                    </button>
                    <button
                      type="button"
                      className="mode-btn"
                      onClick={() =>
                        setFormData((prev) => ({ ...prev, type: "attraction" }))
                      }
                      style={{
                        border:
                          formData.type === "attraction"
                            ? `2px solid ${COLOR_WALK}`
                            : "1px solid #eee",
                        background:
                          formData.type === "attraction" ? "#fdfff1" : "#fff",
                      }}
                    >
                      <Footprints size={20} color={COLOR_WALK} />
                      <span>Walking</span>
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
