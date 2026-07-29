import React, { useState, useEffect } from "react";
import { useGetVehicleMakesQuery, useGetVehicleModelsByMakeQuery } from "../store/vehicleConfigApi";
import CustomSelect from "./CustomSelect";
import DatePicker from "./DatePicker";
import PhoneInput from "./PhoneInput";
import {
  DEFAULT_COUNTRY_CODE,
  isValidLocalPhone,
  toLocalDigits,
} from "../utils/phone";
import "./AddInsuranceModal.css";

export default function AddInsuranceModal({ open, onClose, onSuccess }) {
  const [formData, setFormData] = useState({
    make: "",
    model: "",
    year: "",
    color: "",
    plateNumber: "",
    vinNumber: "",
    clientName: "",
    countryCode: DEFAULT_COUNTRY_CODE,
    phoneNumber: "",
    subscriptionType: "",
    startDate: "",
    endDate: ""
  });

  const { data: makesData } = useGetVehicleMakesQuery();
  const { data: modelsData, isLoading: isLoadingModels } = useGetVehicleModelsByMakeQuery(formData.make, {
    skip: !formData.make
  });

  const makes = makesData?.makes || [];
  const models = modelsData?.models || [];

  const [startDatePickerOpen, setStartDatePickerOpen] = useState(false);
  const [endDatePickerOpen, setEndDatePickerOpen] = useState(false);

  // Updated subscription types
  const subscriptionTypes = ["Comprehensive", "Third-party"];

  useEffect(() => {
    if (!open) {
      setFormData({
        make: "",
        model: "",
        year: "",
        color: "",
        plateNumber: "",
        vinNumber: "",
        clientName: "",
        countryCode: DEFAULT_COUNTRY_CODE,
        phoneNumber: "",
        subscriptionType: "",
        startDate: "",
        endDate: ""
      });
    }
  }, [open]);

  if (!open) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!isValidLocalPhone(formData.phoneNumber)) {
      alert("Phone number must be exactly 8 digits (without country code)");
      return;
    }
    onSuccess({
      ...formData,
      phoneNumber: toLocalDigits(formData.phoneNumber, formData.countryCode),
    });
  };

  const handleClose = () => {
    setFormData({
      make: "",
      model: "",
      year: "",
      color: "",
      plateNumber: "",
      vinNumber: "",
      clientName: "",
      countryCode: DEFAULT_COUNTRY_CODE,
      phoneNumber: "",
      subscriptionType: "",
      startDate: "",
      endDate: ""
    });
    onClose();
  };

  return (
    <div className="add-insurance-modal-backdrop" onClick={handleClose}>
      <div className="add-insurance-modal" onClick={(e) => e.stopPropagation()}>
        {/* Close Button */}
        <button className="add-insurance-modal-close" onClick={handleClose}>
          <div className="add-insurance-modal-close-icon">✕</div>
        </button>

        <form onSubmit={handleSubmit}>
          {/* Title */}
          <div className="add-insurance-modal-header">
            <h2 className="add-insurance-modal-title">Add New Insurance Form</h2>
          </div>

          {/* Inputs */}
          <div className="add-insurance-modal-inputs">
            <p className="add-insurance-modal-subtitle">Enter new vehicle insurance.</p>

            {/* Make and Model Row */}
            <div className="add-insurance-modal-row">
              <div className="add-insurance-modal-field">
                <label>Make*</label>
                <CustomSelect
                  value={formData.make}
                  onChange={(value) => setFormData({ ...formData, make: value, model: "" })}
                  options={makes.map(make => ({
                    value: make._id,
                    label: make.makeName
                  }))}
                  placeholder="Select make"
                  searchable
                />
              </div>

              <div className="add-insurance-modal-field">
                <label>Model*</label>
                <CustomSelect
                  value={formData.model}
                  onChange={(value) => setFormData({ ...formData, model: value })}
                  options={models.map(model => ({
                    value: model._id,
                    label: model.modelName
                  }))}
                  placeholder={!formData.make ? "Select make first" : isLoadingModels ? "Loading models..." : "Select model"}
                  disabled={!formData.make || isLoadingModels}
                  searchable
                />
              </div>
            </div>

            {/* Year and Color Row */}
            <div className="add-insurance-modal-row">
              <div className="add-insurance-modal-field">
                <label>Year*</label>
                <input
                  type="number"
                  placeholder="Enter year"
                  value={formData.year}
                  onChange={(e) => setFormData({ ...formData, year: e.target.value })}
                  required
                  min="1900"
                  max="2100"
                />
              </div>

              <div className="add-insurance-modal-field">
                <label>Color*</label>
                <input
                  type="text"
                  placeholder="Enter color"
                  value={formData.color}
                  onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                  required
                />
              </div>
            </div>

            {/* Plate Number and VIN Number Row */}
            <div className="add-insurance-modal-row">
              <div className="add-insurance-modal-field">
                <label>Plate Number*</label>
                <input
                  type="text"
                  placeholder="Enter plate number"
                  value={formData.plateNumber}
                  onChange={(e) => setFormData({ ...formData, plateNumber: e.target.value })}
                  required
                />
              </div>

              <div className="add-insurance-modal-field">
                <label>VIN Number*</label>
                <input
                  type="text"
                  placeholder="Enter VIN number"
                  value={formData.vinNumber}
                  onChange={(e) => setFormData({ ...formData, vinNumber: e.target.value })}
                  required
                />
              </div>
            </div>

            {/* Client Name and Phone Number Row */}
            <div className="add-insurance-modal-row">
              <div className="add-insurance-modal-field">
                <label>Client Name*</label>
                <input
                  type="text"
                  placeholder="Enter name"
                  value={formData.clientName}
                  onChange={(e) => setFormData({ ...formData, clientName: e.target.value })}
                  required
                />
              </div>

              <div className="add-insurance-modal-field">
                <label>Phone Number*</label>
                <PhoneInput
                  value={formData.phoneNumber}
                  onChange={(digits) =>
                    setFormData({ ...formData, phoneNumber: digits })
                  }
                  countryCode={formData.countryCode}
                  onCountryCodeChange={(code) =>
                    setFormData({
                      ...formData,
                      countryCode: code,
                      phoneNumber: toLocalDigits(formData.phoneNumber, code),
                    })
                  }
                  required
                />
              </div>
            </div>

            {/* Subscription Type Row */}
            <div className="add-insurance-modal-row">
              <div className="add-insurance-modal-field add-insurance-modal-field-full">
                <label>Subscription Type*</label>
                <CustomSelect
                  value={formData.subscriptionType}
                  onChange={(value) => setFormData({ ...formData, subscriptionType: value })}
                  options={subscriptionTypes.map(type => ({
                    value: type,
                    label: type
                  }))}
                  placeholder="Select type"
                />
              </div>
            </div>

            {/* Start Date and End Date Row */}
            <div className="add-insurance-modal-row">
              <div className="add-insurance-modal-field">
                <label>Start Date*</label>
                <div style={{ position: "relative" }}>
                  <button
                    type="button"
                    className="date-picker-button"
                    onClick={() => setStartDatePickerOpen(!startDatePickerOpen)}
                  >
                    {formData.startDate ? new Date(formData.startDate).toLocaleDateString() : "Select start date"}
                  </button>
                  {startDatePickerOpen && (
                    <div className="date-picker-modal">
                      <DatePicker
                        value={formData.startDate}
                        onChange={(date) => {
                          const dateString = date instanceof Date ? date.toISOString().split('T')[0] : date;
                          setFormData({ ...formData, startDate: dateString });
                          setStartDatePickerOpen(false);
                        }}
                        onClose={() => setStartDatePickerOpen(false)}
                      />
                    </div>
                  )}
                </div>
              </div>

              <div className="add-insurance-modal-field">
                <label>End Date*</label>
                <div style={{ position: "relative" }}>
                  <button
                    type="button"
                    className="date-picker-button"
                    onClick={() => setEndDatePickerOpen(!endDatePickerOpen)}
                  >
                    {formData.endDate ? new Date(formData.endDate).toLocaleDateString() : "Select end date"}
                  </button>
                  {endDatePickerOpen && (
                    <div className="date-picker-modal">
                      <DatePicker
                        value={formData.endDate}
                        onChange={(date) => {
                          const dateString = date instanceof Date ? date.toISOString().split('T')[0] : date;
                          setFormData({ ...formData, endDate: dateString });
                          setEndDatePickerOpen(false);
                        }}
                        onClose={() => setEndDatePickerOpen(false)}
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Submit Button */}
            <div className="add-insurance-modal-footer">
              <button type="submit" className="add-insurance-modal-submit">
                Submit
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
