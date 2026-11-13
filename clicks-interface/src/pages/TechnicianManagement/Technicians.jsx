import React, { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { message } from "antd";
import DataTable from "../../components/DataTable/DataTable.jsx";
import { useGetTechniciansQuery, useGetAssignmentRosterQuery, useGetTechnicianByIdQuery, useAssignVehicleMutation, useToggleTechnicianActiveMutation } from "../../store/technicianApi";
import { useGetVehiclesQuery } from "../../store/vehicleApi";
import SuccessModal from "../../components/SuccessModal.jsx";
import ConfirmationModal from "../../components/ConfirmationModal.jsx";
import TechnicianFilterDropdown from "../../components/TechnicianFilterDropdown.jsx";
import "./Technicians.css";
import AddTechnicianModal from "../../components/AddTechnicianModal.jsx";
import EditTechnicianModal from "../../components/EditTechnicianModal.jsx";

function TechnicianVehicleDropdown({ technicianId, assignedVehicle, onAssign }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 });
  const buttonRef = useRef(null);
  
  const { data: vehiclesData } = useGetVehiclesQuery({ page: 1, limit: 100, search: "" });
  const { data: rosterData } = useGetAssignmentRosterQuery();
  const allVehicles = vehiclesData?.vehicles || [];
  const allTechs = rosterData?.technicians || [];
  
  // Create a map of vehicle IDs to assigned technician info
  const vehicleAssignments = {};
  allTechs.forEach(tech => {
    if (tech.assignedVehicle) {
      vehicleAssignments[tech.assignedVehicle._id || tech.assignedVehicle] = {
        name: `${tech.firstName} ${tech.lastName}`,
        id: tech._id
      };
    }
  });
  
  const filteredVehicles = allVehicles.filter(
    v => {
      const make = v.make?.makeName || "";
      const model = v.model?.modelName || "";
      const plate = v.plateNumber || "";
      const searchLower = search.toLowerCase();
      return make.toLowerCase().includes(searchLower) ||
             model.toLowerCase().includes(searchLower) ||
             plate.toLowerCase().includes(searchLower);
    }
  );

  const displayVehicle = assignedVehicle
    ? `${assignedVehicle.model?.modelName || ""} - ${assignedVehicle.plateNumber || ""}`
    : "No Vehicle";

  const handleToggle = () => {
    if (!open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const dropdownWidth = 260;
      setDropdownPosition({
        top: rect.bottom + 4,
        left: rect.left - dropdownWidth + rect.width // Align right edge of dropdown with button
      });
    }
    setOpen(o => !o);
  };

  return (
    <div className="tech-vehicle-dropdown">
      <img
        src="/icons/car.png"
        alt="Vehicle"
        className="tech-vehicle-img"
      />
      <span className="tech-vehicle-model">
        {displayVehicle}
      </span>
      <button
        ref={buttonRef}
        className="tech-vehicle-dropdown-btn"
        onClick={handleToggle}
      >
        <img src="/icons/arrow-down.svg" alt="Assign Vehicle" />
      </button>
      {open && (
        <>
          <div className="tech-vehicle-dropdown-overlay" onClick={() => setOpen(false)} />
          <div 
            className="tech-vehicle-dropdown-menu"
            style={{
              top: `${dropdownPosition.top}px`,
              left: `${dropdownPosition.left}px`
            }}
          >
            <div className="tech-vehicle-dropdown-title">
              Assign vehicle
            </div>
            <div className="tech-vehicle-dropdown-search-row">
              <img
                src="/icons/Search.svg"
                alt="Search"
                className="tech-vehicle-dropdown-search-icon"
              />
              <input
                className="tech-vehicle-dropdown-search-input"
                placeholder="Search..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <div className="tech-vehicle-dropdown-list">
              {assignedVehicle && (
                <div
                  className="tech-vehicle-dropdown-list-item"
                  onClick={() => {
                    onAssign(null);
                    setOpen(false);
                  }}
                  style={{ borderBottom: '1px solid #E4E7EC', marginBottom: '4px', paddingBottom: '8px' }}
                >
                  <span className="tech-vehicle-dropdown-list-text">
                    Unassign Vehicle
                  </span>
                </div>
              )}
              {filteredVehicles.length === 0 ? (
                <div className="tech-vehicle-dropdown-no-results">No vehicles found</div>
              ) : (
                filteredVehicles.map(v => {
                  const assignedTech = vehicleAssignments[v._id];
                  // Held by *another* technician — compare technician to technician.
                  const isAssigned =
                    assignedTech && String(assignedTech.id) !== String(technicianId);
                  
                  return (
                    <div
                      key={v._id}
                      className="tech-vehicle-dropdown-list-item"
                      onClick={() => {
                        onAssign(v);
                        setOpen(false);
                      }}
                      style={{ opacity: isAssigned ? 0.6 : 1 }}
                    >
                      <img src="/icons/car.png" alt="Car" className="tech-vehicle-dropdown-list-img" />
                      <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                        <span className="tech-vehicle-dropdown-list-text">
                          {v.model?.modelName || ""} - {v.plateNumber}
                        </span>
                        {isAssigned && (
                          <span style={{ fontSize: '11px', color: '#F79009', marginTop: '2px' }}>
                            Assigned to {assignedTech.name}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function TechnicianStatusPill({ status }) {
  const color = "#FFFFFF";
  const bg = status === "Online" ? "#12B76A" : "#667085";
  return (
    <span
      className="tech-pill"
      style={{ background: bg, color }}
    >
      {status}
    </span>
  );
}

function TechnicianApplicationPill({ status }) {
  let color, bg;
  if (status === "Approved") {
    color = "#fff";
    bg = "#12B76A";
  } else if (status === "Pending") {
    color = "#fff";
    bg = "#F79009";
  } else {
    color = "#fff";
    bg = "#F04438";
  }
  return (
    <span
      className="tech-pill"
      style={{ background: bg, color }}
    >
      {status}
    </span>
  );
}

function TechnicianActivationToggle({ active, onToggle, busy = false }) {
  return (
    <button
      type="button"
      className={`tech-activation-toggle${active ? " active" : ""}`}
      onClick={onToggle}
      disabled={busy}
      aria-pressed={active}
      title={active ? "Active — can sign in and take jobs" : "Deactivated — locked out of the app"}
      style={busy ? { opacity: 0.5, cursor: "wait" } : undefined}
    >
      <span
        className="tech-activation-toggle-dot"
        style={{ left: active ? 18 : 2 }}
      />
    </button>
  );
}

function TechnicianActions({ onEdit, onView }) {
  return (
    <div className="tech-actions-cell">
      <button
        className="tech-action-btn"
        onClick={onEdit}
        title="Edit"
      >
        <img src="/icons/pencil.svg" alt="Edit" className="tech-action-icon" />
      </button>
      <button
        className="tech-action-btn"
        onClick={onView}
        title="View"
      >
        <img src="/icons/eye.svg" alt="View" className="tech-action-icon" />
      </button>
    </div>
  );
}

function Technicians() {
  const [page, setPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const [filters, setFilters] = useState({ status: "", application: "" });
  const { data, isLoading, refetch } = useGetTechniciansQuery({ 
    page, 
    limit: 5,
    search: searchTerm,
    currentStatus: filters.status,
    applicationStatus: filters.application
  });
  const [assignVehicle] = useAssignVehicleMutation();
  const [toggleActive] = useToggleTechnicianActiveMutation();
  const [techs, setTechs] = useState([]);
  const [assignedVehicles, setAssignedVehicles] = useState({});
  const [showSuccess, setShowSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [confirmationData, setConfirmationData] = useState({ techId: null, vehicle: null, assignedTo: "" });
  const filterButtonRef = useRef(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const navigate = useNavigate();

  React.useEffect(() => {
    if (data?.technicians) {
      setTechs(data.technicians);
      // Initialize assigned vehicles from API data
      const vehicleMap = {};
      data.technicians.forEach(tech => {
        if (tech.assignedVehicle) {
          vehicleMap[tech._id] = tech.assignedVehicle;
        }
      });
      setAssignedVehicles(vehicleMap);
    }
  }, [data]);

  const handleAssignVehicle = async (techId, vehicle) => {
    try {
      // Handle unassignment
      if (!vehicle) {
        await assignVehicle({ id: techId, vehicleId: null }).unwrap();
        setAssignedVehicles((prev) => {
          const updated = { ...prev };
          delete updated[techId];
          return updated;
        });
        setSuccessMessage("Vehicle unassigned successfully");
        setShowSuccess(true);
        refetch();
        return;
      }

      // Try to assign the vehicle
      await assignVehicle({ id: techId, vehicleId: vehicle._id }).unwrap();
      setAssignedVehicles((prev) => ({ ...prev, [techId]: vehicle }));
      setSuccessMessage("Vehicle assigned successfully");
      setShowSuccess(true);
      refetch();
    } catch (error) {
      console.error("Error assigning vehicle:", error);
      if (error.status === 409) {
        // Vehicle is already assigned to another technician
        const assignedTo = error.data?.assignedTo || "another technician";
        setConfirmationData({
          techId,
          vehicle,
          assignedTo,
          otherTechId: error.data?.technicianId
        });
        setShowConfirmation(true);
      } else {
        alert("Failed to assign vehicle. Please try again.");
      }
    }
  };

  const handleConfirmReassignment = async () => {
    const { techId, vehicle, otherTechId } = confirmationData;
    try {
      if (otherTechId) {
        await assignVehicle({ id: otherTechId, vehicleId: null }).unwrap();
      }
      // Now assign to the new technician
      await assignVehicle({ id: techId, vehicleId: vehicle._id }).unwrap();
      setAssignedVehicles((prev) => ({ ...prev, [techId]: vehicle }));
      setSuccessMessage("Vehicle reassigned successfully");
      setShowSuccess(true);
      refetch();
    } catch (retryError) {
      console.error("Error during reassignment:", retryError);
      alert("Failed to reassign vehicle. Please try again.");
    }
  };

  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editTechId, setEditTechId] = useState(null);

  // What the server last told us about activation, per technician. The list
  // itself is cached server-side, so straight after a change it can still
  // report the old value; showing that made the switch look like it had not
  // worked, which invited a second click that undid the first.
  const [activeOverrides, setActiveOverrides] = useState({});
  const [activationBusy, setActivationBusy] = useState({});
  // { tech, force, message } while a deactivation is waiting for confirmation.
  const [deactivation, setDeactivation] = useState(null);

  const isTechActive = (tech) =>
    activeOverrides[tech._id] !== undefined
      ? activeOverrides[tech._id]
      : tech.isActive !== false;

  const applyActivation = async (tech, isActive, force = false) => {
    const id = tech._id;
    const name = `${tech.firstName || ""} ${tech.lastName || ""}`.trim() || "Technician";
    setActivationBusy((prev) => ({ ...prev, [id]: true }));
    try {
      const res = await toggleActive({ id, isActive, force }).unwrap();
      const saved = res?.technician?.isActive !== false;
      setActiveOverrides((prev) => ({ ...prev, [id]: saved }));
      message.success(
        saved ? `${name} is active again.` : `${name} has been deactivated.`
      );
    } catch (err) {
      if (err?.data?.code === "TECHNICIAN_HAS_ACTIVE_JOB") {
        // Ask again, spelling out what it will do to the job in progress.
        setDeactivation({
          tech,
          force: true,
          message: `${name} has a job in progress${
            err.data.job_reference ? ` (${err.data.job_reference})` : ""
          }. Deactivating now locks them out of the app immediately — they will not be able to finish it — and removes them from the Live Map. Deactivate anyway?`,
        });
      } else {
        message.error(
          err?.data?.message || "Could not change this technician's activation. Nothing was changed."
        );
      }
    } finally {
      setActivationBusy((prev) => ({ ...prev, [id]: false }));
    }
  };

  // Drop an override once the list has caught up with it.
  React.useEffect(() => {
    if (!data?.technicians) return;
    setActiveOverrides((prev) => {
      let next = prev;
      for (const t of data.technicians) {
        if (prev[t._id] !== undefined && (t.isActive !== false) === prev[t._id]) {
          if (next === prev) next = { ...prev };
          delete next[t._id];
        }
      }
      return next;
    });
  }, [data]);

  const handleToggleActive = (tech) => {
    if (activationBusy[tech._id]) return;
    if (isTechActive(tech)) {
      // Turning someone off is never a single stray click.
      const name = `${tech.firstName || ""} ${tech.lastName || ""}`.trim() || "this technician";
      setDeactivation({
        tech,
        force: false,
        message: `Deactivate ${name}? They will be signed out of the technician app and will not receive jobs until reactivated.`,
      });
      return;
    }
    applyActivation(tech, true);
  };

  const handleEdit = (tech) => {
    setEditTechId(tech._id);
    setEditModalOpen(true);
  };

  const {
    data: editTechData,
    isLoading: editTechLoading,
    error: editTechError
  } = useGetTechnicianByIdQuery(editTechId, { skip: !editModalOpen || !editTechId });

  const columns = [
    {
      title: "Profile Photo",
      key: "profilePhoto",
      dataIndex: "profilePhoto",
      width: "127px",
      mobile: { featured: true, order: 0 },
      render: (row) => (
        <div className="tech-profile-photo-cell">
          <img
            src={row.profileImage || "/icons/user.svg"}
            alt="Technician"
            className="tech-name-img"
          />
        </div>
      )
    },
    {
      title: "Name",
      key: "name",
      dataIndex: "name",
      width: "flex",
      mobile: { featured: true, order: 1 },
      render: (row) => (
        <span className="tech-name-text">
          {row.firstName + " " + row.lastName}
        </span>
      )
    },
    {
      title: "Phone Number",
      key: "phone",
      dataIndex: "phone",
      width: "flex",
      render: (row) => (
        <span className="tech-phone-cell">
          {row.phone}
        </span>
      )
    },
    {
      title: "Application",
      key: "applicationStatus",
      dataIndex: "applicationStatus",
      width: "flex",
      render: (row) => (
        <TechnicianApplicationPill status={row.applicationStatus} />
      )
    },
    {
      title: "Current Status",
      key: "currentStatus",
      dataIndex: "currentStatus",
      width: "flex",
      render: (row) => (
        <TechnicianStatusPill status={row.currentStatus} />
      )
    },
    {
      title: "Activation",
      key: "isActive",
      dataIndex: "isActive",
      width: "flex",
      render: (row) => (
        <TechnicianActivationToggle
          active={isTechActive(row)}
          busy={!!activationBusy[row._id]}
          onToggle={() => handleToggleActive(row)}
        />
      )
    },
    {
      title: "Assigned Vehicle",
      key: "assignedVehicle",
      dataIndex: "assignedVehicle",
      width: "250px",
      mobile: { order: 10, label: "Vehicle" },
      render: (row) => (
        <TechnicianVehicleDropdown
          technicianId={row._id}
          assignedVehicle={assignedVehicles[row._id]}
          onAssign={(vehicle) => handleAssignVehicle(row._id, vehicle)}
        />
      )
    },
    {
      title: "Action",
      key: "action",
      dataIndex: "action",
      width: "120px",
      render: (row) => (
        <TechnicianActions
          onEdit={() => handleEdit(row)}
          onView={() => navigate(`/technicians/${row._id}`)}
        />
      )
    }
  ];

  const [modalOpen, setModalOpen] = useState(false);

  const handleFilterApply = (newFilters) => {
    setFilters(newFilters);
    setPage(1); // Reset to first page when filters change
    setFilterOpen(false);
  };

  const handleSearch = (value) => {
    setSearchTerm(value);
    setPage(1); // Reset to first page when search changes
  };

  return (
    <div className="technicians-container">
      <div className="technicians-header-row">
        <span className="technicians-title">
          Technician Management
        </span>
        <button className="technicians-add-btn" onClick={() => setModalOpen(true)}>
          + Add New Technician
        </button>
      </div>
      <DataTable
        columns={columns}
        data={techs}
        loading={isLoading}
        onSearch={handleSearch}
        onFilter={() => setFilterOpen(!filterOpen)}
        filterButtonRef={filterButtonRef}
        filterDropdown={
          <TechnicianFilterDropdown
            open={filterOpen}
            onClose={() => setFilterOpen(false)}
            onApply={handleFilterApply}
            anchorEl={filterButtonRef.current}
          />
        }
        pagination={{
          current: page,
          total: data?.total || 0,
          pageSize: 5,
          onChange: (newPage) => setPage(newPage)
        }}
        title="Technicians"
      />
      <AddTechnicianModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSuccess={() => {
          setSuccessMessage("Technician added successfully");
          setShowSuccess(true);
          refetch();
        }}
      />
      <EditTechnicianModal
        open={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        technician={editTechData?.technician}
        loading={editTechLoading}
        error={editTechError}
        onSuccess={() => {
          setSuccessMessage("Technician updated successfully");
          setShowSuccess(true);
          setEditModalOpen(false);
          refetch();
        }}
      />
      <SuccessModal
        open={showSuccess}
        onClose={() => setShowSuccess(false)}
        title="Success"
        subtitle={successMessage}
      />
      <ConfirmationModal
        open={showConfirmation}
        onClose={() => setShowConfirmation(false)}
        onConfirm={handleConfirmReassignment}
        title="Reassign Vehicle"
        message={`This vehicle is currently assigned to ${confirmationData.assignedTo}. Are you sure you want to reassign it to this technician?`}
      />
      <ConfirmationModal
        open={!!deactivation}
        onClose={() => setDeactivation(null)}
        onConfirm={() => {
          if (deactivation) applyActivation(deactivation.tech, false, deactivation.force);
        }}
        title={deactivation?.force ? "Technician is on a job" : "Deactivate technician"}
        message={deactivation?.message || ""}
      />
    </div>
  );
}

export default Technicians;
