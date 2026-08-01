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

function AdminLayout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth > 900 : true
  );
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth <= 900 : false
  );
  const [sosNotification, setSOSNotification] = useState(null);
  const [serviceRequestNotification, setServiceRequestNotification] =
    useState(null);
  const [businessJobNotification, setBusinessJobNotification] = useState(null);
  const [technicianJobNotification, setTechnicianJobNotification] = useState(null);
  const [socket, setSocket] = useState(null);
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { user, token } = useSelector((state) => state.auth);

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
      setSOSNotification(data);
      dispatch(apiSlice.util.invalidateTags(["SOS"]));
      const audio = new Audio("/notification.mp3");
      audio.play().catch(() => {});
    });

    adminSocket.on("newServiceRequest", (data) => {
      setServiceRequestNotification(data);
      dispatch(apiSlice.util.invalidateTags(["ServiceRequest"]));
      const audio = new Audio("/notification.mp3");
      audio.play().catch(() => {});
    });

    adminSocket.on("serviceRequestCancelled", () => {
      setServiceRequestNotification(null);
      dispatch(apiSlice.util.invalidateTags(["ServiceRequest"]));
    });

    adminSocket.on("newBusinessJob", (data) => {
      setBusinessJobNotification(data);
      dispatch(apiSlice.util.invalidateTags(["Job", "Dashboard"]));
      const audio = new Audio("/notification.mp3");
      audio.play().catch(() => {});
    });

    adminSocket.on("newTechnicianJob", (data) => {
      setTechnicianJobNotification(data);
      dispatch(apiSlice.util.invalidateTags(["Job", "Dashboard"]));
      const audio = new Audio("/notification.mp3");
      audio.play().catch(() => {});
    });

    adminSocket.on("sosExpired", () => {
      // Auto-expiry disabled — refresh badge only.
      dispatch(apiSlice.util.invalidateTags(["SOS"]));
    });

    adminSocket.on("sosClaimed", (data) => {
      const myId = String(userId);
      if (String(data.admin_id) !== myId) {
        setSOSNotification((current) => {
          if (current && String(current.sos_id) === String(data.sos_id)) {
            return null;
          }
          return current;
        });
        message.info("SOS claimed by another dispatcher");
      }
      dispatch(apiSlice.util.invalidateTags(["SOS"]));
    });

    adminSocket.on("sosCancelled", (data) => {
      setSOSNotification((current) => {
        if (current && String(current.sos_id) === String(data.sos_id)) {
          return null;
        }
        return current;
      });
      dispatch(apiSlice.util.invalidateTags(["SOS"]));
    });

    adminSocket.on("error", (err) => {
      if (err?.code === "SOS_ALREADY_CLAIMED") {
        message.error("SOS already claimed by another dispatcher");
        setSOSNotification(null);
        dispatch(apiSlice.util.invalidateTags(["SOS"]));
      } else if (err?.code === "SOS_UNAVAILABLE") {
        message.error("SOS is no longer available");
        setSOSNotification(null);
        dispatch(apiSlice.util.invalidateTags(["SOS"]));
      }
    });

    setSocket(adminSocket);

    return () => {
      adminSocket.disconnect();
    };
  }, [user, token, dispatch, navigate]);

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
    setSOSNotification(null);
    dispatch(apiSlice.util.invalidateTags(["SOS"]));
  };

  const handleDismissNotification = () => {
    setSOSNotification(null);
  };

  const handleCreateServiceJob = (requestData) => {
    navigate("/jobs/new", {
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
    setServiceRequestNotification(null);
    dispatch(apiSlice.util.invalidateTags(["ServiceRequest"]));
  };

  const handleDismissServiceRequest = () => {
    setServiceRequestNotification(null);
  };

  const handleOpenBusinessJob = (jobData) => {
    if (jobData?.job_id) {
      navigate(`/jobs/${jobData.job_id}`);
    } else {
      navigate("/jobs");
    }
    setBusinessJobNotification(null);
    dispatch(apiSlice.util.invalidateTags(["Job", "Dashboard"]));
  };

  const handleDismissBusinessJob = () => {
    setBusinessJobNotification(null);
  };

  const handleOpenTechnicianJob = (jobData) => {
    if (jobData?.job_id) {
      navigate(`/jobs/${jobData.job_id}`);
    } else {
      navigate("/jobs");
    }
    setTechnicianJobNotification(null);
    dispatch(apiSlice.util.invalidateTags(["Job", "Dashboard"]));
  };

  const handleDismissTechnicianJob = () => {
    setTechnicianJobNotification(null);
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

      {sosNotification && (
        <SOSNotification
          sosData={sosNotification}
          onCreateJob={handleCreateJob}
          onDismiss={handleDismissNotification}
        />
      )}

      {!sosNotification && serviceRequestNotification && (
        <ServiceRequestNotification
          requestData={serviceRequestNotification}
          onCreateJob={handleCreateServiceJob}
          onDismiss={handleDismissServiceRequest}
        />
      )}

      {!sosNotification &&
        !serviceRequestNotification &&
        businessJobNotification && (
        <BusinessJobNotification
          jobData={businessJobNotification}
          onOpenJob={handleOpenBusinessJob}
          onDismiss={handleDismissBusinessJob}
        />
      )}

      {!sosNotification &&
        !serviceRequestNotification &&
        !businessJobNotification &&
        technicianJobNotification && (
        <TechnicianJobNotification
          jobData={technicianJobNotification}
          onOpenJob={handleOpenTechnicianJob}
          onDismiss={handleDismissTechnicianJob}
        />
      )}
    </Layout>
  );
}

export default AdminLayout;
