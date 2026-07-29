import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  GoogleMap,
  useJsApiLoader,
  Marker,
  InfoWindow,
} from "@react-google-maps/api";
import { io } from "socket.io-client";
import { useGetLiveMapTechniciansQuery } from "../../store/technicianApi";
import { Link, useNavigate } from "react-router-dom";
import { useSelector } from "react-redux";
import "./LiveMap.css";

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || "http://localhost:5001";
const GOOGLE_MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";

// Qatar center
const MAP_CENTER = { lat: 25.276987, lng: 51.520008 };
const MAP_ZOOM = 11;

const mapContainerStyle = { width: "100%", height: "100%" };

const mapOptions = {
  disableDefaultUI: false,
  zoomControl: true,
  mapTypeControl: false,
  streetViewControl: false,
  fullscreenControl: true,
  styles: [
    {
      featureType: "landscape",
      elementType: "geometry.fill",
      stylers: [{ color: "#e0e0e0" }],
    },
    {
      featureType: "poi.attraction",
      stylers: [{ visibility: "off" }],
    },
    {
      featureType: "poi.business",
      stylers: [{ visibility: "off" }],
    },
    {
      featureType: "poi.sports_complex",
      stylers: [{ visibility: "off" }],
    },
    {
      featureType: "road",
      elementType: "geometry.fill",
      stylers: [{ color: "#ffffff" }],
    },
    {
      featureType: "road",
      elementType: "geometry.stroke",
      stylers: [{ color: "#808080" }],
    },
    {
      featureType: "road",
      elementType: "labels.text",
      stylers: [{ visibility: "on" }],
    },
    {
      featureType: "road.highway",
      elementType: "geometry.fill",
      stylers: [{ color: "#ff9800" }],
    },
    {
      featureType: "road.highway",
      elementType: "geometry.stroke",
      stylers: [{ color: "#e65100" }],
    },
    {
      featureType: "transit",
      stylers: [{ visibility: "off" }],
    },
  ],
};

// Marker: custom car icon (public/icons/car-marker.png)
const CAR_ICON = {
  url: "/icons/car-marker.png",
  scaledSize: { width: 96, height: 96 },
  anchor: { x: 48, y: 48 },
};

