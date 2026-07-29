import React, { useState, useRef, useEffect } from "react";
import "./MultiSelectDropdown.css";

function MultiSelectDropdown({ value = [], onChange, options, placeholder, error = false }) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Handle click outside to close dropdown
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleToggle = (optionValue) => {
    if (value.includes(optionValue)) {
      onChange(value.filter(v => v !== optionValue));
    } else {
      onChange([...value, optionValue]);
    }
  };

  const handleRemove = (optionValue) => {
    onChange(value.filter(v => v !== optionValue));
  };

  const displayText = value.length > 0 
    ? `${value.length} selected` 
    : placeholder;

  return (
    <div className="multi-select-dropdown" ref={dropdownRef}>
      <div 
        className={`multi-select-trigger ${value.length === 0 ? 'placeholder' : ''} ${error ? 'error' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
      >
        {displayText}
        <svg width="12" height="8" viewBox="0 0 12 8" fill="none">
          <path d="M1 1.5L6 6.5L11 1.5" stroke="#667085" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>
      
      {isOpen && (
        <div className="multi-select-options">
          {options.map((option) => (
            <label
              key={option.value}
              className="multi-select-option"
              onClick={(e) => e.stopPropagation()}
            >
              <input
                type="checkbox"
                checked={value.includes(option.value)}
                onChange={() => handleToggle(option.value)}
              />
              <span className="multi-select-checkbox"></span>
              <span className="multi-select-label">{option.label}</span>
            </label>
          ))}
        </div>
      )}

      {value.length > 0 && (
        <div className="multi-select-tags">
          {value.map((val) => {
            const option = options.find(opt => opt.value === val);
            return (
              <div key={val} className="multi-select-tag">
                <span>{option?.label || val}</span>
                <button
                  type="button"
                  className="multi-select-tag-remove"
                  onClick={() => handleRemove(val)}
                  aria-label={`Remove ${option?.label || val}`}
                >
                  &#10005;
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default MultiSelectDropdown;
