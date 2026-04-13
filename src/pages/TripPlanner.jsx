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
  Footprints,
  ExternalLink,
  Car,
  Landmark,
  Link as LinkIcon,
  Loader2,
  MousePointer2,
  GripVertical,
  Sparkles,
  Moon,
  Sun,
} from "lucide-react";
import {
  getTrip,
  getStops,
  addStop,
  updateStop,
  deleteStop,
} from "../firebase";

// --- THEME CONSTANTS ---
const COLOR_DRIVE = "#9b8ce3";
const COLOR_WALK = "#98c962";

const getDynamicColor = (day, totalDays, hue, sat, minL, maxL) => {
  if (totalDays <= 1) return `hsl(${hue}, ${sat}%, ${(minL + maxL) / 2}%)`;
  const safeDay = Math.min(Math.max(1, day), totalDays);
  const ratio = (safeDay - 1) / (totalDays - 1);
  const l = maxL - ratio * (maxL - minL);
  return `hsl(${hue}, ${sat}%, ${l}%)`;
};

const getLavender = (day, totalDays) =>
  getDynamicColor(day, totalDays, 248, 85, 60, 92);
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

const openMapsPoint = (lat, lng) => {
  const isIOS =
    /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  const url = isIOS
    ? `http://maps.apple.com/?q=${lat},${lng}&ll=${lat},${lng}`
    : `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  window.open(url, "_blank");
};

const openMapsRoute = (start, end, mode) => {
  const isIOS =
    /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  if (isIOS) {
    const dirflg = mode === "attraction" ? "w" : "d";
    window.open(
      `http://maps.apple.com/?saddr=${start.lat},${start.lng}&daddr=${end.lat},${end.lng}&dirflg=${dirflg}`,
      "_blank",
    );
  } else {
    const travelmode = mode === "attraction" ? "walking" : "driving";
    window.open(
      `https://www.google.com/maps/dir/?api=1&origin=${start.lat},${start.lng}&destination=${end.lat},${end.lng}&travelmode=${travelmode}`,
      "_blank",
    );
  }
};

