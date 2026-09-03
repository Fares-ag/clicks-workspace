import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  GoogleMap,
  useJsApiLoader,
  Marker,
  InfoWindow,
} from "@react-google-maps/api";
import { useGetLiveMapTechniciansQuery } from "../../store/technicianApi";
import { Link, useNavigate } from "react-router-dom";
import { useAdminSocket } from "../../context/AdminSocketContext.jsx";
import {
  REST_POLL_MS,
  countVisibleStaleTechnicians,
  formatLastSeen,
  isSocketOnlyPreserved,
  isTechLocationStale,
  mergeApiTechnicianWithSocketState,
} from "./liveMapUtils.js";
import {
  GOOGLE_MAPS_API_KEY,
  googleMapsLoaderOptions,
} from "../../config/googleMapsLoader";
import "./LiveMap.css";

const SOCKET_DOWN_POLL_MS = 10000;

// Same van marker as technician app (`assets/images/map_icon.png`).
const CAR_ICON = {
  url: "/icons/map_icon.png",
  scaledSize: { width: 120, height: 120 },
  anchor: { x: 60, y: 60 },
};

/**
 * A technician is only mappable with two real, finite coordinates.
 *
 * The old guard was `lat === 0 && lng === 0`, which let a null or string
 * coordinate through into google.maps and blanked the whole admin app (there is
 * no error boundary), and treated a half-zero fix as valid — dropping a marker
 * thousands of km out to sea. 0,0 itself is the documented "no fix" sentinel.
 */
function hasUsableLocation(tech) {
  const lat = tech?.location?.latitude;
  const lng = tech?.location?.longitude;
  if (typeof lat !== "number" || typeof lng !== "number") return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat === 0 && lng === 0) return false;
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

// Marker icons are identity-compared by @react-google-maps/api. Allocating a
// fresh Size/Point per render made every marker's props change on every socket
// event and every 10s tick, forcing a setIcon on all N markers each time.
const markerIconCache = new Map();
function getMarkerIcon(tech) {
  const size = tech.currentStatus === "On Job" ? 110 : CAR_ICON.scaledSize.width;
  let icon = markerIconCache.get(size);
  if (!icon) {
    icon = {
      url: CAR_ICON.url,
      scaledSize: new window.google.maps.Size(size, size),
      anchor: new window.google.maps.Point(size / 2, size / 2),
    };
    markerIconCache.set(size, icon);
  }
  return icon;
}

/**
 * State patch for a technician location socket payload.
 *
 * _socketPresenceAt is stamped from ARRIVAL, not from the payload's own
 * timestamp: it drives the socket-only preservation window, and a payload
 * reporting an old measurement would otherwise be born already expired.
 */
function buildLocationPatch(data) {
  const _locationUpdatedAt = data.updatedAt || new Date().toISOString();
  return {
    location: { latitude: data.latitude, longitude: data.longitude },
    _locationUpdatedAt,
    lastLocationAt: data.lastLocationAt || _locationUpdatedAt,
    locationStale: data.locationStale === true,
    _socketPresenceAt: new Date().toISOString(),
  };
}

function getMarkerLabel(tech) {
  if (isTechLocationStale(tech)) {
    return { text: "!", color: "#ffffff", fontSize: "11px", fontWeight: "700" };
  }
  if (tech.currentStatus === "On Job") {
    return { text: "●", color: "#F04438", fontSize: "14px", fontWeight: "700" };
  }
  return undefined;
}

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

