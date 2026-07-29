import React, { useState } from "react";
import "./DatePicker.css";

function DatePicker({ 
  value, 
  onChange, 
  onClose,
  minDate,
  maxDate 
}) {
  const today = new Date();
  today.setHours(0, 0, 0, 0); // Reset time to midnight for consistent date comparison
  
  const [currentMonth, setCurrentMonth] = useState(value ? new Date(value) : today);
  const [selectedDate, setSelectedDate] = useState(value ? new Date(value) : today);

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

  const handleApply = () => {
    if (selectedDate && onChange) {
      onChange(selectedDate);
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

  return (
    <div className="datepicker">
      <div className="datepicker-content">
        <div className="datepicker-inline">
          <div className="datepicker-dates-content">
            <div className="datepicker-month-section">
              {/* Month Header */}
              <div className="datepicker-month-header">
                <button 
                  className="datepicker-nav-btn"
                  onClick={handlePrevMonth}
                  type="button"
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                    <path d="M15 18L9 12L15 6" stroke="#494949" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
                <p className="datepicker-month-title">
                  {monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}
                </p>
                <button 
                  className="datepicker-nav-btn"
                  onClick={handleNextMonth}
                  type="button"
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                    <path d="M9 18L15 12L9 6" stroke="#494949" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              </div>

              {/* Week Names */}
              <div className="datepicker-week-names">
                {weekDays.map((day) => (
                  <div key={day} className="datepicker-week-day">
                    <p className="datepicker-week-day-text">{day}</p>
                  </div>
                ))}
              </div>

              {/* Calendar Days */}
              <div className="datepicker-days-grid">
                {days.map((dateObj, index) => (
                  <div
                    key={index}
                    className={`datepicker-date ${
                      isDateSelected(dateObj) ? "datepicker-date-selected" : ""
                    } ${
                      isDateDisabled(dateObj) ? "datepicker-date-disabled" : ""
                    }`}
                    onClick={() => handleDateClick(dateObj)}
                  >
                    <div className="datepicker-date-icon">
                      <p className="datepicker-date-text">{dateObj.day}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="datepicker-footer">
          <div className="datepicker-button-group">
            <button 
              className="datepicker-btn datepicker-btn-cancel"
              onClick={handleCancel}
              type="button"
            >
              Cancel
            </button>
            <button 
              className="datepicker-btn datepicker-btn-apply"
              onClick={handleApply}
              type="button"
            >
              Apply
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default DatePicker;