const calculateDistance = (start, end) => {
  if (!start || !end || !start.lat || !end.lat) return 0;
  const R = 6371;
  const dLat = ((end.lat - start.lat) * Math.PI) / 180;
  const dLon = ((end.lng - start.lng) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((start.lat * Math.PI) / 180) *
      Math.cos((end.lat * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const calculateRoughDuration = (start, end, mode) => {
  const distance = calculateDistance(start, end);
  if (distance === 0) return null;
  const isWalk = mode === "attraction";
  const mins = Math.round(
    ((distance * (isWalk ? 1.2 : 1.5)) / (isWalk ? 4.5 : 40)) * 60,
  );
  if (mins < 1) return "1 min";
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
};

const formatLinkText = (url) => {
  try {
    return new URL(url).hostname.replace("www.", "");
  } catch {
    return "Link";
  }
};

const getWeatherEmoji = (code) => {
  const weatherMap = {
    0: "☀️",
    1: "🌤",
    2: "⛅️",
    3: "☁️",
    45: "🌫",
    48: "🌫",
    51: "🌧",
    53: "🌧",
    55: "🌧",
    61: "🌧",
    63: "🌧",
    65: "🌧",
    71: "❄️",
    73: "❄️",
    75: "❄️",
    95: "⛈",
    96: "⛈",
    99: "⛈",
  };
  return weatherMap[code] || "🌤";
};

function WeatherWidget({ lat, lng, dateString }) {
  const [weather, setWeather] = useState(null);
  useEffect(() => {
    if (!lat || !lng || !dateString) return;
    const target = new Date(dateString);
    const diffDays = Math.ceil((target - new Date()) / (1000 * 60 * 60 * 24));
    if (diffDays >= 0 && diffDays <= 14) {
      const formattedDate = target.toISOString().split("T")[0];
      fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=weather_code,temperature_2m_max,temperature_2m_min&start_date=${formattedDate}&end_date=${formattedDate}&timezone=auto`,
      )
        .then((res) => res.json())
        .then((data) => {
          if (data.daily && data.daily.weather_code) {
            setWeather({
              max: Math.round(data.daily.temperature_2m_max[0]),
              min: Math.round(data.daily.temperature_2m_min[0]),
              code: data.daily.weather_code[0],
            });
          }
        })
        .catch(() => {});
    }
  }, [lat, lng, dateString]);
  if (!weather) return null;
  return (
    <span
      style={{
        fontSize: 13,
        marginLeft: 12,
        opacity: 0.8,
        fontWeight: 500,
        color: "var(--text-main)",
      }}
    >
      {getWeatherEmoji(weather.code)} {weather.max}° / {weather.min}°
    </span>
  );
}

const defaultCenter = { lat: 41.3275, lng: 19.8187 };

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
          const nextDayStops = listItems.filter(
            (s) => s.day === days[index + 1],
          );
          if (nextDayStops.length > 0) dayStops.push(nextDayStops[0]);
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
          const fullPath = [];
          res.routes[0].legs.forEach((leg) => {
            leg.steps.forEach((step) => {
              step.path.forEach((pt) =>
                fullPath.push({ lat: pt.lat(), lng: pt.lng() }),
              );
            });
          });
          activePolylineRef.current.setPath(fullPath);
          activePolylineRef.current.setOptions({
            strokeColor: getLavender(parseInt(activeDay), totalDays),
          });
          activePolylineRef.current.setMap(map);
          if (res.routes[0].legs)
            onLegsCalculated(
              res.routes[0].legs.map((leg) => leg.duration.text),
            );
        }
      })
      .catch(() => {});
  }, [listItems, activeDay, routesLib, mapsLib, map, totalDays]);

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
      placeholder="Search landmarks..."
    />
  );
}

export default function TripPlanner() {
  const { tripId } = useParams();
  const [trip, setTrip] = useState(null);
  const [stops, setStops] = useState([]);
  const [activeDay, setActiveDay] = useState("Overview");
  const [sheetHeight, setSheetHeight] = useState(55);
  const [isDragging, setIsDragging] = useState(false);
  const [routeLegs, setRouteLegs] = useState([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingStopId, setEditingStopId] = useState(null);
  const [isPickingOnMap, setIsPickingOnMap] = useState(false);
  const [draggedStopId, setDraggedStopId] = useState(null);

  // --- DEBUGGING THEME LOGIC ---
  const [theme, setTheme] = useState(localStorage.getItem("theme") || "light");
  const [mapId, setMapId] = useState(
    theme === "dark" ? "bc5b8937bf989b803f41d02e" : "DEMO_MAP_ID",
  );

  const [formData, setFormData] = useState({
    name: "",
    type: "main",
    icon: "map-pin",
    day: 1,
    lat: "",
    lng: "",
    desc: "",
    link: "",
    suggestionText: "",
  });

  useEffect(() => {
    loadData();
  }, [tripId]);

  useEffect(() => {
    console.log("Switching Theme to:", theme);
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
    // Force set the mapId state
    setMapId(theme === "dark" ? "bc5b8937bf989b803f41d02e" : "DEMO_MAP_ID");
  }, [theme]);

  const toggleTheme = () =>
    setTheme((prev) => (prev === "light" ? "dark" : "light"));
  const loadData = async () => {
    setTrip(await getTrip(tripId));
    setStops(await getStops(tripId));
  };
  const handleLegsCalculated = useCallback((newLegs) => {
    setRouteLegs((prev) =>
      JSON.stringify(prev) === JSON.stringify(newLegs) ? prev : newLegs,
    );
  }, []);
  const getDateForDayRaw = useCallback(
    (dayNum) => {
      if (!trip || !trip.startDate) return null;
      const d = new Date(trip.startDate);
      d.setDate(d.getDate() + (parseInt(dayNum) - 1));
      return d;
    },
    [trip],
  );
  const getDateForDayString = useCallback(
    (dayNum) => {
      const d = getDateForDayRaw(dayNum);
      return d
        ? d.toLocaleDateString("en-US", {
            weekday: "long",
            month: "short",
            day: "numeric",
          })
        : "";
    },
    [getDateForDayRaw],
  );

  const sortedStops = useMemo(
    () =>
      [...stops].sort((a, b) =>
        a.day !== b.day ? a.day - b.day : a.order - b.order,
      ),
    [stops],
  );
  const displayedStops = useMemo(
    () =>
      activeDay === "Overview"
        ? sortedStops
        : sortedStops.filter((s) => s.day === parseInt(activeDay)),
    [activeDay, sortedStops],
  );

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

  const handleMapClick = async (e) => {
    if (!isPickingOnMap || !e.detail.latLng) return;
    const { lat, lng } = e.detail.latLng;
    let locationName = "Pinned Location";
    try {
      const geocoder = new window.google.maps.Geocoder();
      const res = await geocoder.geocode({ location: { lat, lng } });
      if (res.results[0])
        locationName =
          res.results[0].address_components[0].short_name ||
          res.results[0].formatted_address.split(",")[0];
    } catch (err) {}
    processPlaceSelection(lat, lng, locationName);
    setIsPickingOnMap(false);
    setIsFormOpen(true);
  };

  const processPlaceSelection = (lat, lng, name) => {
    let suggestedDay = formData.day,
      suggestionText = "";
    if (activeDay === "Overview" && stops.length > 0) {
      let minDetour = Infinity,
        bestDay = 1;
      uniqueDays.forEach((day) => {
        const dStops = stops
          .filter((s) => s.day === day)
          .sort((a, b) => a.order - b.order);
        for (let i = 0; i < dStops.length - 1; i++) {
          const detour =
            calculateDistance(dStops[i], { lat, lng }) +
            calculateDistance({ lat, lng }, dStops[i + 1]) -
            calculateDistance(dStops[i], dStops[i + 1]);
          if (detour < minDetour) {
            minDetour = detour;
            bestDay = day;
          }
        }
      });
      suggestedDay = bestDay;
      suggestionText = `✨ Smart assigned to Day ${bestDay}`;
    }
    setFormData((prev) => ({
      ...prev,
      name,
      lat,
      lng,
      day: suggestedDay,
      suggestionText,
    }));
  };

  const handleSaveStop = async (e) => {
    e.preventDefault();
    const payload = {
      ...formData,
      lat: parseFloat(formData.lat),
      lng: parseFloat(formData.lng),
      day: parseInt(formData.day),
    };
    delete payload.suggestionText;
    if (!editingStopId)
      payload.order = stops.filter((s) => s.day === payload.day).length;
    editingStopId
      ? await updateStop(tripId, editingStopId, payload)
      : await addStop(tripId, payload);
    setIsFormOpen(false);
    loadData();
  };

  const handleDragStart = (e, id) => {
    setDraggedStopId(id);
    e.dataTransfer.effectAllowed = "move";
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
    await Promise.all(
      newStops.map((s, index) => updateStop(tripId, s.id, { order: index })),
    );
    loadData();
    setDraggedStopId(null);
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
    if (isDragging) {
      window.addEventListener("mousemove", handleMove);
      window.addEventListener("mouseup", () => setIsDragging(false));
      window.addEventListener("touchmove", handleMove);
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
      <div className="loader-container">
        <Loader2 className="animate-spin" size={40} />
      </div>
    );

  return (
    <div className="planner-layout">
      <button className="theme-toggle" onClick={toggleTheme}>
        {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
      </button>

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

      <APIProvider
        apiKey={import.meta.env.VITE_GOOGLE_MAPS_API_KEY}
        version="weekly"
      >
        <div className="map-half">
          <Link to="/" className="back-btn">
            <ArrowLeft size={20} />
          </Link>
          <Map
            // We use the same Map ID for both because it contains both styles
            mapId="bc5b8937bf989b803f41d02e"
            // This is the key: it tells Google which slot (Light/Dark) to active
            colorScheme={theme === "dark" ? "DARK" : "LIGHT"}
            // Keep the key so React forces a refresh of the map tiles
            key={`map-${theme}`}
            defaultCenter={defaultCenter}
            defaultZoom={8}
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
            {listItems.map((stop) => (
              <AdvancedMarker
                key={stop.uniqueKey}
                position={{ lat: stop.lat, lng: stop.lng }}
                onClick={() => {
                  if (activeDay === "Overview" && !stop.isAnchor)
                    setActiveDay(stop.day);
                }}
              >
                <div
                  className="custom-marker"
                  style={{
                    backgroundColor: stop.isAnchor
                      ? "var(--text-main)"
                      : getPistachio(stop.day, totalDays),
                    color: stop.isAnchor ? "var(--bg-main)" : "#1a1a24",
                    cursor: activeDay === "Overview" ? "pointer" : "default",
                  }}
                >
                  {renderIconById(stop.icon, 16)}
                </div>
              </AdvancedMarker>
            ))}
          </Map>
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
            <h1>{trip.name}</h1>
            <div className="day-filters">
              <button
                className={`day-pill ${activeDay === "Overview" ? "active" : ""}`}
                onClick={() => setActiveDay("Overview")}
                style={
                  activeDay === "Overview"
                    ? {
                        background: "var(--text-main)",
                        color: "var(--bg-main)",
                      }
                    : { borderBottom: "3px solid var(--text-main)" }
                }
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
                    style={
                      activeDay === day
                        ? { backgroundColor: dayColor, color: "#fff" }
                        : {
                            borderBottom: `3px solid ${dayColor}`,
                            color: "var(--text-muted)",
                          }
                    }
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
                <div style={{ display: "flex", alignItems: "center" }}>
                  <h2 className="day-header-title">
                    {getDateForDayString(activeDay)}
                  </h2>
                  {listItems.length > 0 && (
                    <WeatherWidget
                      lat={listItems[0].lat}
                      lng={listItems[0].lng}
                      dateString={getDateForDayRaw(activeDay)}
                    />
                  )}
                </div>
                <div
                  className="day-header-line"
                  style={{
                    background: getLavender(parseInt(activeDay), totalDays),
                  }}
                ></div>
              </div>
            )}

            {listItems.map((stop, idx) => {
              const showHeader =
                activeDay === "Overview" &&
                (idx === 0 || listItems[idx - 1].day !== stop.day);
              const next = listItems[idx + 1];
              const isWalk = next?.type === "attraction";
              const dur =
                !isWalk && routeLegs[idx]
                  ? routeLegs[idx]
                  : calculateRoughDuration(stop, next, next?.type);
              return (
                <React.Fragment key={stop.uniqueKey}>
                  {showHeader && (
                    <div className="day-separator">
                      Day {stop.day}{" "}
                      <span>• {getDateForDayString(stop.day)}</span>
                    </div>
                  )}
                  <div
                    className="timeline-item"
                    draggable={activeDay !== "Overview" && !stop.isAnchor}
                    onDragStart={(e) => handleDragStart(e, stop.id)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => handleDrop(e, stop.id)}
                    style={{ opacity: draggedStopId === stop.id ? 0.4 : 1 }}
                  >
                    <div
                      className="timeline-icon"
                      style={{
                        background: stop.isAnchor
                          ? "var(--text-main)"
                          : getPistachio(stop.day, totalDays),
                        color: stop.isAnchor ? "var(--bg-main)" : "#1a1a24",
                      }}
                    >
                      {renderIconById(stop.icon, 14)}
                    </div>
                    <div className="timeline-content">
                      <div style={{ flex: 1 }}>
                        <h3 className="timeline-title">
                          {stop.isAnchor ? `Start: ${stop.name}` : stop.name}
                        </h3>
                        {stop.desc && (
                          <p className="timeline-desc">{stop.desc}</p>
                        )}
                        <div className="timeline-action-row">
                          <button
                            className="btn-action-small btn-map"
                            onClick={() => openMapsPoint(stop.lat, stop.lng)}
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
                              setFormData({ ...stop, suggestionText: "" });
                              setEditingStopId(stop.id);
                              setIsFormOpen(true);
                            }}
                          >
                            <Edit2 size={16} />
                          </button>
                          {activeDay !== "Overview" && (
                            <div className="drag-handle">
                              <GripVertical size={16} />
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  {next && activeDay !== "Overview" && (
                    <div className="duration-bridge-wrapper">
                      <div
                        className="duration-bridge-line"
                        style={{
                          borderLeft: `2px dashed ${isWalk ? COLOR_WALK : getLavender(stop.day, totalDays)}`,
                        }}
                      >
                        <button
                          onClick={() => openMapsRoute(stop, next, next.type)}
                          className="info-panel-badge"
                        >
                          {isWalk ? (
                            <Footprints size={12} color={COLOR_WALK} />
                          ) : (
                            <Car
                              size={12}
                              color={getLavender(stop.day, totalDays)}
                            />
                          )}
                          <span>{dur}</span>
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
                    suggestionText: "",
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
                    >
                      <MousePointer2 size={18} color="var(--text-main)" />
                    </button>
                  </div>
                  {formData.lat && <div className="coord-locked">✓ Locked</div>}
                  {formData.suggestionText && (
                    <div
                      style={{
                        marginTop: 8,
                        fontSize: 12,
                        color: "var(--text-main)",
                        background: "#e5f2d0",
                        padding: "6px 12px",
                        border: "1px solid var(--border-color)",
                        borderRadius: 6,
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        fontWeight: 600,
                      }}
                    >
                      <Sparkles size={14} color="#7cce22" />{" "}
                      {formData.suggestionText}
                    </div>
                  )}
                </div>
                <div className="form-group">
                  <span className="label">2. Booking / Info Link</span>
                  <input
                    className="input-field"
                    placeholder="https://..."
                    value={formData.link || ""}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, link: e.target.value }))
                    }
                  />
                </div>
                <div className="form-group">
                  <span className="label">3. Icon</span>
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
                          borderColor:
                            formData.icon === ic.id
                              ? "var(--text-main)"
                              : "var(--border-color)",
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
                        borderColor:
                          formData.type === "main"
                            ? COLOR_DRIVE
                            : "var(--border-color)",
                      }}
                    >
                      <Car size={20} color={COLOR_DRIVE} /> <span>Driving</span>
                    </button>
                    <button
                      type="button"
                      className="mode-btn"
                      onClick={() =>
                        setFormData((prev) => ({ ...prev, type: "attraction" }))
                      }
                      style={{
                        borderColor:
                          formData.type === "attraction"
                            ? COLOR_WALK
                            : "var(--border-color)",
                      }}
                    >
                      <Footprints size={20} color={COLOR_WALK} />{" "}
                      <span>Walking</span>
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
                        setFormData((prev) => ({
                          ...prev,
                          name: e.target.value,
                        }))
                      }
                      required
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <span className="label">Day</span>
                    <input
                      type="number"
                      min="1"
                      className="input-field"
                      value={formData.day}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          day: e.target.value,
                          suggestionText: "",
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
                  Save
                </button>
              </form>
            </div>
          </div>
        )}
      </APIProvider>
    </div>
  );
}
