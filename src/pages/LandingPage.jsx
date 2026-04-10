import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import DatePicker from "react-datepicker";
import { format } from "date-fns";
import { ArrowRight, Plus } from "lucide-react";
import { MapContainer, TileLayer } from "react-leaflet";
import { getTrips, createTrip } from "../firebase";

// Required CSS for Leaflet maps to render correctly
import "leaflet/dist/leaflet.css";
import "react-datepicker/dist/react-datepicker.css";

export default function LandingPage() {
  const [trips, setTrips] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newTrip, setNewTrip] = useState({
    name: "",
    startDate: null,
    endDate: null,
  });

  useEffect(() => {
    loadTrips();
  }, []);

  const loadTrips = async () => {
    const fetchedTrips = await getTrips();
    setTrips(fetchedTrips);
  };

  const handleCreateTrip = async (e) => {
    e.preventDefault();
    if (!newTrip.name || !newTrip.startDate || !newTrip.endDate) return;

    const formattedTrip = {
      name: newTrip.name,
      startDate: format(newTrip.startDate, "MMM d, yyyy"),
      endDate: format(newTrip.endDate, "MMM d, yyyy"),
    };

    await createTrip(formattedTrip);
    setIsModalOpen(false);
    setNewTrip({ name: "", startDate: null, endDate: null });
    loadTrips();
  };

  return (
    <div className="page-container">
      <h1 className="title">Itineraries</h1>

      <div>
        {trips.length === 0 ? (
          <div
            style={{ padding: "40px 0", color: "#646473", fontSize: "14px" }}
          >
            <p>No active itineraries.</p>
          </div>
        ) : null}

        {trips.map((trip) => (
          <Link to={`/trip/${trip.id}`} key={trip.id} className="trip-card">
            <div className="trip-card-header">
              <h2>{trip.name}</h2>
              <div className="card-dates">
                <span>{trip.startDate}</span>
                <ArrowRight size={14} strokeWidth={1.25} color="#888" />
                <span>{trip.endDate}</span>
              </div>
            </div>

            {/* Read-Only Map Preview using Esri Light Gray Canvas */}
            <div className="map-preview-container">
              <MapContainer
                center={[41.3275, 19.8187]} // Defaults to Tirana, Albania for preview
                zoom={5}
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
                />
              </MapContainer>
            </div>
          </Link>
        ))}
      </div>

      <button className="btn-primary" onClick={() => setIsModalOpen(true)}>
        <Plus size={16} strokeWidth={1.5} />
        New Itinerary
      </button>

      {/* Slide-up Form */}
      {isModalOpen && (
        <div className="modal-overlay" onClick={() => setIsModalOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div style={{ marginBottom: "30px" }}>
              <h2 style={{ fontSize: "18px", fontWeight: "500" }}>
                Draft Itinerary
              </h2>
            </div>

            <form onSubmit={handleCreateTrip}>
              <label className="label">Destination</label>
              <input
                className="input-field"
                placeholder="e.g., Albanian Riviera"
                value={newTrip.name}
                onChange={(e) =>
                  setNewTrip({ ...newTrip, name: e.target.value })
                }
              />

              <div className="date-row">
                <div style={{ flex: 1 }}>
                  <label className="label">Start</label>
                  <DatePicker
                    selected={newTrip.startDate}
                    onChange={(date) =>
                      setNewTrip({ ...newTrip, startDate: date })
                    }
                    selectsStart
                    startDate={newTrip.startDate}
                    endDate={newTrip.endDate}
                    className="input-field"
                    placeholderText="Select date"
                    dateFormat="MMM d, yyyy"
                    withPortal
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label className="label">End</label>
                  <DatePicker
                    selected={newTrip.endDate}
                    onChange={(date) =>
                      setNewTrip({ ...newTrip, endDate: date })
                    }
                    selectsEnd
                    startDate={newTrip.startDate}
                    endDate={newTrip.endDate}
                    minDate={newTrip.startDate}
                    className="input-field"
                    placeholderText="Select date"
                    dateFormat="MMM d, yyyy"
                    withPortal
                  />
                </div>
              </div>

              <button
                type="submit"
                className="btn-primary"
                style={{ marginTop: "10px" }}
              >
                Save to schedule
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
