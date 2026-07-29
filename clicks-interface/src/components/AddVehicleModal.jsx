import React, { useState, useEffect } from "react";
import { useCreateVehicleMutation } from "../store/vehicleApi";
import { useGetVehicleMakesQuery, useGetVehicleModelsQuery } from "../store/vehicleConfigApi";
import CustomSelect from "./CustomSelect";
import "./AddVehicleModal.css";

function AddVehicleModal({ open, onClose, onSuccess }) {
  const [formData, setFormData] = useState({
    make: "",
    model: "",
    year: "",
    plateNumber: "",
    vinNumber: "",
    color: "",
    assignedTechnician: "",
    expirationDate: ""
  });
  const [files, setFiles] = useState({});
  const [createVehicle, { isLoading }] = useCreateVehicleMutation();
  
  const { data: makesData } = useGetVehicleMakesQuery();
  const { data: modelsData } = useGetVehicleModelsQuery();
  
  const makes = makesData?.makes || [];
  const allModels = modelsData?.models || [];
  
  // Filter models based on selected make
  const models = formData.make 
    ? allModels.filter(model => model.makeId === formData.make)
    : [];

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value,
      // Reset model when make changes
      ...(name === 'make' && { model: '' })
    }));
  };

  const handleFileChange = (field, e) => {
    const file = e.target.files[0];
    setFiles(prev => ({
      ...prev,
      [field]: file
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const formDataToSend = new FormData();
      
      // Add all form fields
      Object.keys(formData).forEach(key => {
        if (formData[key]) {
          if (key === 'expirationDate') {
            formDataToSend.append('estimaraExpiration', formData[key]);
          } else {
            formDataToSend.append(key, formData[key]);
          }
        }
      });
      
      // Add files
      Object.keys(files).forEach(key => {
        if (files[key]) {
          formDataToSend.append(key, files[key]);
        }
      });
      
      await createVehicle(formDataToSend).unwrap();
      onSuccess?.();
      handleCancel();
    } catch (error) {
      console.error("Error creating vehicle:", error);
      alert("Failed to create vehicle. Please try again.");
    }
  };

  const handleCancel = () => {
    setFormData({
      make: "",
      model: "",
      year: "",
      plateNumber: "",
      vinNumber: "",
      color: "",
      assignedTechnician: "",
      expirationDate: ""
    });
    setFiles({});
    onClose();
  };

  if (!open) return null;

  return (
    <div className="add-vehicle-modal-backdrop">
      <div className="add-vehicle-modal">
        <button className="add-vehicle-modal-close" onClick={handleCancel} aria-label="Close">
          <span className="add-vehicle-modal-close-x">&#10005;</span>
        </button>
        <form onSubmit={handleSubmit} autoComplete="off">
          <div className="add-vehicle-modal-header">
            <div className="add-vehicle-modal-title">Add New Vehicle</div>
            <div className="add-vehicle-modal-subtitle">Add your vehicle details</div>
          </div>
          <div className="add-vehicle-modal-section">
            <div className="add-vehicle-modal-section-title">Vehicle Information</div>
            <div className="add-vehicle-modal-fields">
              <div className="add-vehicle-modal-row">
                <div className="add-vehicle-modal-field">
                  <label>Make*</label>
                  <CustomSelect
                    value={formData.make}
                    onChange={(value) => setFormData(prev => ({ ...prev, make: value, model: '' }))}
                    options={makes.map(make => ({
                      value: make._id,
                      label: make.makeName
                    }))}
                    placeholder="Select Make"
                    searchable
                  />
                </div>
                <div className="add-vehicle-modal-field">
                  <label>Model*</label>
                  <CustomSelect
                    value={formData.model}
                    onChange={(value) => setFormData(prev => ({ ...prev, model: value }))}
                    options={models.map(model => ({
                      value: model._id,
                      label: model.modelName
                    }))}
                    placeholder={formData.make ? "Select Model" : "Select Make First"}
                    disabled={!formData.make}
                    searchable
                  />
                </div>
              </div>
              <div className="add-vehicle-modal-row">
                <div className="add-vehicle-modal-field">
                  <label>Year*</label>
                  <input
                    type="number"
                    name="year"
                    value={formData.year}
                    onChange={handleInputChange}
                    min="1900"
                    max="2025"
                    required
                  />
                </div>
                <div className="add-vehicle-modal-field">
                  <label>Plate Number*</label>
                  <input
                    type="text"
                    name="plateNumber"
                    value={formData.plateNumber}
                    onChange={handleInputChange}
                    placeholder="ABC-123"
                    required
                  />
                </div>
              </div>
              <div className="add-vehicle-modal-row">
                <div className="add-vehicle-modal-field">
                  <label>VIN Number*</label>
                  <input
                    type="text"
                    name="vinNumber"
                    value={formData.vinNumber}
                    onChange={handleInputChange}
                    placeholder="1HGBH41JXMN109186"
                    required
                  />
                </div>
                <div className="add-vehicle-modal-field">
                  <label>Color*</label>
                  <input
                    type="text"
                    name="color"
                    value={formData.color}
                    onChange={handleInputChange}
                    placeholder="White"
                    required
                  />
                </div>
              </div>
              <div className="add-vehicle-modal-row">
                <div className="add-vehicle-modal-field" style={{ width: 612 }}>
                  <label>Vehicle Image*</label>
                  <label className="add-vehicle-modal-upload">
                    <span className="add-vehicle-modal-upload-text">
                      {files.vehicleImage ? files.vehicleImage.name : "Upload File here"}
                    </span>
                    <img src="/icons/job.svg" alt="Upload" className="add-vehicle-modal-upload-icon" />
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleFileChange('vehicleImage', e)}
                    />
                  </label>
                </div>
              </div>
            </div>
          </div>
          <div className="add-vehicle-modal-section">
            <div className="add-vehicle-modal-section-title">Required Documents</div>
            <div className="add-vehicle-modal-fields">
              <div className="add-vehicle-modal-row">
                <div className="add-vehicle-modal-field">
                  <label>Estimara Front*</label>
                  <label className="add-vehicle-modal-upload">
                    <span className="add-vehicle-modal-upload-text">
                      {files.estimaraFront ? files.estimaraFront.name : "Upload File here"}
                    </span>
                    <img src="/icons/job.svg" alt="Upload" className="add-vehicle-modal-upload-icon" />
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleFileChange('estimaraFront', e)}
                    />
                  </label>
                </div>
                <div className="add-vehicle-modal-field">
                  <label>Estimara Back*</label>
                  <label className="add-vehicle-modal-upload">
                    <span className="add-vehicle-modal-upload-text">
                      {files.estimaraBack ? files.estimaraBack.name : "Upload File here"}
                    </span>
                    <img src="/icons/job.svg" alt="Upload" className="add-vehicle-modal-upload-icon" />
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleFileChange('estimaraBack', e)}
                    />
                  </label>
                </div>
              </div>
              <div className="add-vehicle-modal-row">
                <div className="add-vehicle-modal-field" style={{ width: 612 }}>
                  <label>Estimara Expiration Date*</label>
                  <input
                    type="date"
                    name="expirationDate"
                    value={formData.expirationDate}
                    onChange={handleInputChange}
                    required
                  />
                </div>
              </div>
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 24 }}>
            <button className="add-vehicle-modal-submit" type="submit" disabled={isLoading}>
              {isLoading ? "Creating..." : "Submit"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default AddVehicleModal;
