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
  Home,
  ChevronDown,
  ChevronUp,
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
  const travelmode = mode === "attraction" ? "walking" : "driving";
  const url = isIOS
    ? `http://maps.apple.com/?saddr=${start.lat},${start.lng}&daddr=${end.lat},${end.lng}&dirflg=${mode === "attraction" ? "w" : "d"}`
    : `https://www.google.com/maps/dir/?api=1&origin=${start.lat},${start.lng}&destination=${end.lat},${end.lng}&travelmode=${travelmode}`;
  window.open(url, "_blank");
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
  const mins = Math.round(
    ((distance * (mode === "attraction" ? 1.2 : 1.5)) /
      (mode === "attraction" ? 4.5 : 40)) *
      60,
  );
  return mins < 60
    ? `${Math.max(1, mins)} min`
    : `${Math.floor(mins / 60)}h ${mins % 60}m`;
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
  const activePolylineRef = useRef(null);
  const overviewPolylinesRef = useRef([]);

  useEffect(() => {
    if (!map || !mapsLib) return;
    activePolylineRef.current = new mapsLib.Polyline({
      map: null,
      strokeOpacity: 0.9,
      strokeWeight: 7,
    });
    return () => activePolylineRef.current?.setMap(null);
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
        days.forEach((day) => {
          const dStops = listItems.filter((s) => s.day === day);
          const nextDayStops = listItems.filter((s) => s.day === day + 1);
          if (nextDayStops.length > 0) dStops.push(nextDayStops[0]);
          if (dStops.length > 1) {
            const line = new mapsLib.Polyline({
              map,
              path: dStops.map((s) => ({ lat: s.lat, lng: s.lng })),
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
            overviewPolylinesRef.current.push(line);
          }
        });
      }
      return;
    }

    new routesLib.DirectionsService()
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
          const path = [];
          res.routes[0].legs.forEach((leg) =>
            leg.steps.forEach((step) =>
              step.path.forEach((pt) =>
                path.push({ lat: pt.lat(), lng: pt.lng() }),
              ),
            ),
          );
          activePolylineRef.current.setPath(path);
          activePolylineRef.current.setOptions({
            strokeColor: getLavender(parseInt(activeDay), totalDays),
          });
          activePolylineRef.current.setMap(map);
          onLegsCalculated(res.routes[0].legs.map((l) => l.duration.text));
        }
      });
  }, [listItems, activeDay, routesLib, mapsLib, map, totalDays]);

  useEffect(() => {
    if (!map || listItems.length === 0) return;
    const bounds = new window.google.maps.LatLngBounds();
    listItems.forEach((s) => bounds.extend({ lat: s.lat, lng: s.lng }));
    map.fitBounds(bounds, {
      top: 60,
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
    const auto = new placesLib.Autocomplete(inputRef.current, {
      fields: ["geometry", "name", "formatted_address"],
    });
    auto.addListener("place_changed", () => onPlaceSelect(auto.getPlace()));
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
  const [drawerOpen, setDrawerOpen] = useState(false);

  // --- AUTOMATIC THEME LOGIC ---
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem("theme");
    if (saved) return saved;
    const hour = new Date().getHours();
    return hour < 7 || hour >= 19 ? "dark" : "light";
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

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
  const loadData = async () => {
    setTrip(await getTrip(tripId));
    setStops(await getStops(tripId));
  };

  const handleLegsCalculated = useCallback(
    (newLegs) =>
      setRouteLegs((p) =>
        JSON.stringify(p) === JSON.stringify(newLegs) ? p : newLegs,
      ),
    [],
  );
  const getDateForDayRaw = useCallback(
    (dNum) => {
      if (!trip?.startDate) return null;
      const d = new Date(trip.startDate);
      d.setDate(d.getDate() + (parseInt(dNum) - 1));
      return d;
    },
    [trip],
  );
  const getDateForDayString = useCallback(
    (dNum) => {
      const d = getDateForDayRaw(dNum);
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
    let items = displayedStops.map((s) => ({ ...s, uniqueKey: s.id }));
    if (activeDay !== "Overview" && anchorStop)
      items = [
        { ...anchorStop, isAnchor: true, uniqueKey: `a-${anchorStop.id}` },
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
    let name = "Pinned Location";
    try {
      const res = await new window.google.maps.Geocoder().geocode({
        location: { lat, lng },
      });
      if (res.results[0])
        name =
          res.results[0].address_components[0].short_name ||
          res.results[0].formatted_address.split(",")[0];
    } catch {}
    processPlaceSelection(lat, lng, name);
    setIsPickingOnMap(false);
    setIsFormOpen(true);
  };

  const processPlaceSelection = (lat, lng, name) => {
    let sDay = formData.day,
      sText = "";
    if (activeDay === "Overview" && stops.length > 0) {
      let minD = Infinity,
        bDay = 1;
      uniqueDays.forEach((d) => {
        const dStops = stops
          .filter((s) => s.day === d)
          .sort((a, b) => a.order - b.order);
        for (let i = 0; i < dStops.length - 1; i++) {
          const det =
            calculateDistance(dStops[i], { lat, lng }) +
            calculateDistance({ lat, lng }, dStops[i + 1]) -
            calculateDistance(dStops[i], dStops[i + 1]);
          if (det < minD) {
            minD = det;
            bDay = d;
          }
        }
      });
      sDay = bDay;
      sText = `✨ Smart assigned to Day ${bDay}`;
    }
    setFormData((p) => ({
      ...p,
      name,
      lat,
      lng,
      day: sDay,
      suggestionText: sText,
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
  const handleDrop = async (e, tId) => {
    e.preventDefault();
    if (!draggedStopId || draggedStopId === tId) return;
    const dStops = stops
      .filter((s) => s.day === parseInt(activeDay))
      .sort((a, b) => a.order - b.order);
    const dIdx = dStops.findIndex((s) => s.id === draggedStopId),
      tIdx = dStops.findIndex((s) => s.id === tId);
    if (dIdx === -1 || tIdx === -1) return;
    const nStops = [...dStops];
    const [item] = nStops.splice(dIdx, 1);
    nStops.splice(tIdx, 0, item);
    await Promise.all(
      nStops.map((s, i) => updateStop(tripId, s.id, { order: i })),
    );
    loadData();
    setDraggedStopId(null);
  };

  useEffect(() => {
    const move = (e) => {
      if (!isDragging) return;
      const y = e.type.includes("touch") ? e.touches[0].clientY : e.clientY;
      const h = ((window.innerHeight - y) / window.innerHeight) * 100;
      if (h >= 15 && h <= 90) setSheetHeight(h);
    };
    if (isDragging) {
      window.addEventListener("mousemove", move);
      window.addEventListener("mouseup", () => setIsDragging(false));
      window.addEventListener("touchmove", move);
      window.addEventListener("touchend", () => setIsDragging(false));
    }
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", () => setIsDragging(false));
      window.removeEventListener("touchmove", move);
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
      {/* --- TOP UTILITY DRAWER --- */}
      <div className={`utility-drawer ${drawerOpen ? "open" : ""}`}>
        <div
          className="drawer-handle-container"
          onClick={() => setDrawerOpen(!drawerOpen)}
        >
          <div className="drawer-handle-line"></div>
        </div>
        <div className="drawer-content">
          <Link to="/" className="drawer-item">
            <Home size={20} />
            <span>Itineraries</span>
          </Link>
          <button
            className="drawer-item"
            onClick={() => setTheme(theme === "light" ? "dark" : "light")}
          >
            {theme === "light" ? <Moon size={20} /> : <Sun size={20} />}
            <span>{theme === "light" ? "Dark Mode" : "Light Mode"}</span>
          </button>
        </div>
      </div>

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

      {/* APIProvider reset key ensures Map tiles refresh style on theme toggle */}
      <APIProvider
        apiKey={import.meta.env.VITE_GOOGLE_MAPS_API_KEY}
        version="weekly"
        key={`provider-${theme}`}
      >
        <div className="map-half">
          <Map
            key={`map-${theme}`}
            mapId="bc5b8937bf989b803f41d02e"
            colorScheme={theme === "dark" ? "DARK" : "LIGHT"}
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
            {listItems.map((s) => (
              <AdvancedMarker
                key={s.uniqueKey}
                position={{ lat: s.lat, lng: s.lng }}
                onClick={() =>
                  activeDay === "Overview" && !s.isAnchor && setActiveDay(s.day)
                }
              >
                <div
                  className="custom-marker"
                  style={{
                    backgroundColor: s.isAnchor
                      ? "var(--text-main)"
                      : getPistachio(s.day, totalDays),
                    color: s.isAnchor ? "var(--bg-main)" : "#1a1a24",
                    cursor: activeDay === "Overview" ? "pointer" : "default",
                  }}
                >
                  {renderIconById(s.icon, 16)}
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
              {uniqueDays.map((d) => (
                <button
                  key={d}
                  className={`day-pill ${activeDay === d ? "active" : ""}`}
                  onClick={() => setActiveDay(d)}
                  style={
                    activeDay === d
                      ? {
                          backgroundColor: getLavender(d, totalDays),
                          color: "#fff",
                        }
                      : {
                          borderBottom: `3px solid ${getLavender(d, totalDays)}`,
                          color: "var(--text-muted)",
                        }
                  }
                >
                  Day {d}
                </button>
              ))}
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
            {listItems.map((s, idx) => {
              const showH =
                activeDay === "Overview" &&
                (idx === 0 || listItems[idx - 1].day !== s.day);
              const next = listItems[idx + 1],
                isW = next?.type === "attraction";
              const dur =
                !isW && routeLegs[idx]
                  ? routeLegs[idx]
                  : calculateRoughDuration(s, next, next?.type);
              return (
                <React.Fragment key={s.uniqueKey}>
                  {showH && (
                    <div className="day-separator">
                      Day {s.day} <span>• {getDateForDayString(s.day)}</span>
                    </div>
                  )}
                  <div
                    className="timeline-item"
                    draggable={activeDay !== "Overview" && !s.isAnchor}
                    onDragStart={(e) => handleDragStart(e, s.id)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => handleDrop(e, s.id)}
                    style={{
                      opacity: draggedStopId === s.id ? 0.4 : 1,
                      transition: "opacity 0.2s",
                    }}
                  >
                    <div
                      className="timeline-icon"
                      style={{
                        background: s.isAnchor
                          ? "var(--text-main)"
                          : getPistachio(s.day, totalDays),
                        color: s.isAnchor ? "var(--bg-main)" : "#1a1a24",
                      }}
                    >
                      {renderIconById(s.icon, 14)}
                    </div>
                    <div className="timeline-content">
                      <div style={{ flex: 1 }}>
                        <h3 className="timeline-title">
                          {s.isAnchor ? `Start: ${s.name}` : s.name}
                        </h3>
                        {s.desc && <p className="timeline-desc">{s.desc}</p>}
                        <div className="timeline-action-row">
                          <button
                            className="btn-action-small btn-map"
                            onClick={() => openMapsPoint(s.lat, s.lng)}
                          >
                            <Search size={12} /> Map
                          </button>
                          {s.link && (
                            <button
                              className="btn-action-small btn-link"
                              onClick={() => window.open(s.link, "_blank")}
                            >
                              <LinkIcon size={12} /> {formatLinkText(s.link)}
                            </button>
                          )}
                        </div>
                      </div>
                      {!s.isAnchor && (
                        <div className="timeline-controls">
                          <button
                            className="btn-icon"
                            onClick={() => {
                              setFormData({ ...s, suggestionText: "" });
                              setEditingStopId(s.id);
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
                          borderLeft: `2px dashed ${isW ? COLOR_WALK : getLavender(s.day, totalDays)}`,
                        }}
                      >
                        <button
                          onClick={() => openMapsRoute(s, next, next.type)}
                          className="info-panel-badge"
                        >
                          {isW ? (
                            <Footprints size={12} color={COLOR_WALK} />
                          ) : (
                            <Car
                              size={12}
                              color={getLavender(s.day, totalDays)}
                            />
                          )}
                          <span>{dur}</span>{" "}
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
                    <PlaceAutocomplete
                      onPlaceSelect={(p) => {
                        if (p.geometry)
                          setFormData((f) => ({
                            ...f,
                            name: p.name,
                            lat: p.geometry.location.lat(),
                            lng: p.geometry.location.lng(),
                          }));
                      }}
                    />
                    <button
                      type="button"
                      className="btn-pick-map"
                      onClick={() => {
                        setIsPickingOnMap(true);
                        setIsFormOpen(false);
                      }}
                      title="Pick on map"
                    >
                      <MousePointer2 size={18} />
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
                      setFormData((p) => ({ ...p, link: e.target.value }))
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
                          setFormData((p) => ({ ...p, icon: ic.id }))
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
                        setFormData((p) => ({ ...p, type: "main" }))
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
                        setFormData((p) => ({ ...p, type: "attraction" }))
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
                        setFormData((p) => ({ ...p, name: e.target.value }))
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
                        setFormData((p) => ({
                          ...p,
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
                      setFormData((p) => ({ ...p, desc: e.target.value }))
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
