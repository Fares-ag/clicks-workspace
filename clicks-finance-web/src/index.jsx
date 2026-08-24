import React from "react";
import ReactDOM from "react-dom/client";
import { Provider } from "react-redux";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import store from "./store/store";
import "antd/dist/reset.css";
import "./styles/theme.css";
import "./styles/global.css";
import "./styles/admin-page.css";
import "./styles/responsive.css";
import "./styles/fonts.css";

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <Provider store={store}>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </Provider>
);
