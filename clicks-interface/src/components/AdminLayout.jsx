import React, { useState, useEffect } from "react";
import { Layout, message } from "antd";
import { useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import io from "socket.io-client";
import AdminSidebar from "./AdminSidebar.jsx";
import AdminTopBar from "./AdminTopBar.jsx";
import SOSNotification from "./SOSNotification.jsx";
import ServiceRequestNotification from "./ServiceRequestNotification.jsx";
import BusinessJobNotification from "./BusinessJobNotification.jsx";
import TechnicianJobNotification from "./TechnicianJobNotification.jsx";
import { apiSlice } from "../store/apiSlice";
import { useDispatch } from "react-redux";
import "./AdminLayout.css";

const { Content } = Layout;

const NOTIFICATION_TYPES = {
  SOS: "sos",
  SERVICE_REQUEST: "serviceRequest",
  BUSINESS_LEAD: "businessLead",
  BUSINESS_JOB: "businessJob",
  TECHNICIAN_JOB: "technicianJob",
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
    case NOTIFICATION_TYPES.SERVICE_REQUEST:
      return String(
        data.service_request_id || data.id || data._id || ""
      );
    default:
      return String(Date.now());
  }
}

function playNotificationSound() {
  const audio = new Audio("/notification.mp3");
  audio.play().catch(() => {});
}

function AdminLayout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth > 900 : true
  );
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth <= 900 : false
  );
  const [notificationQueue, setNotificationQueue] = useState([]);
  const [socket, setSocket] = useState(null);
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { user, token } = useSelector((state) => state.auth);

  const activeNotification = notificationQueue[0] ?? null;
  const queueCount = notificationQueue.length;

  const dequeueNotification = () => {
    setNotificationQueue((queue) => queue.slice(1));
  };

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
    const userId = user?._id || user?.id;
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
      adminSocket.emit("register", userId);
    });

    adminSocket.on("connect_error", (error) => {
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
      dispatch(apiSlice.util.invalidateTags(["SOS"]));
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
      dispatch(apiSlice.util.invalidateTags(["ServiceRequest"]));
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
      dispatch(apiSlice.util.invalidateTags(["ServiceRequest"]));
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
      dispatch(apiSlice.util.invalidateTags(["Lead", "Dashboard"]));
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
      dispatch(apiSlice.util.invalidateTags(["Lead", "Job", "Dashboard"]));
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
      dispatch(apiSlice.util.invalidateTags(["Job", "Dashboard"]));
      playNotificationSound();
    });

    adminSocket.on("sosExpired", () => {
      dispatch(apiSlice.util.invalidateTags(["SOS"]));
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
      }
      dispatch(apiSlice.util.invalidateTags(["SOS"]));
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
      dispatch(apiSlice.util.invalidateTags(["SOS"]));
    });

    adminSocket.on("error", (err) => {
      if (err?.code === "SOS_ALREADY_CLAIMED") {
        message.error("SOS already claimed by another dispatcher");
        setNotificationQueue((queue) =>
          queue[0]?.type === NOTIFICATION_TYPES.SOS ? queue.slice(1) : queue
        );
        dispatch(apiSlice.util.invalidateTags(["SOS"]));
      } else if (err?.code === "SOS_UNAVAILABLE") {
        message.error("SOS is no longer available");
        setNotificationQueue((queue) =>
          queue[0]?.type === NOTIFICATION_TYPES.SOS ? queue.slice(1) : queue
        );
        dispatch(apiSlice.util.invalidateTags(["SOS"]));
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
  }, [user, token, dispatch]);

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
    dispatch(apiSlice.util.invalidateTags(["SOS"]));
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
    dispatch(apiSlice.util.invalidateTags(["ServiceRequest", "Lead"]));
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
    dispatch(apiSlice.util.invalidateTags(["Lead", "Job", "Dashboard"]));
  };

  const handleDismissBusinessLead = () => {
    dequeueNotification();
    dispatch(apiSlice.util.invalidateTags(["Lead", "Dashboard"]));
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
    dispatch(apiSlice.util.invalidateTags(["Job", "Dashboard"]));
  };

  const handleDismissBusinessJob = () => {
    dequeueNotification();
    dispatch(apiSlice.util.invalidateTags(["Job", "Dashboard"]));
  };

  const handleOpenTechnicianJob = (jobData) => {
    if (jobData?.job_id) {
      navigate(`/jobs/${jobData.job_id}`);
    } else {
      navigate("/jobs");
    }
    dequeueNotification();
    dispatch(apiSlice.util.invalidateTags(["Job", "Dashboard"]));
  };

  const handleDismissTechnicianJob = () => {
    dequeueNotification();
  };

  return (
    <Layout className="admin-layout">
      <AdminSidebar isOpen={sidebarOpen} onNavigate={handleCloseSidebar} />
      {isMobile && sidebarOpen && (
        <button
          type="button"
          className="admin-sidebar-backdrop"
          aria-label="Close sidebar"
          onClick={handleCloseSidebar}
        />
      )}
      <Layout
        className={`admin-layout-content${sidebarOpen ? "" : " content-sidebar-collapsed"}`}
      >
        <AdminTopBar
          onToggleSidebar={handleToggleSidebar}
          isSidebarOpen={sidebarOpen}
        />
        <Content className="admin-layout-main">
          {children}
        </Content>
      </Layout>

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
    </Layout>
  );
}

export default AdminLayout;
