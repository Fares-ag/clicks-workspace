import React from "react";
import "./SOSNotification.css";

function NotificationQueueNote({ queueCount }) {
  if (!queueCount || queueCount <= 1) {
    return null;
  }

  const waiting = queueCount - 1;

  return (
    <div className="notification-queue-note">
      +{waiting} more notification{waiting > 1 ? "s" : ""} waiting in queue
    </div>
  );
}

export default NotificationQueueNote;
