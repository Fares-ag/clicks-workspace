import React, { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Outlet, useNavigate } from "react-router-dom";
import { logout, setCredentials } from "../store/authSlice";
import { useMeQuery } from "../store/portalApi";
import BusinessSidebar from "./BusinessSidebar";
import BusinessTopBar from "./BusinessTopBar";
import "./BusinessLayout.css";

function BusinessLayout() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const token = useSelector((state) => state.auth.token);

  const [sidebarOpen, setSidebarOpen] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth > 900 : true
  );
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth <= 900 : false
  );

  const { data, error, isError } = useMeQuery(undefined, {
    skip: !token,
    refetchOnMountOrArgChange: true,
  });

  useEffect(() => {
    if (data?.user && data?.business) {
      dispatch(
        setCredentials({
          accessToken: token,
          user: data.user,
          business: data.business,
        })
      );
    }
  }, [data, dispatch, token]);

  useEffect(() => {
    if (isError && (error?.status === 401 || error?.status === 403)) {
      dispatch(logout({ sessionExpired: true }));
      navigate("/login", { replace: true });
    }
  }, [isError, error, dispatch, navigate]);

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

  const handleToggleSidebar = () => {
    setSidebarOpen((open) => !open);
  };

  const handleCloseSidebar = () => {
    if (isMobile) setSidebarOpen(false);
  };

  return (
    <div className="business-layout">
      <BusinessSidebar isOpen={sidebarOpen} onNavigate={handleCloseSidebar} />
      {isMobile && sidebarOpen && (
        <button
          type="button"
          className="business-sidebar-backdrop"
          aria-label="Close sidebar"
          onClick={handleCloseSidebar}
        />
      )}
      <div
        className={`business-layout-content${sidebarOpen ? "" : " content-sidebar-collapsed"}`}
      >
        <BusinessTopBar onToggleSidebar={handleToggleSidebar} />
        <main className="business-layout-main admin-page">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default BusinessLayout;
