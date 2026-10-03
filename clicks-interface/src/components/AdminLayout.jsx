import React, { useState, useEffect, useMemo } from "react";
import { message } from "antd";
import { useSelector } from "react-redux";
import { Outlet, useNavigate } from "react-router-dom";
import io from "socket.io-client";
import AdminSidebar from "./AdminSidebar.jsx";
import AdminTopBar from "./AdminTopBar.jsx";
import SOSNotification from "./SOSNotification.jsx";
import ServiceRequestNotification from "./ServiceRequestNotification.jsx";
import BusinessJobNotification from "./BusinessJobNotification.jsx";
import TechnicianJobNotification from "./TechnicianJobNotification.jsx";
import HoldRequestNotification from "./HoldRequestNotification.jsx";
import { apiSlice } from "../store/apiSlice";
import { useDispatch } from "react-redux";
import { AdminSocketContext } from "../context/AdminSocketContext.jsx";
import { prefetchCriticalAdminData } from "../utils/prefetchAdmin";
import { prefetchAdminRouteChunksWhenIdle } from "../utils/prefetchAdminRoutes";
import {
  playNotificationSound,
  unlockNotificationSound,
} from "../utils/notificationSound";
import "antd/dist/reset.css";
import "./AdminLayout.css";

const NOTIFICATION_TYPES = {
  SOS: "sos",
  SERVICE_REQUEST: "serviceRequest",
  BUSINESS_LEAD: "businessLead",
  BUSINESS_JOB: "businessJob",
  TECHNICIAN_JOB: "technicianJob",
  HOLD_REQUEST: "holdRequest",
};

function notificationId(type, data) {
  switch (type) {
    case NOTIFICATION_TYPES.SOS:
      return String(data.sos_id || data.id || data._id || "");
    case NOTIFICATION_TYPES.BUSINESS_LEAD:
      return String(data.lead_id || data.id || data._id || "");
    case NOTIFICATION_TYPES.BUSINESS_JOB:
    case NOTIFICATION_TYPES.TECHNICIAN_JOB:
      return String(data.job_id || data.id || data._id || "");
    case NOTIFICATION_TYPES.HOLD_REQUEST:
      return String(data.job_id || data.id || data._id || "");
    case NOTIFICATION_TYPES.SERVICE_REQUEST:
      return String(
        data.service_request_id || data.id || data._id || ""
      );
    default:
      return String(Date.now());
  }
}

function AdminLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth > 900 : true
  );
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth <= 900 : false
  );
  const [notificationQueue, setNotificationQueue] = useState([]);
  const [socket, setSocket] = useState(null);
  const [socketConnected, setSocketConnected] = useState(false);
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { user, token } = useSelector((state) => state.auth);
  const userId = user?._id || user?.id;

  const activeNotification = notificationQueue[0] ?? null;
  const queueCount = notificationQueue.length;

  const dequeueNotification = () => {
    setNotificationQueue((queue) => queue.slice(1));
  };

  const invalidateNotifications = () => {
    dispatch(apiSlice.util.invalidateTags(["Notifications"]));
  };

  useEffect(() => {
    prefetchCriticalAdminData(dispatch);
    prefetchAdminRouteChunksWhenIdle();
    unlockNotificationSound();
  }, [dispatch]);

  useEffect(() => {
    let wasMobile = window.innerWidth <= 900;
    const onResize = () => {
      const mobile = window.innerWidth <= 900;
      setIsMobile(mobile);
      if (mobile !== wasMobile) {
        setSidebarOpen(!mobile);
        wasMobile = mobile;
      }
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (!isMobile || !sidebarOpen) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isMobile, sidebarOpen]);

  useEffect(() => {
    if (!userId || !token) {
      return;
    }

    const socketUrl = import.meta.env.VITE_SOCKET_URL || "http://localhost:5001";
    const adminSocket = io(`${socketUrl}/admin`, {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      auth: { token },
    });

    adminSocket.on("connect", () => {
      setSocketConnected(true);
      adminSocket.emit("register", userId);
    });

    adminSocket.on("disconnect", () => {
      setSocketConnected(false);
    });

    adminSocket.on("connect_error", (error) => {
      setSocketConnected(false);
      console.error("Socket connection error:", error.message);
    });

    adminSocket.on("newSOSRequest", (data) => {
      setNotificationQueue((queue) => [
        ...queue,
        {
          type: NOTIFICATION_TYPES.SOS,
          data,
          id: notificationId(NOTIFICATION_TYPES.SOS, data),
        },
      ]);
      dispatch(apiSlice.util.invalidateTags(["SOS", "NavBadges"]));
      invalidateNotifications();
      playNotificationSound();
    });

    adminSocket.on("newServiceRequest", (data) => {
      setNotificationQueue((queue) => [
        ...queue,
        {
          type: NOTIFICATION_TYPES.SERVICE_REQUEST,
          data,
          id: notificationId(NOTIFICATION_TYPES.SERVICE_REQUEST, data),
        },
      ]);
      dispatch(apiSlice.util.invalidateTags(["ServiceRequest", "NavBadges"]));
      invalidateNotifications();
      playNotificationSound();
    });

    adminSocket.on("serviceRequestCancelled", (data) => {
      const cancelledId = data?.service_request_id || data?.id || data?._id;
      setNotificationQueue((queue) => {
        if (cancelledId) {
          return queue.filter(
            (item) =>
              !(
                item.type === NOTIFICATION_TYPES.SERVICE_REQUEST &&
                item.id === String(cancelledId)
              )
          );
        }
        return queue.filter(
          (item) => item.type !== NOTIFICATION_TYPES.SERVICE_REQUEST
        );
      });
      dispatch(apiSlice.util.invalidateTags(["ServiceRequest", "NavBadges"]));
      invalidateNotifications();
    });

    adminSocket.on("newBusinessLead", (data) => {
      setNotificationQueue((queue) => [
        ...queue,
        {
          type: NOTIFICATION_TYPES.BUSINESS_LEAD,
          data,
          id: notificationId(NOTIFICATION_TYPES.BUSINESS_LEAD, data),
        },
      ]);
      dispatch(apiSlice.util.invalidateTags(["Lead", "NavBadges"]));
      invalidateNotifications();
      playNotificationSound();
    });

    adminSocket.on("newBusinessJob", (data) => {
      // Legacy job event — treat as lead if lead_id present
      const type = data?.lead_id
        ? NOTIFICATION_TYPES.BUSINESS_LEAD
        : NOTIFICATION_TYPES.BUSINESS_JOB;
      setNotificationQueue((queue) => [
        ...queue,
        {
          type,
          data,
          id: notificationId(type, data),
        },
      ]);
      dispatch(apiSlice.util.invalidateTags(["Lead", "Job", "NavBadges"]));
      invalidateNotifications();
      playNotificationSound();
    });

    adminSocket.on("newTechnicianJob", (data) => {
      setNotificationQueue((queue) => [
        ...queue,
        {
          type: NOTIFICATION_TYPES.TECHNICIAN_JOB,
          data,
          id: notificationId(NOTIFICATION_TYPES.TECHNICIAN_JOB, data),
        },
      ]);
      dispatch(apiSlice.util.invalidateTags(["Job", "NavBadges"]));
      invalidateNotifications();
      playNotificationSound();
    });

    adminSocket.on("holdRequestPending", (data) => {
      setNotificationQueue((queue) => [
        ...queue,
        {
          type: NOTIFICATION_TYPES.HOLD_REQUEST,
          data,
          id: notificationId(NOTIFICATION_TYPES.HOLD_REQUEST, data),
        },
      ]);
      dispatch(apiSlice.util.invalidateTags(["Job", "NavBadges"]));
      invalidateNotifications();
      playNotificationSound();
    });

    adminSocket.on("sosExpired", () => {
      dispatch(apiSlice.util.invalidateTags(["SOS", "NavBadges"]));
      invalidateNotifications();
    });

    adminSocket.on("sosClaimed", (data) => {
      const myId = String(userId);
      if (String(data.admin_id) !== myId) {
        setNotificationQueue((queue) =>
          queue.filter(
            (item) =>
              !(
                item.type === NOTIFICATION_TYPES.SOS &&
                item.id === String(data.sos_id)
              )
          )
        );
        message.info("SOS claimed by another dispatcher");
        playNotificationSound();
      }
      dispatch(apiSlice.util.invalidateTags(["SOS", "NavBadges"]));
      invalidateNotifications();
    });

    adminSocket.on("sosCancelled", (data) => {
      setNotificationQueue((queue) =>
        queue.filter(
          (item) =>
            !(
              item.type === NOTIFICATION_TYPES.SOS &&
              item.id === String(data.sos_id)
            )
        )
      );
      dispatch(apiSlice.util.invalidateTags(["SOS", "NavBadges"]));
      invalidateNotifications();
    });

    adminSocket.on("error", (err) => {
      if (err?.code === "SOS_ALREADY_CLAIMED") {
        message.error("SOS already claimed by another dispatcher");
        setNotificationQueue((queue) =>
          queue[0]?.type === NOTIFICATION_TYPES.SOS ? queue.slice(1) : queue
        );
        dispatch(apiSlice.util.invalidateTags(["SOS", "NavBadges"]));
        invalidateNotifications();
      } else if (err?.code === "SOS_UNAVAILABLE") {
        message.error("SOS is no longer available");
        setNotificationQueue((queue) =>
          queue[0]?.type === NOTIFICATION_TYPES.SOS ? queue.slice(1) : queue
        );
        dispatch(apiSlice.util.invalidateTags(["SOS", "NavBadges"]));
        invalidateNotifications();
      }
    });

    setSocket(adminSocket);

    return () => {
      adminSocket.disconnect();
    };
    // `navigate` is deliberately not a dependency: react-router re-creates it on
    // every navigation, which would tear down and re-dial this socket on each
    // route change and drop any SOS / service-request event in that window.
    // It is not used inside this effect.
  }, [userId, token, dispatch]);

  const handleToggleSidebar = () => {
    setSidebarOpen((open) => !open);
  };

  const handleCloseSidebar = () => {
    if (isMobile) setSidebarOpen(false);
  };

  const handleCreateJob = (sosData) => {
    if (socket) {
      socket.emit("sosAccepted", {
        sos_id: sosData.sos_id,
        customer_id: sosData.customer_id,
      });
    }

    navigate("/jobs/new", { state: { sosData } });
    dequeueNotification();
    dispatch(apiSlice.util.invalidateTags(["SOS", "NavBadges"]));
  };

  const handleDismissNotification = () => {
    dequeueNotification();
  };

  const handleOpenServiceLead = (requestData) => {
    const leadId = requestData.lead_id;
    if (leadId) {
      navigate(`/leads/${leadId}`);
    } else {
      navigate("/leads/new", {
        state: {
          serviceRequestData: {
            service_request_id:
              requestData.service_request_id ||
              requestData.id ||
              requestData._id,
            customer_id: requestData.customer_id,
            customer_vehicle_id: requestData.customer_vehicle_id,
            customer: requestData.customer,
            vehicle: requestData.vehicle,
            location: requestData.location,
            service_type: requestData.service_type,
            timing: requestData.timing,
            scheduled_for: requestData.scheduled_for,
            status: requestData.status,
          },
        },
      });
    }
    dequeueNotification();
    dispatch(apiSlice.util.invalidateTags(["ServiceRequest", "Lead", "NavBadges"]));
  };

  const handleDismissServiceRequest = () => {
    dequeueNotification();
  };

  const handleOpenBusinessLead = (leadData) => {
    const leadId = leadData?.lead_id;
    if (leadId) {
      navigate(`/leads/${leadId}/convert`);
    } else if (leadData?.job_id) {
      navigate(`/jobs/${leadData.job_id}`);
    } else {
      navigate("/leads");
    }
    dequeueNotification();
    dispatch(apiSlice.util.invalidateTags(["Lead", "Job", "NavBadges"]));
  };

  const handleDismissBusinessLead = () => {
    dequeueNotification();
    dispatch(apiSlice.util.invalidateTags(["Lead", "NavBadges"]));
  };

  const handleOpenBusinessJob = (jobData) => {
    if (jobData?.lead_id) {
      handleOpenBusinessLead(jobData);
      return;
    }
    if (jobData?.job_id) {
      navigate(`/jobs/${jobData.job_id}`);
    } else {
      navigate("/jobs");
    }
    dequeueNotification();
    dispatch(apiSlice.util.invalidateTags(["Job", "NavBadges"]));
  };

  const handleDismissBusinessJob = () => {
    dequeueNotification();
    dispatch(apiSlice.util.invalidateTags(["Job", "NavBadges"]));
  };

  const handleOpenTechnicianJob = (jobData) => {
    if (jobData?.job_id) {
      navigate(`/jobs/${jobData.job_id}`);
    } else {
      navigate("/jobs");
    }
    dequeueNotification();
    dispatch(apiSlice.util.invalidateTags(["Job", "NavBadges"]));
  };

  const handleDismissTechnicianJob = () => {
    dequeueNotification();
  };

  const handleOpenHoldRequest = (holdData) => {
    if (holdData?.job_id) {
      navigate(`/jobs/${holdData.job_id}`);
    } else {
      navigate("/jobs");
    }
    dequeueNotification();
    dispatch(apiSlice.util.invalidateTags(["Job", "NavBadges"]));
  };

  const handleDismissHoldRequest = () => {
    dequeueNotification();
  };

  const socketContextValue = useMemo(
    () => ({ socket, connected: socketConnected }),
    [socket, socketConnected]
  );

  return (
    <AdminSocketContext.Provider value={socketContextValue}>
    <div className="admin-layout">
      <AdminSidebar isOpen={sidebarOpen} onNavigate={handleCloseSidebar} />
      {isMobile && sidebarOpen && (
        <button
          type="button"
          className="admin-sidebar-backdrop"
          aria-label="Close sidebar"
          onClick={handleCloseSidebar}
        />
      )}
      <div
        className={`admin-layout-content${sidebarOpen ? "" : " content-sidebar-collapsed"}`}
      >
        <AdminTopBar
          onToggleSidebar={handleToggleSidebar}
          isSidebarOpen={sidebarOpen}
        />
        <div className="admin-layout-main">
          <Outlet />
        </div>
      </div>

      {activeNotification?.type === NOTIFICATION_TYPES.SOS && (
        <SOSNotification
          sosData={activeNotification.data}
          queueCount={queueCount}
          onCreateJob={handleCreateJob}
          onDismiss={handleDismissNotification}
        />
      )}

      {activeNotification?.type === NOTIFICATION_TYPES.SERVICE_REQUEST && (
        <ServiceRequestNotification
          requestData={activeNotification.data}
          queueCount={queueCount}
          onCreateJob={handleOpenServiceLead}
          onDismiss={handleDismissServiceRequest}
        />
      )}

      {activeNotification?.type === NOTIFICATION_TYPES.BUSINESS_LEAD && (
        <BusinessJobNotification
          jobData={activeNotification.data}
          queueCount={queueCount}
          onOpenJob={handleOpenBusinessLead}
          onDismiss={handleDismissBusinessLead}
        />
      )}

      {activeNotification?.type === NOTIFICATION_TYPES.BUSINESS_JOB && (
        <BusinessJobNotification
          jobData={activeNotification.data}
          queueCount={queueCount}
          onOpenJob={handleOpenBusinessJob}
          onDismiss={handleDismissBusinessJob}
        />
      )}

      {activeNotification?.type === NOTIFICATION_TYPES.TECHNICIAN_JOB && (
        <TechnicianJobNotification
          jobData={activeNotification.data}
          queueCount={queueCount}
          onOpenJob={handleOpenTechnicianJob}
          onDismiss={handleDismissTechnicianJob}
        />
      )}

      {activeNotification?.type === NOTIFICATION_TYPES.HOLD_REQUEST && (
        <HoldRequestNotification
          holdData={activeNotification.data}
          queueCount={queueCount}
          onOpenJob={() => handleOpenHoldRequest(activeNotification.data)}
          onDismiss={handleDismissHoldRequest}
        />
      )}
    </div>
    </AdminSocketContext.Provider>
  );
}

export default AdminLayout;
