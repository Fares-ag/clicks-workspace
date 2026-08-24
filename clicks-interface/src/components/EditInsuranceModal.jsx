import React, { useState, useEffect } from "react";
import { useGetVehicleInsuranceByIdQuery, useUpdateVehicleInsuranceMutation } from "../store/vehicleInsuranceApi";
import { useGetVehicleMakesQuery, useGetVehicleModelsByMakeQuery } from "../store/vehicleConfigApi";
import CustomSelect from "./CustomSelect";
import DatePicker from "./DatePicker";
import PhoneInput from "./PhoneInput";
import {
  DEFAULT_COUNTRY_CODE,
  isValidLocalPhone,
  toLocalDigits,
} from "../utils/phone";
import "./EditInsuranceModal.css";

function EditInsuranceModal({ open, onClose, insuranceId, onSuccess }) {
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

  const { data: insuranceData, isLoading: isLoadingInsurance } = useGetVehicleInsuranceByIdQuery(insuranceId, {
    skip: !insuranceId || !open
  });

  const { data: makesData } = useGetVehicleMakesQuery();
  const { data: modelsData, isLoading: isLoadingModels } = useGetVehicleModelsByMakeQuery(formData.make, {
    skip: !formData.make
  });

  const [updateInsurance, { isLoading: isUpdating }] = useUpdateVehicleInsuranceMutation();

  const makes = makesData?.makes || [];
  const models = modelsData?.models || [];

  // Updated subscription types
  const subscriptionTypes = ["Comprehensive", "Third-party"];

  const [startDatePickerOpen, setStartDatePickerOpen] = useState(false);
  const [endDatePickerOpen, setEndDatePickerOpen] = useState(false);

  useEffect(() => {
    if (open && insuranceData?.insurance) {
      const insurance = insuranceData.insurance;
      const cc = insurance.countryCode || DEFAULT_COUNTRY_CODE;
      setFormData({
        make: insurance.make?._id || "",
        model: insurance.model?._id || "",
        year: insurance.year || "",
        color: insurance.color || "",
        plateNumber: insurance.plateNumber || "",
        vinNumber: insurance.vinNumber || "",
        clientName: insurance.clientName || "",
        countryCode: cc,
        phoneNumber: toLocalDigits(insurance.phoneNumber || "", cc),
        subscriptionType: insurance.subscriptionType || "",
        startDate: insurance.startDate ? new Date(insurance.startDate).toISOString().split('T')[0] : "",
        endDate: insurance.endDate ? new Date(insurance.endDate).toISOString().split('T')[0] : ""
      });
    }
  }, [open, insuranceData]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isValidLocalPhone(formData.phoneNumber, formData.countryCode)) {
      alert("Enter a valid local phone number (without the country code)");
      return;
    }
    try {
      // Don't send vinNumber in update (it's locked)
      const { vinNumber, ...updateData } = formData;
      await updateInsurance({
        id: insuranceId,
        ...updateData,
        phoneNumber: toLocalDigits(formData.phoneNumber, formData.countryCode),
      }).unwrap();
      onSuccess?.();
      onClose();
    } catch (error) {
      console.error("Error updating insurance subscription:", error);
      alert(error?.data?.message || "Failed to update insurance. Please try again.");
    }
  };

  const handleCancel = () => {
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

  if (!open) return null;

  return (
    <div className="edit-insurance-modal-backdrop" onClick={handleCancel}>
      <div className="edit-insurance-modal" onClick={(e) => e.stopPropagation()}>
        <button className="edit-insurance-modal-close" onClick={handleCancel} aria-label="Close">
          <span className="edit-insurance-modal-close-x">&#10005;</span>
        </button>
        <form onSubmit={handleSubmit} autoComplete="off">
          <div className="edit-insurance-modal-header">
            <div className="edit-insurance-modal-title">Edit Subscription</div>
            <div className="edit-insurance-modal-subtitle">Update vehicle insurance subscription details</div>
          </div>
          
          {isLoadingInsurance ? (
            <div className="edit-insurance-modal-loading">Loading...</div>
          ) : (
            <>
              <div className="edit-insurance-modal-section">
                <div className="edit-insurance-modal-section-title">Vehicle Details</div>
                <div className="edit-insurance-modal-fields">
                  {/* Make and Model Row */}
                  <div className="edit-insurance-modal-row">
                    <div className="edit-insurance-modal-field">
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
                    <div className="edit-insurance-modal-field">
                      <label>Model*</label>
                      <CustomSelect
                        value={formData.model}
                        onChange={(value) => setFormData({ ...formData, model: value })}
                        options={models.map(model => ({
                          value: model._id,
                          label: model.modelName
                        }))}
                        placeholder={!formData.make ? "Select make first" : isLoadingModels ? "Loading..." : "Select model"}
                        disabled={!formData.make || isLoadingModels}
                        searchable
                      />
                    </div>
                  </div>

                  {/* Year and Color Row */}
                  <div className="edit-insurance-modal-row">
                    <div className="edit-insurance-modal-field">
                      <label>Year*</label>
                      <input
                        type="number"
                        value={formData.year}
                        onChange={(e) => setFormData({ ...formData, year: e.target.value })}
                        required
                        min="1900"
                        max="2100"
                      />
                    </div>
                    <div className="edit-insurance-modal-field">
                      <label>Color*</label>
                      <input
                        type="text"
                        value={formData.color}
                        onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                        required
                      />
                    </div>
                  </div>

                  {/* Plate Number and VIN Number Row */}
                  <div className="edit-insurance-modal-row">
                    <div className="edit-insurance-modal-field">
                      <label>Plate Number*</label>
                      <input
                        type="text"
                        value={formData.plateNumber}
                        onChange={(e) => setFormData({ ...formData, plateNumber: e.target.value })}
                        required
                      />
                    </div>
                    <div className="edit-insurance-modal-field">
                      <label>VIN Number*</label>
                      <input
                        type="text"
                        value={formData.vinNumber}
                        disabled
                        className="edit-insurance-modal-field-locked"
                        title="VIN number cannot be edited"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="edit-insurance-modal-section">
                <div className="edit-insurance-modal-section-title">Client Information</div>
                <div className="edit-insurance-modal-fields">
                  {/* Client Name and Phone Number Row */}
                  <div className="edit-insurance-modal-row">
                    <div className="edit-insurance-modal-field">
                      <label>Client Name*</label>
                      <input
                        type="text"
                        value={formData.clientName}
                        onChange={(e) => setFormData({ ...formData, clientName: e.target.value })}
                        required
                      />
                    </div>
                    <div className="edit-insurance-modal-field">
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

                  {/* Subscription Type */}
                  <div className="edit-insurance-modal-row">
                    <div className="edit-insurance-modal-field edit-insurance-modal-field-full">
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
                  <div className="edit-insurance-modal-row">
                    <div className="edit-insurance-modal-field">
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
                    <div className="edit-insurance-modal-field">
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
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 24 }}>
                <button 
                  className="edit-insurance-modal-submit" 
                  type="submit"
                  disabled={isUpdating}
                >
                  {isUpdating ? "Updating..." : "Update Subscription"}
                </button>
              </div>
            </>
          )}
        </form>
      </div>
    </div>
  );
}

export default EditInsuranceModal;
