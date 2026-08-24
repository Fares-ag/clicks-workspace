import React, { useState, useEffect } from "react";
import { Layout } from "antd";
import { Outlet } from "react-router-dom";
import FinanceSidebar from "./FinanceSidebar.jsx";
import FinanceTopBar from "./FinanceTopBar.jsx";
import "./AdminLayout.css";

const { Content } = Layout;

function FinanceLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth > 900 : true
  );
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth <= 900 : false
  );

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

  const handleToggleSidebar = () => setSidebarOpen((open) => !open);
  const handleCloseSidebar = () => {
    if (isMobile) setSidebarOpen(false);
  };

  return (
    <Layout className="admin-layout">
      <FinanceSidebar isOpen={sidebarOpen} onNavigate={handleCloseSidebar} />
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
        <FinanceTopBar onToggleSidebar={handleToggleSidebar} />
        <Content className="admin-layout-main">
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}

export default FinanceLayout;