function LiveMap() {
  const navigate = useNavigate();
  const mapRef = useRef(null);
  const panelRef = useRef(null);
  const contextMenuRef = useRef(null);
  /** Ids in the most recent successful REST snapshot (drives ghost pruning). */
  const apiIdsRef = useRef(new Set());
  const sawRestRef = useRef(false);
  const { socket, connected: socketConnected } = useAdminSocket() || {};
  const [socketDownSince, setSocketDownSince] = useState(null);

  // ==================== STATE ====================
  const [technicians, setTechnicians] = useState([]);
  const [selectedTechId, setSelectedTechId] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState(null); // null | "technician" | "vehicle"
  const [selectedTechFilter, setSelectedTechFilter] = useState(null);
  const [selectedVehicleFilter, setSelectedVehicleFilter] = useState(null);
  const [contextMenuTechId, setContextMenuTechId] = useState(null);
  // Re-render every 10s so "last seen" ages in the UI.
  const [lastSeenTick, setLastSeenTick] = useState(0);

  useEffect(() => {
    if (socketConnected) {
      setSocketDownSince(null);
    } else if (socketDownSince === null) {
      setSocketDownSince(Date.now());
    }
  }, [socketConnected, socketDownSince]);

  const restPollFallback =
    !socketConnected &&
    socketDownSince != null &&
    Date.now() - socketDownSince >= SOCKET_DOWN_POLL_MS;

  // REST snapshot on mount; poll only when the shared admin socket has been down 10s+.
  const {
    data: liveMapData,
    isLoading,
    isError,
    isFetching,
    refetch,
  } = useGetLiveMapTechniciansQuery(undefined, {
    pollingInterval: restPollFallback ? REST_POLL_MS : 0,
  });

  // ==================== GOOGLE MAPS LOADER ====================
  const mapsKeyMissing = !GOOGLE_MAPS_API_KEY.trim();
  const { isLoaded: mapsLoaded } = useJsApiLoader(googleMapsLoaderOptions);

  // ==================== INITIALIZE FROM API ====================
  useEffect(() => {
    if (!liveMapData?.technicians) return;
    setTechnicians((prev) => {
      const prevById = new Map(prev.map((t) => [String(t._id), t]));
      const apiIds = new Set();

      const mergedFromApi = liveMapData.technicians.map((t) => {
        const id = String(t._id);
        apiIds.add(id);
        return mergeApiTechnicianWithSocketState(t, prevById.get(id));
      });

      // Union: keep socket-only techs until REST catches up (≤2 poll windows).
      const socketOnly = prev.filter((t) => isSocketOnlyPreserved(t, apiIds));

      apiIdsRef.current = apiIds;
      sawRestRef.current = true;

      return [...mergedFromApi, ...socketOnly];
    });
  }, [liveMapData]);

  useEffect(() => {
    const id = setInterval(() => {
      setLastSeenTick((n) => n + 1);
      // Prune expired socket-only entries here as well. The REST merge effect
      // is skipped entirely whenever RTK Query hands back the same `data`
      // reference — an idle fleet, or a REST outage — and it used to be the
      // only place pruning ran, so a ghost could outlive its window forever.
      if (!sawRestRef.current) return;
      setTechnicians((prev) => {
        const next = prev.filter(
          (t) =>
            apiIdsRef.current.has(String(t._id)) ||
            isSocketOnlyPreserved(t, apiIdsRef.current)
        );
        return next.length === prev.length ? prev : next;
      });
    }, 10000);
    return () => clearInterval(id);
  }, []);

  // ==================== SHARED SOCKET (AdminLayout) ====================
  useEffect(() => {
    if (!socket) return undefined;

    socket.emit("joinLiveMap");

    const onLocationBatch = (payload) => {
      const updates = payload?.updates;
      if (!Array.isArray(updates)) return;
      setTechnicians((prev) => {
        const indexById = new Map(prev.map((t, i) => [String(t._id), i]));
        let next = prev;
        for (const data of updates) {
          if (!data) continue;
          const idx = indexById.get(String(data.technician_id));
          // Unknown technician: a location event carries no name, phone or
          // vehicle, so upserting one here painted a nameless "Technician"
          // ghost that outlived the real record. Let the REST poll or
          // technicianOnline introduce them properly instead.
          if (idx === undefined) continue;
          if (next === prev) next = [...prev];
          next[idx] = { ...next[idx], ...buildLocationPatch(data) };
        }
        return next;
      });
    };

    const onLocationUpdate = (data) => {
      if (!data) return;
      const id = String(data.technician_id);
      setTechnicians((prev) => {
        if (!prev.some((t) => String(t._id) === id)) return prev;
        const patch = buildLocationPatch(data);
        return prev.map((t) => (String(t._id) === id ? { ...t, ...patch } : t));
      });
    };

    const onLocationStale = (data) => {
      if (!data) return;
      const id = String(data.technician_id);
      const lastLocationAt = data.lastLocationAt || null;
      setTechnicians((prev) => {
        // Same rule as location updates: never invent a technician from an
        // event carrying no profile. This one used to fabricate a locationless
        // row hardcoded to "On Job" that no marker ever drew, but the side
        // panel listed and the stale badge counted.
        if (!prev.some((t) => String(t._id) === id)) return prev;
        return prev.map((t) =>
          String(t._id) === id
            ? {
                ...t,
                locationStale: true,
                lastLocationAt: lastLocationAt || t.lastLocationAt,
                _socketPresenceAt: new Date().toISOString(),
              }
            : t
        );
      });
    };

    const onTechnicianOnline = (data) => {
      const id = String(data.technician_id);
      const status = data.currentStatus || "Online";
      // Ignore Offline presence events here — handled by technicianOffline
      if (!["Online", "On Job"].includes(status)) return;
      const presenceAt = data.lastLocationAt || new Date().toISOString();
      setTechnicians((prev) => {
        const exists = prev.find((t) => String(t._id) === id);
        if (exists) {
          return prev.map((t) =>
            String(t._id) === id
              ? {
                  ...t,
                  ...data,
                  _id: id,
                  currentStatus: status,
                  lastLocationAt: data.lastLocationAt || t.lastLocationAt,
                  locationStale: data.locationStale ?? t.locationStale,
                  _socketPresenceAt: presenceAt,
                }
              : t
          );
        }
        return [
          ...prev,
          {
            ...data,
            _id: id,
            currentStatus: status,
            lastLocationAt: data.lastLocationAt || null,
            locationStale: data.locationStale === true,
            _socketPresenceAt: presenceAt,
          },
        ];
      });
    };

    const onTechnicianOffline = (data) => {
      const id = String(data.technician_id);
      setTechnicians((prev) => prev.filter((t) => String(t._id) !== id));
      setSelectedTechId((prev) => (prev === id ? null : prev));
    };

    socket.on("technicianLocationBatch", onLocationBatch);
    socket.on("technicianLocationUpdate", onLocationUpdate);
    socket.on("technicianLocationStale", onLocationStale);
    socket.on("technicianOnline", onTechnicianOnline);
    socket.on("technicianOffline", onTechnicianOffline);

    return () => {
      socket.off("technicianLocationBatch", onLocationBatch);
      socket.off("technicianLocationUpdate", onLocationUpdate);
      socket.off("technicianLocationStale", onLocationStale);
      socket.off("technicianOnline", onTechnicianOnline);
      socket.off("technicianOffline", onTechnicianOffline);
    };
  }, [socket]);

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
  // Live Map shows Online / On Job only — never Offline.
  const visibleTechnicians = useMemo(
    () => technicians.filter((t) => ["Online", "On Job"].includes(t.currentStatus)),
    [technicians]
  );

  const vehiclesList = useMemo(() => {
    const vehicles = [];
    const seen = new Set();
    visibleTechnicians.forEach((t) => {
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
  }, [visibleTechnicians]);

  // Search applies to the panels too. It used to filter only the markers, so
  // typing emptied the map while the side list showed the whole fleet.
  const searchedTechnicians = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return visibleTechnicians;
    return visibleTechnicians.filter(
      (t) =>
        `${t.firstName || ""} ${t.lastName || ""}`.toLowerCase().includes(q) ||
        (t.phone && String(t.phone).toLowerCase().includes(q))
    );
  }, [visibleTechnicians, searchQuery]);

  const filteredTechnicians = useMemo(() => {
    let result = searchedTechnicians;
    if (selectedTechFilter) result = result.filter((t) => t._id === selectedTechFilter);
    if (selectedVehicleFilter)
      result = result.filter((t) => t.vehicle && t.vehicle._id === selectedVehicleFilter);
    return result;
  }, [searchedTechnicians, selectedTechFilter, selectedVehicleFilter]);

  // lastSeenTick is a real dependency: countVisibleStaleTechnicians reads the
  // clock internally, so without it the badge froze at whatever it was when
  // `technicians` last changed while the markers kept fading independently.
  const staleCount = useMemo(
    () => countVisibleStaleTechnicians(technicians),
    [technicians, lastSeenTick]
  );

  // A filter pinned to a technician who has since gone Offline (or a vehicle
  // whose technician has) left the map blank with no affordance explaining why
  // and no way to un-toggle it.
  useEffect(() => {
    if (
      selectedTechFilter &&
      !visibleTechnicians.some((t) => t._id === selectedTechFilter)
    ) {
      setSelectedTechFilter(null);
    }
  }, [visibleTechnicians, selectedTechFilter]);

  useEffect(() => {
    if (
      selectedVehicleFilter &&
      !vehiclesList.some((v) => v._id === selectedVehicleFilter)
    ) {
      setSelectedVehicleFilter(null);
    }
  }, [vehiclesList, selectedVehicleFilter]);

  // Derive the popup's technician from live state — holding the object captured
  // at click time froze its position and its "last seen" timestamp.
  // Derived from the FILTERED list: an InfoWindow used to stay open — or
  // spontaneously reopen — over a technician no marker was drawing.
  const selectedTech = useMemo(
    () =>
      selectedTechId
        ? filteredTechnicians.find((t) => String(t._id) === selectedTechId) ?? null
        : null,
    [filteredTechnicians, selectedTechId]
  );

  // ==================== MAP HELPERS ====================
  const onMapLoad = useCallback((map) => { mapRef.current = map; }, []);

  const centerOnTechnician = useCallback((tech) => {
    // Without the guard, clicking a technician who has never reported a fix
    // panned the map to 0,0 in the Gulf of Guinea at zoom 15.
    if (!mapRef.current || !hasUsableLocation(tech)) return;
    mapRef.current.panTo({
      lat: tech.location.latitude,
      lng: tech.location.longitude,
    });
    mapRef.current.setZoom(15);
  }, []);

  const getInitials = (f, l) => `${(f || "")[0] || ""}${(l || "")[0] || ""}`.toUpperCase();

  const getStatusClass = (status) => (status === "On Job" ? "on-job" : "online");

  const showInitialLoading = (isLoading || isFetching) && technicians.length === 0 && !isError;

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
            title={
              socketConnected
                ? "Socket connected — receiving real-time events (check last-seen for GPS freshness)"
                : "Connecting to real-time updates…"
            }
          >
            <span className="live-map-socket-dot" />
            {socketConnected ? "Connected" : "Connecting…"}
          </span>
          {staleCount > 0 && (
            <span className="live-map-stale-count" title="Technicians with stale GPS">
              {staleCount} stale
            </span>
          )}
          <div className="live-map-breadcrumb">
            <Link to="/dashboard">Dashboard</Link>
            <span className="live-map-breadcrumb-sep">&gt;</span>
            <span className="live-map-breadcrumb-current">Live Map</span>
          </div>
        </div>
      </div>

      {!socketConnected && restPollFallback && (
        <div className="live-map-error-banner">
          <span>
            Real-time updates unavailable. Positions refresh every{" "}
            {Math.round(REST_POLL_MS / 1000)}s until the socket reconnects.
          </span>
        </div>
      )}

      {isError && (
        <div className="live-map-error-banner">
          <span>Could not load technicians. Real-time updates may still work.</span>
          <button type="button" className="live-map-error-retry" onClick={() => refetch()}>
            Retry
          </button>
        </div>
      )}

      {/* ===== FILTER BAR ===== */}
      <div className="live-map-filterbar">
        <div className="live-map-filter-tabs">
          <div
            className={`live-map-filter-tab${activeTab === "technician" ? " active" : ""}`}
            role="button"
            tabIndex={0}
            aria-pressed={activeTab === "technician"}
            onKeyDown={(e) => {
              if (e.key !== "Enter" && e.key !== " ") return;
              e.preventDefault();
              toggleTab("technician");
              setSelectedVehicleFilter(null);
            }}
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
            role="button"
            tabIndex={0}
            aria-pressed={activeTab === "vehicle"}
            onKeyDown={(e) => {
              if (e.key !== "Enter" && e.key !== " ") return;
              e.preventDefault();
              toggleTab("vehicle");
              setSelectedTechFilter(null);
            }}
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
        {showInitialLoading && (
          <div className="live-map-loading-overlay">Loading technicians…</div>
        )}
        <GoogleMap
          mapContainerStyle={mapContainerStyle}
          center={MAP_CENTER}
          zoom={MAP_ZOOM}
          options={mapOptions}
          onLoad={onMapLoad}
          onClick={() => setSelectedTechId(null)}
        >
          {/* TODO(fleet-scale): wrap markers in MarkerClustererF when concurrent fleet
              routinely exceeds ~50 (see @react-google-maps/api MarkerClustererF). */}
          {filteredTechnicians.map((tech) => {
            if (!hasUsableLocation(tech)) return null;

            const stale = isTechLocationStale(tech);
            const onJob = tech.currentStatus === "On Job";

            return (
              <Marker
                key={tech._id}
                position={{ lat: tech.location.latitude, lng: tech.location.longitude }}
                opacity={stale ? 0.45 : 1}
                icon={getMarkerIcon(tech)}
                label={getMarkerLabel(tech)}
                onClick={() => setSelectedTechId(String(tech._id))}
                title={`${tech.firstName} ${tech.lastName}${onJob ? " (On Job)" : ""}${stale ? " (stale location)" : ""}`}
              />
            );
          })}

          {/* ===== MINIMAL TOOLTIP POPUP (Figma) ===== */}
          {selectedTech && hasUsableLocation(selectedTech) && (
            <InfoWindow
              position={{ lat: selectedTech.location.latitude, lng: selectedTech.location.longitude }}
              onCloseClick={() => setSelectedTechId(null)}
              options={{ pixelOffset: new window.google.maps.Size(0, -26), maxWidth: 260 }}
            >
              <div className="tech-popup">
                <p className="tech-popup-name">
                  {selectedTech.firstName} {selectedTech.lastName}
                </p>
                <p className={`tech-popup-status ${selectedTech.currentStatus === "On Job" ? "on-job" : "online"}`}>
                  {selectedTech.currentStatus}
                  {!isTechLocationStale(selectedTech) ? (
                    <span className="tech-popup-fresh"> · Live</span>
                  ) : (
                    <span className="tech-popup-stale"> · Stale location</span>
                  )}
                </p>
                <p className="tech-popup-lastseen">
                  Last seen: {formatLastSeen(selectedTech)}
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
              {searchedTechnicians.length === 0 && (
                <div style={{ padding: 24, textAlign: "center", color: "#667085", fontSize: 13 }}>
                  {visibleTechnicians.length === 0
                    ? "No technicians online"
                    : "No technicians match your search"}
                </div>
              )}
              {searchedTechnicians.map((t) => (
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
                    <div className="lm-tech-name">
                      {t.firstName} {t.lastName}
                      {isTechLocationStale(t) ? (
                        <span className="lm-tech-stale-label"> · stale</span>
                      ) : null}
                    </div>
                    <div className="lm-tech-phone">
                      {t.phone}
                      {!isTechLocationStale(t) ? (
                        <span className="lm-tech-fresh-label"> · {formatLastSeen(t)}</span>
                      ) : null}
                    </div>
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
