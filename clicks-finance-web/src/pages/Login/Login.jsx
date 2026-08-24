import React, { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import { useLoginMutation } from "../../store/portalApi";
import { setCredentials } from "../../store/authSlice";
import "./Login.css";

function Login() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const sessionExpired = useSelector((state) => state.auth.sessionExpired);
  const [login, { isLoading }] = useLoginMutation();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [touched, setTouched] = useState({ email: false, password: false });
  const [error, setError] = useState("");

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
    } catch {
      setError("Invalid email or password. Please try again.");
    }
  };

  const errorMessage =
    error ||
    (sessionExpired ? "Your session expired — please sign in again." : "");
  const showError =
    Boolean(errorMessage) &&
    (sessionExpired || (error && (touched.email || touched.password)));

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
        <div className="login-title">Finance Portal</div>
        <div className="login-subtitle">
          Sign in to audit completed jobs and enter costs.
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
              onChange={(e) => {
                setEmail(e.target.value);
                setError("");
              }}
              onBlur={() => setTouched((p) => ({ ...p, email: true }))}
              autoFocus
              autoComplete="username"
            />
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
              onChange={(e) => {
                setPassword(e.target.value);
                setError("");
              }}
              onBlur={() => setTouched((p) => ({ ...p, password: true }))}
              autoComplete="current-password"
            />
            {showError && (
              <div className="login-error-message">
                {errorMessage}
              </div>
            )}
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
