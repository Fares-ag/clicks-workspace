import React, { useState } from "react";
import "./AssignVehicleDropdown.css";

function AssignVehicleDropdown({ open, onClose, onAssign, vehicles = [] }) {
  const [searchTerm, setSearchTerm] = useState("");

  const filteredVehicles = vehicles.filter(vehicle =>
    vehicle.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleVehicleSelect = (vehicle) => {
    onAssign(vehicle);
    onClose();
  };

  if (!open) return null;

  return (
    <>
      <div className="assign-overlay" onClick={onClose} />
      <div className="assign-vehicle-dropdown">
        <div className="assign-header">
          <span className="assign-title">Assign Vehicle</span>
        </div>
        
        <div className="assign-search-container">
          <input
            type="text"
            className="assign-search-input"
            placeholder="Search..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="assign-vehicles-list">
          {filteredVehicles.map((vehicle) => (
            <div
              key={vehicle.id}
              className="assign-vehicle-option"
              onClick={() => handleVehicleSelect(vehicle)}
            >
              <img 
                src="/icons/van.png" 
                alt="Vehicle" 
                className="assign-vehicle-icon"
              />
              <span className="assign-vehicle-name">{vehicle.name}</span>
            </div>
          ))}
          {filteredVehicles.length === 0 && (
            <div className="assign-no-results">No vehicles found</div>
          )}
        </div>
      </div>
    </>
  );
}

export default AssignVehicleDropdown;
