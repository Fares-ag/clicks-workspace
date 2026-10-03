import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  useGetNotificationsQuery,
  useGetUnreadNotificationCountQuery,
  useMarkNotificationsReadMutation,
} from "../store/notificationApi";
import {
  formatRelativeTime,
  notificationDeepLink,
  notificationTypeLabel,
} from "../utils/notificationUtils";
import "./AdminNotificationBell.css";

function BellIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 3a5 5 0 0 0-5 5v2.1c0 .5-.2 1-.5 1.4L5.1 13.8A1 1 0 0 0 6 15.5h12a1 1 0 0 0 .9-1.7l-1.4-2.3c-.3-.4-.5-.9-.5-1.4V8a5 5 0 0 0-5-5Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M9.5 18a2.5 2.5 0 0 0 5 0"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function AdminNotificationBell() {
  const [open, setOpen] = useState(false);
  const panelRef = useRef(null);
  const buttonRef = useRef(null);
  const navigate = useNavigate();

  const { data: unreadData } = useGetUnreadNotificationCountQuery(undefined, {
    pollingInterval: 60000,
  });
  const { data: listData, isFetching } = useGetNotificationsQuery(
    { limit: 30 },
    { skip: !open }
  );
  const [markRead] = useMarkNotificationsReadMutation();

  const unreadCount = unreadData?.count ?? 0;
  const badgeLabel = unreadCount > 99 ? "99+" : String(unreadCount);
  const notifications = listData?.notifications ?? [];

  useEffect(() => {
    if (!open) return undefined;

    const onPointerDown = (event) => {
      const target = event.target;
      if (
        panelRef.current?.contains(target) ||
        buttonRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    };

    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  const handleToggle = () => {
    setOpen((value) => !value);
  };

  const handleMarkAllRead = async () => {
    try {
      await markRead({ all: true }).unwrap();
    } catch {
      /* ignore */
    }
  };

  const handleItemClick = async (item) => {
    if (!item.read) {
      try {
        await markRead({ ids: [item.id] }).unwrap();
      } catch {
        /* ignore */
      }
    }
    const path = notificationDeepLink(item.data);
    setOpen(false);
    if (path) navigate(path);
  };

  return (
    <div className="admin-notification-bell">
      <button
        ref={buttonRef}
        type="button"
        className="admin-notification-bell-btn"
        aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ""}`}
        aria-expanded={open}
        onClick={handleToggle}
      >
        <BellIcon />
        {unreadCount > 0 && (
          <span className="admin-notification-badge" aria-hidden="true">
            {badgeLabel}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="admin-notification-overlay" onClick={() => setOpen(false)} />
          <div ref={panelRef} className="admin-notification-panel" role="menu">
            <div className="admin-notification-panel-header">
              <span className="admin-notification-panel-title">Notifications</span>
              {unreadCount > 0 && (
                <button
                  type="button"
                  className="admin-notification-mark-all"
                  onClick={handleMarkAllRead}
                >
                  Mark all read
                </button>
              )}
            </div>

            <div className="admin-notification-list">
              {isFetching && notifications.length === 0 && (
                <div className="admin-notification-empty">Loading…</div>
              )}
              {!isFetching && notifications.length === 0 && (
                <div className="admin-notification-empty">No notifications yet</div>
              )}
              {notifications.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`admin-notification-item${item.read ? "" : " unread"}`}
                  onClick={() => handleItemClick(item)}
                >
                  <div className="admin-notification-item-top">
                    <span className="admin-notification-type">
                      {notificationTypeLabel(item.type)}
                    </span>
                    <span className="admin-notification-time">
                      {formatRelativeTime(item.createdAt)}
                    </span>
                  </div>
                  <div className="admin-notification-item-title">{item.title}</div>
                  {item.body && (
                    <div className="admin-notification-item-body">{item.body}</div>
                  )}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default AdminNotificationBell;