function LiveMap() {
  const navigate = useNavigate();
  const mapRef = useRef(null);
  const socketRef = useRef(null);
  const panelRef = useRef(null);
  const contextMenuRef = useRef(null);
  const token = useSelector((state) => state.auth.token);

  // ==================== STATE ====================
  const [technicians, setTechnicians] = useState([]);
  const [selectedTech, setSelectedTech] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState(null); // null | "technician" | "vehicle"
  const [selectedTechFilter, setSelectedTechFilter] = useState(null);
  const [selectedVehicleFilter, setSelectedVehicleFilter] = useState(null);
  const [contextMenuTechId, setContextMenuTechId] = useState(null);

  // ==================== RTK QUERY ====================
  // 8s REST snapshot as fallback; real-time updates come via socket.
  const { data: liveMapData, isLoading } = useGetLiveMapTechniciansQuery(undefined, {
    pollingInterval: 8000,
  });

  // ==================== GOOGLE MAPS LOADER ====================
  const mapsKeyMissing = !GOOGLE_MAPS_KEY.trim();
  const { isLoaded: mapsLoaded } = useJsApiLoader({
    id: "clicks-live-map",
    googleMapsApiKey: GOOGLE_MAPS_KEY,
  });

  // ==================== INITIALIZE FROM API ====================
  useEffect(() => {
    if (liveMapData?.technicians) {
      setTechnicians((prev) => {
        const prevById = new Map(prev.map((t) => [String(t._id), t]));
        const next = liveMapData.technicians.map((t) => {
          const id = String(t._id);
          const existing = prevById.get(id);
          // Keep socket coords if they are newer than the REST snapshot.
          // The socket _locationUpdatedAt is set on every technicianLocationUpdate;
          // the REST snapshot reflects the DB write time (potentially a few seconds stale).
          if (existing?._locationUpdatedAt) {
            const socketMs = new Date(existing._locationUpdatedAt).getTime();
            // If we have a socket location fresher than 60s, prefer it.
            if (Date.now() - socketMs < 60000 && existing.location) {
              return { ...t, _id: id, location: existing.location, _locationUpdatedAt: existing._locationUpdatedAt };
            }
            // Otherwise fall through and use API location below
          } else if (existing?.location) {
            // Legacy: keep socket location even without timestamp
            return { ...t, _id: id, location: existing.location };
          }
          return { ...t, _id: id };
        });
        return next;
      });
    }
  }, [liveMapData]);

  // ==================== SOCKET CONNECTION ====================
  const [socketConnected, setSocketConnected] = useState(false);

  useEffect(() => {
    if (!token) return undefined;

    // forceNew: true is CRITICAL — without it, socket.io-client reuses the same
    // Manager as AdminLayout.jsx (same host + namespace). When LiveMap unmounts
    // and calls socket.disconnect(), it would kill AdminLayout's socket too, and
    // on the next mount the returned socket is already manually-disconnected and
    // will NOT auto-reconnect. forceNew gives LiveMap its own Manager so the
    // lifecycles are fully independent.
    const socket = io(`${SOCKET_URL}/admin`, {
      forceNew: true,
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 2000,
      auth: { token },
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      console.log("✅ Admin socket connected for live map:", socket.id);
      setSocketConnected(true);
      socket.emit("register");
    });

    socket.on("disconnect", (reason) => {
      console.warn("⚠️ Admin socket disconnected:", reason);
      setSocketConnected(false);
    });

    socket.on("connect_error", (err) => {
      console.error("❌ Admin socket connect_error:", err.message);
      setSocketConnected(false);
    });

    socket.on("technicianLocationUpdate", (data) => {
      const { technician_id, latitude, longitude, updatedAt } = data;
      const id = String(technician_id);
      const _locationUpdatedAt = updatedAt || new Date().toISOString();
      setTechnicians((prev) =>
        prev.map((t) =>
          String(t._id) === id
            ? { ...t, location: { latitude, longitude }, _locationUpdatedAt }
            : t
        )
      );
    });

    socket.on("technicianOnline", (data) => {
      const id = String(data.technician_id);
      const status = data.currentStatus || "Online";
      // Ignore Offline presence events here — handled by technicianOffline
      if (!["Online", "On Job"].includes(status)) return;
      setTechnicians((prev) => {
        const exists = prev.find((t) => String(t._id) === id);
        if (exists) {
          return prev.map((t) =>
            String(t._id) === id ? { ...t, ...data, _id: id, currentStatus: status } : t
          );
        }
        return [...prev, { ...data, _id: id, currentStatus: status }];
      });
    });

    socket.on("technicianOffline", (data) => {
      const id = String(data.technician_id);
      setTechnicians((prev) => prev.filter((t) => String(t._id) !== id));
      setSelectedTech((prev) => (prev && String(prev._id) === id ? null : prev));
    });

    return () => {
      socket.disconnect();
      socket.removeAllListeners();
    };
  }, [token]);

  // ==================== CLOSE PANEL ON OUTSIDE CLICK ====================
  useEffect(() => {
    const handleClick = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        // Check if click was on one of the filter tab buttons
        const isTabClick = e.target.closest(".live-map-filter-tab");
        if (!isTabClick) setActiveTab(null);
      }
      // Close context menu on outside click
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target)) {
        setContextMenuTechId(null);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // ==================== DERIVED DATA ====================
  const vehiclesList = useMemo(() => {
    const vehicles = [];
    const seen = new Set();
    technicians.forEach((t) => {
      if (t.vehicle && t.vehicle._id && !seen.has(t.vehicle._id)) {
        seen.add(t.vehicle._id);
        vehicles.push({
          ...t.vehicle,
          technicianId: t._id,
          technicianName: `${t.firstName} ${t.lastName}`,
        });
      }
    });
    return vehicles;
  }, [technicians]);

  const filteredTechnicians = useMemo(() => {
    // Live Map: Online / On Job only — never show Offline
    let result = technicians.filter((t) =>
      ["Online", "On Job"].includes(t.currentStatus)
    );
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (t) =>
          `${t.firstName} ${t.lastName}`.toLowerCase().includes(q) ||
          (t.phone && t.phone.includes(q))
      );
    }
    if (selectedTechFilter) result = result.filter((t) => t._id === selectedTechFilter);
    if (selectedVehicleFilter)
      result = result.filter((t) => t.vehicle && t.vehicle._id === selectedVehicleFilter);
    return result;
  }, [technicians, searchQuery, selectedTechFilter, selectedVehicleFilter]);

  // ==================== MAP HELPERS ====================
  const onMapLoad = useCallback((map) => { mapRef.current = map; }, []);

  const centerOnTechnician = useCallback((tech) => {
    if (mapRef.current && tech.location) {
      mapRef.current.panTo({ lat: tech.location.latitude, lng: tech.location.longitude });
      mapRef.current.setZoom(15);
    }
  }, []);

  const getInitials = (f, l) => `${(f || "")[0] || ""}${(l || "")[0] || ""}`.toUpperCase();

  const getStatusClass = (status) => (status === "On Job" ? "on-job" : "online");

  // ==================== TAB TOGGLE ====================
  const toggleTab = (tab) => {
    if (activeTab === tab) {
      setActiveTab(null);
    } else {
      setActiveTab(tab);
    }
  };

  // ==================== RENDER ====================
  if (mapsKeyMissing) {
    return (
      <div className="live-map-page">
        <div className="live-map-loading">
          Google Maps API key is missing. Set{" "}
          <code>VITE_GOOGLE_MAPS_API_KEY</code> in{" "}
          <code>clicks-interface/.env</code> (or{" "}
          <code>.env.staging</code>) and restart the Vite dev server.
        </div>
      </div>
    );
  }

  if (!mapsLoaded) {
    return (
      <div className="live-map-page">
        <div className="live-map-loading">Loading Google Maps...</div>
      </div>
    );
  }

  return (
    <div className="live-map-page">
      {/* ===== HEADER ===== */}
      <div className="live-map-header">
        <h1 className="live-map-title">Live Map</h1>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span
            className={`live-map-socket-badge ${socketConnected ? "connected" : "disconnected"}`}
            title={socketConnected ? "Real-time updates active" : "Connecting to live updates…"}
          >
            <span className="live-map-socket-dot" />
            {socketConnected ? "Live" : "Connecting…"}
          </span>
          <div className="live-map-breadcrumb">
            <Link to="/dashboard">Dashboard</Link>
            <span className="live-map-breadcrumb-sep">&gt;</span>
            <span className="live-map-breadcrumb-current">Live Map</span>
          </div>
        </div>
      </div>

      {/* ===== FILTER BAR ===== */}
      <div className="live-map-filterbar">
        <div className="live-map-filter-tabs">
          <div
            className={`live-map-filter-tab${activeTab === "technician" ? " active" : ""}`}
            onClick={() => {
              toggleTab("technician");
              setSelectedVehicleFilter(null);
            }}
          >
            <img src="/icons/technician.svg" alt="" className="live-map-filter-tab-icon" />
            Technician
          </div>
          <div
            className={`live-map-filter-tab${activeTab === "vehicle" ? " active" : ""}`}
            onClick={() => {
              toggleTab("vehicle");
              setSelectedTechFilter(null);
            }}
          >
            <img src="/icons/vehicle.svg" alt="" className="live-map-filter-tab-icon" />
            Vehicle
          </div>
        </div>

        <div className="live-map-search">
          <img src="/icons/Search.svg" alt="" className="live-map-search-icon" />
          <input
            type="text"
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* ===== MAP + OVERLAID PANEL ===== */}
      <div className="live-map-container">
        <GoogleMap
          mapContainerStyle={mapContainerStyle}
          center={MAP_CENTER}
          zoom={MAP_ZOOM}
          options={mapOptions}
          onLoad={onMapLoad}
          onClick={() => setSelectedTech(null)}
        >
          {filteredTechnicians.map((tech) => {
            if (!tech.location || (tech.location.latitude === 0 && tech.location.longitude === 0))
              return null;

            return (
              <Marker
                key={tech._id}
                position={{ lat: tech.location.latitude, lng: tech.location.longitude }}
                icon={{
                  url: CAR_ICON.url,
                  scaledSize: new window.google.maps.Size(
                    CAR_ICON.scaledSize.width,
                    CAR_ICON.scaledSize.height
                  ),
                  anchor: new window.google.maps.Point(
                    CAR_ICON.anchor.x,
                    CAR_ICON.anchor.y
                  ),
                }}
                onClick={() => setSelectedTech(tech)}
                title={`${tech.firstName} ${tech.lastName}`}
              />
            );
          })}

          {/* ===== MINIMAL TOOLTIP POPUP (Figma) ===== */}
          {selectedTech && selectedTech.location && selectedTech.location.latitude !== 0 && (
            <InfoWindow
              position={{ lat: selectedTech.location.latitude, lng: selectedTech.location.longitude }}
              onCloseClick={() => setSelectedTech(null)}
              options={{ pixelOffset: new window.google.maps.Size(0, -26), maxWidth: 260 }}
            >
              <div className="tech-popup">
                <p className="tech-popup-name">
                  {selectedTech.firstName} {selectedTech.lastName}
                </p>
                <p className="tech-popup-vehicle">
                  {selectedTech.vehicle
                    ? `${selectedTech.vehicle.make} ${selectedTech.vehicle.model} - ${selectedTech.vehicle.plateNumber}`
                    : "No vehicle assigned"}
                </p>
              </div>
            </InfoWindow>
          )}
        </GoogleMap>

        {/* ===== DROPDOWN PANELS (overlaid on map) ===== */}
        {activeTab === "technician" && (
          <div className="live-map-dropdown-panel tech-panel" ref={panelRef}>
            <div className="live-map-dropdown-panel-header">Name</div>
            <div className="live-map-dropdown-panel-list">
              {technicians.length === 0 && (
                <div style={{ padding: 24, textAlign: "center", color: "#667085", fontSize: 13 }}>
                  No technicians online
                </div>
              )}
              {technicians.map((t) => (
                <div
                  key={t._id}
                  className={`lm-tech-item${selectedTechFilter === t._id ? " selected" : ""}`}
                  onClick={() => {
                    setSelectedTechFilter(selectedTechFilter === t._id ? null : t._id);
                    centerOnTechnician(t);
                  }}
                >
                  <div className="lm-tech-avatar-wrap">
                    {t.profilePicture ? (
                      <img src={t.profilePicture} alt="" className="lm-tech-avatar" />
                    ) : (
                      <div className="lm-tech-avatar-initials">{getInitials(t.firstName, t.lastName)}</div>
                    )}
                    <span className={`lm-tech-status-dot ${getStatusClass(t.currentStatus)}`} />
                  </div>
                  <div className="lm-tech-info">
                    <div className="lm-tech-name">{t.firstName} {t.lastName}</div>
                    <div className="lm-tech-phone">{t.phone}</div>
                  </div>
                  <div className="lm-tech-menu-wrap" ref={contextMenuTechId === t._id ? contextMenuRef : null}>
                    <button
                      className="lm-tech-menu-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        setContextMenuTechId(contextMenuTechId === t._id ? null : t._id);
                      }}
                    >
                      <img src="/icons/Menu-2-alt.svg" alt="menu" />
                    </button>
                    {contextMenuTechId === t._id && (
                      <div className="lm-tech-context-menu">
                        <div
                          className="lm-tech-context-menu-item"
                          onClick={(e) => {
                            e.stopPropagation();
                            setContextMenuTechId(null);
                            navigate(`/technicians/${t._id}`);
                          }}
                        >
                          View Technician Profile
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === "vehicle" && (
          <div className="live-map-dropdown-panel vehicle-panel" ref={panelRef}>
            <div className="live-map-dropdown-panel-header">Vehicle details</div>
            <div className="live-map-dropdown-panel-list">
              {vehiclesList.length === 0 && (
                <div style={{ padding: 24, textAlign: "center", color: "#667085", fontSize: 13 }}>
                  No vehicles assigned
                </div>
              )}
              {vehiclesList.map((v) => (
                <div
                  key={v._id}
                  className={`lm-vehicle-item${selectedVehicleFilter === v._id ? " selected" : ""}`}
                  onClick={() => {
                    setSelectedVehicleFilter(selectedVehicleFilter === v._id ? null : v._id);
                    // Find and center on the technician with this vehicle
                    const tech = technicians.find((t) => t.vehicle && t.vehicle._id === v._id);
                    if (tech) centerOnTechnician(tech);
                  }}
                >
                  <div className="lm-vehicle-title">
                    {v.make} {v.model}<span>{v.plateNumber}</span>
                  </div>
                  <div className="lm-vehicle-tech">{v.technicianName}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ===== EMPTY STATE (removed — map speaks for itself) ===== */}
      </div>
    </div>
  );
}

export default LiveMap;
