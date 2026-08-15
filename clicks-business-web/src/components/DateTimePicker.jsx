import React, { useState } from "react";
import "./DateTimePicker.css";

function DateTimePicker({ 
  value, 
  onChange, 
  onClose,
  minDate,
  maxDate,
  showTimePicker = false // Enable time picker for AddJobModal
}) {
  const now = new Date();
  const initialDateTime = value ? new Date(value) : now;
  
  const [currentMonth, setCurrentMonth] = useState(initialDateTime);
  const [selectedDate, setSelectedDate] = useState(initialDateTime);
  const [selectedHour, setSelectedHour] = useState(initialDateTime.getHours());
  const [selectedMinute, setSelectedMinute] = useState(initialDateTime.getMinutes());

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  const weekDays = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

  const getDaysInMonth = (date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    const days = [];

    // Previous month days
    const prevMonthLastDay = new Date(year, month, 0).getDate();
    for (let i = startingDayOfWeek - 1; i >= 0; i--) {
      days.push({
        day: prevMonthLastDay - i,
        isCurrentMonth: false,
        date: new Date(year, month - 1, prevMonthLastDay - i)
      });
    }

    // Current month days
    for (let day = 1; day <= daysInMonth; day++) {
      days.push({
        day,
        isCurrentMonth: true,
        date: new Date(year, month, day)
      });
    }

    // Next month days
    const remainingDays = 42 - days.length; // 6 rows * 7 days
    for (let day = 1; day <= remainingDays; day++) {
      days.push({
        day,
        isCurrentMonth: false,
        date: new Date(year, month + 1, day)
      });
    }

    return days;
  };

  const handlePrevMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  };

  const handleDateClick = (dateObj) => {
    if (!dateObj.isCurrentMonth) return;
    
    const date = dateObj.date;
    
    // Check if date is disabled
    if (minDate && date < new Date(minDate)) return;
    if (maxDate && date > new Date(maxDate)) return;
    
    setSelectedDate(date);
  };

  const handleReset = () => {
    const resetDateTime = new Date();
    setSelectedDate(resetDateTime);
    setCurrentMonth(resetDateTime);
    setSelectedHour(resetDateTime.getHours());
    setSelectedMinute(resetDateTime.getMinutes());
  };

  const handleApply = () => {
    if (selectedDate && onChange) {
      const finalDateTime = new Date(selectedDate);
      if (showTimePicker) {
        finalDateTime.setHours(selectedHour, selectedMinute, 0, 0);
      }
      onChange(finalDateTime);
    }
    if (onClose) {
      onClose();
    }
  };

  const handleCancel = () => {
    if (onClose) {
      onClose();
    }
  };

  const isDateSelected = (dateObj) => {
    if (!selectedDate || !dateObj.isCurrentMonth) return false;
    return (
      dateObj.date.getDate() === selectedDate.getDate() &&
      dateObj.date.getMonth() === selectedDate.getMonth() &&
      dateObj.date.getFullYear() === selectedDate.getFullYear()
    );
  };

  const isDateDisabled = (dateObj) => {
    if (!dateObj.isCurrentMonth) return true;
    const date = dateObj.date;
    if (minDate && date < new Date(minDate)) return true;
    if (maxDate && date > new Date(maxDate)) return true;
    return false;
  };

  const days = getDaysInMonth(currentMonth);

  // Generate hours (0-23)
  const hours = Array.from({ length: 24 }, (_, i) => i);
  // Generate minutes (0, 5, 10, ... 55)
  const minutes = Array.from({ length: 12 }, (_, i) => i * 5);

  return (
    <div className="datetime-picker">
      <div className="datetime-picker-content">
        <div className="datetime-picker-inline">
          <div className="datetime-picker-dates-content">
            <div className="datetime-picker-month-section">
              {/* Month Header */}
              <div className="datetime-picker-month-header">
                <button 
                  className="datetime-picker-nav-btn"
                  onClick={handlePrevMonth}
                  type="button"
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                    <path d="M15 18L9 12L15 6" stroke="#494949" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
                <p className="datetime-picker-month-title">
                  {monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}
                </p>
                <button 
                  className="datetime-picker-nav-btn"
                  onClick={handleNextMonth}
                  type="button"
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                    <path d="M9 18L15 12L9 6" stroke="#494949" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              </div>

              {/* Week Names */}
              <div className="datetime-picker-week-names">
                {weekDays.map((day) => (
                  <div key={day} className="datetime-picker-week-day">
                    <p className="datetime-picker-week-day-text">{day}</p>
                  </div>
                ))}
              </div>

              {/* Calendar Days */}
              <div className="datetime-picker-days-grid">
                {days.map((dateObj, index) => (
                  <div
                    key={index}
                    className={`datetime-picker-date ${
                      isDateSelected(dateObj) ? "datetime-picker-date-selected" : ""
                    } ${
                      isDateDisabled(dateObj) ? "datetime-picker-date-disabled" : ""
                    }`}
                    onClick={() => handleDateClick(dateObj)}
                  >
                    <div className="datetime-picker-date-icon">
                      <p className="datetime-picker-date-text">{dateObj.day}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Time Picker Section - Only shown when showTimePicker is true */}
          {showTimePicker && (
            <div className="datetime-picker-time-content">
              <div className="datetime-picker-time-section">
                <p className="datetime-picker-time-title">Select Time</p>
                
                <div className="datetime-picker-time-selectors">
                  {/* Hour Selector */}
                  <div className="datetime-picker-time-column">
                    <label className="datetime-picker-time-label">Hour</label>
                    <div className="datetime-picker-time-scroll">
                      {hours.map((hour) => (
                        <div
                          key={hour}
                          className={`datetime-picker-time-option ${
                            selectedHour === hour ? "datetime-picker-time-option-selected" : ""
                          }`}
                          onClick={() => setSelectedHour(hour)}
                        >
                          {hour.toString().padStart(2, '0')}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="datetime-picker-time-separator">:</div>

                  {/* Minute Selector */}
                  <div className="datetime-picker-time-column">
                    <label className="datetime-picker-time-label">Minute</label>
                    <div className="datetime-picker-time-scroll">
                      {minutes.map((minute) => (
                        <div
                          key={minute}
                          className={`datetime-picker-time-option ${
                            selectedMinute === minute ? "datetime-picker-time-option-selected" : ""
                          }`}
                          onClick={() => setSelectedMinute(minute)}
                        >
                          {minute.toString().padStart(2, '0')}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Selected Time Display */}
                <div className="datetime-picker-selected-time">
                  <span>Selected: </span>
                  <strong>
                    {selectedHour.toString().padStart(2, '0')}:{selectedMinute.toString().padStart(2, '0')}
                  </strong>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="datetime-picker-footer">
          <div className="datetime-picker-button-group">
            <button 
              className="datetime-picker-btn datetime-picker-btn-cancel"
              onClick={handleCancel}
              type="button"
            >
              Cancel
            </button>
            {showTimePicker && (
              <button 
                className="datetime-picker-btn datetime-picker-btn-reset"
                onClick={handleReset}
                type="button"
              >
                Reset
              </button>
            )}
            <button 
              className="datetime-picker-btn datetime-picker-btn-apply"
              onClick={handleApply}
              type="button"
            >
              Confirm
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default DateTimePicker;
