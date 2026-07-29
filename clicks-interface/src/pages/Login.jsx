import React, { useState } from "react";
import { useDispatch } from "react-redux";
import { useLoginMutation } from "../store/authApi";
import { setCredentials } from "../store/authSlice";
import { useNavigate } from "react-router-dom";
import "./Login.css";

function Login() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [login, { isLoading }] = useLoginMutation();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [touched, setTouched] = useState({ email: false, password: false });
  const [error, setError] = useState("");

  const handleEmailChange = (e) => {
    setEmail(e.target.value);
    setError("");
  };

  const handlePasswordChange = (e) => {
    setPassword(e.target.value);
    setError("");
  };

  const handleBlur = (field) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setTouched({ email: true, password: true });
    setError("");
    if (!email || !password) {
      setError("Invalid email or password. Please try again.");
      return;
    }
    try {
      const res = await login({ email, password }).unwrap();
      dispatch(setCredentials(res));
      navigate("/dashboard");
    } catch (err) {
      setError("Invalid email or password. Please try again.");
    }
  };

  const showError = error && (touched.email || touched.password);

  return (
    <div className="login-root">
      <div className="login-left">
        <img
          src="/logo/Logo.svg"
          alt="Clicks Logo"
          className="login-logo"
          width={206}
          height={32}
        />
        <div className="login-title">Log In</div>
        <div className="login-subtitle">
          Enter your email and password to sign in!
        </div>
        <form onSubmit={handleSubmit} autoComplete="off" style={{ width: "100%" }}>
          <div className="login-form-group">
            <label className="login-label" htmlFor="login-email">
              Email*
            </label>
            <input
              id="login-email"
              className={`login-input${showError ? " error" : ""}`}
              type="email"
              placeholder="Enter your email"
              value={email}
              onChange={handleEmailChange}
              onBlur={() => handleBlur("email")}
              autoFocus
              autoComplete="username"
            />
            {showError && (
              <div className="login-error-message">
                Invalid email or password. Please try again.
              </div>
            )}
          </div>
          <div className="login-form-group" style={{ marginTop: 0 }}>
            <label className="login-label" htmlFor="login-password">
              Password*
            </label>
            <input
              id="login-password"
              className={`login-input${showError ? " error" : ""}`}
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={handlePasswordChange}
              onBlur={() => handleBlur("password")}
              autoComplete="current-password"
            />
            {showError && (
              <div className="login-error-message">
                Invalid email or password. Please try again.
              </div>
            )}
          </div>
          <div className="login-forgot-row">
            <a href="#" className="login-forgot-link">
              Forgot password?
            </a>
          </div>
          <div className="login-signin-row">
            <button
              className="login-signin-btn"
              type="submit"
              disabled={isLoading}
            >
              {isLoading ? "Signing In..." : "Sign In"}
            </button>
          </div>
        </form>
      </div>
      <div className="login-right" />
    </div>
  );
}

export default Login;
