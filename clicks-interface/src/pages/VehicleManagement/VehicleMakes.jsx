import React, { useState } from "react";
import {
  useGetVehicleMakesQuery,
  useGetVehicleModelsQuery,
  useCreateVehicleMakeMutation,
  useCreateVehicleModelMutation,
  useUpdateVehicleMakeMutation,
  useUpdateVehicleModelMutation
} from "../../store/vehicleConfigApi";
import AddVehicleConfigModal from "../../components/AddVehicleConfigModal.jsx";
import "./VehicleMakes.css";

function VehicleMakes() {
  const { data: makesData, isLoading: makesLoading, refetch: refetchMakes } = useGetVehicleMakesQuery();
  const { data: modelsData, isLoading: modelsLoading, refetch: refetchModels } = useGetVehicleModelsQuery();
  const [createVehicleMake] = useCreateVehicleMakeMutation();
  const [createVehicleModel] = useCreateVehicleModelMutation();
  const [updateVehicleMake] = useUpdateVehicleMakeMutation();
  const [updateVehicleModel] = useUpdateVehicleModelMutation();

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [searchText, setSearchText] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);

  const isLoading = makesLoading || modelsLoading;

  const handleAdd = () => {
    setEditing(null);
    setModalOpen(true);
  };

  const handleEdit = (item) => {
    setEditing({ 
      make: item.make, 
      model: item.model,
      makeId: item.makeId,
      modelId: item.modelId
    });
    setModalOpen(true);
  };

  const handleSubmit = async ({ make, makeId, model }) => {
    try {
      if (editing) {
        // Update existing make/model
        if (editing.makeId && make !== editing.make) {
          await updateVehicleMake({ 
            id: editing.makeId, 
            makeName: make 
          }).unwrap();
        }
        if (editing.modelId && model !== editing.model) {
          await updateVehicleModel({ 
            id: editing.modelId, 
            modelName: model
          }).unwrap();
        }
      } else {
        // Create or use existing make
        let finalMakeId = makeId;
        
        if (!makeId) {
          // Create new make
          const makeResult = await createVehicleMake({ 
            makeName: make,
            isActive: true 
          }).unwrap();
          finalMakeId = makeResult.make._id;
        }
        
        // Create new model with the make ID
        await createVehicleModel({ 
          modelName: model, 
          makeId: finalMakeId,
          isActive: true
        }).unwrap();
      }
      
      refetchMakes();
      refetchModels();
      setModalOpen(false);
    } catch (err) {
      console.error("Failed to save vehicle type:", err);
      alert(err?.data?.message || "Failed to save vehicle type. Please try again.");
    }
  };

  const makes = makesData?.makes || [];
  const models = modelsData?.models || [];

  // Combine makes and models for display
  const combinedData = [];
  makes.forEach(make => {
    const makeModels = models.filter(model => model.makeId === make._id);
    if (makeModels.length > 0) {
      makeModels.forEach(model => {
        combinedData.push({
          make: make.makeName,
          model: model.modelName,
          makeId: make._id,
          modelId: model._id
        });
      });
    } else {
      combinedData.push({
        make: make.makeName,
        model: "",
        makeId: make._id,
        modelId: null
      });
    }
  });

  const filteredData = combinedData.filter(item =>
    item.make.toLowerCase().includes(searchText.toLowerCase()) ||
    item.model.toLowerCase().includes(searchText.toLowerCase())
  );

  return (
    <div className="vehicle-makes-container">
      {/* Page Title */}
      <h1 className="vehicle-makes-page-title">Vehicle Configuration</h1>

      {/* Table Card */}
      <div className="vehicle-makes-table-card">
        {/* Header Section */}
        <div className="vehicle-makes-header">
          <div className="vehicle-makes-header-left">
            <h2 className="vehicle-makes-title">Vehicle</h2>
            <div className="vehicle-makes-controls">
              {/* Search Input */}
              <div className="vehicle-makes-search">
                <img src="/icons/Search.svg" alt="Search" className="vehicle-makes-search-icon" />
                <input
                  type="text"
                  placeholder="Search..."
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  className="vehicle-makes-search-input"
                />
              </div>
              {/* Filter Button */}
              <button className="vehicle-makes-filter-btn" onClick={() => setFilterOpen(!filterOpen)}>
                <img src="/icons/Filter.svg" alt="Filter" />
                <span>Filter</span>
              </button>
            </div>
          </div>
          {/* Add Button */}
          <button className="vehicle-makes-add-btn" onClick={handleAdd}>
            Add New Vehicle Type
          </button>
        </div>

        {/* Table */}
        <div className="vehicle-makes-table">
          <table>
            <thead>
              <tr>
                <th>Make</th>
                <th>Model</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan="3" style={{ textAlign: 'center', padding: '40px' }}>
                    Loading...
                  </td>
                </tr>
              ) : filteredData.length === 0 ? (
                <tr>
                  <td colSpan="3" style={{ textAlign: 'center', padding: '40px' }}>
                    No vehicle types found
                  </td>
                </tr>
              ) : (
                filteredData.map((item, index) => (
                  <tr key={`${item.makeId}-${item.modelId}-${index}`}>
                    <td>{item.make}</td>
                    <td>{item.model}</td>
                    <td>
                      <button 
                        className="vehicle-makes-edit-btn"
                        onClick={() => handleEdit(item)}
                      >
                        <img src="/icons/pencil.svg" alt="Edit" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit Modal */}
      <AddVehicleConfigModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSubmit={handleSubmit}
        editing={editing}
      />
    </div>
  );
}

export default VehicleMakes;
