import React from "react";
import "./PrimaryButton.css";


function PrimaryButton({ children, width = "220px", height = "44px", onClick, style = {}, ...props }) {
  return (
    <button
      className="primary-btn"
      style={{
        width,
        height,
        ...style
      }}
      onClick={onClick}
      {...props}
    >
      {children}
    </button>
  );
}

export default PrimaryButton;
