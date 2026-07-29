import React, { useState } from "react";
import { useDispatch } from "react-redux";
import { useNavigate, Navigate } from "react-router-dom";
import { useSelector } from "react-redux";
import { useLoginMutation } from "../../store/portalApi";
import { setCredentials } from "../../store/authSlice";
import "./Login.css";

function looksLikeEmail(value) {
  return String(value || "").includes("@");
}

function Login() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const token = useSelector((state) => state.auth.token);
  const [login, { isLoading }] = useLoginMutation();

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [touched, setTouched] = useState({ identifier: false, password: false });
  const [error, setError] = useState("");

  if (token) {
    return <Navigate to="/" replace />;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setTouched({ identifier: true, password: true });
    setError("");
    if (!identifier.trim() || !password) {
      setError("Enter your email or phone and password.");
      return;
    }
    const body = looksLikeEmail(identifier.trim())
      ? { email: identifier.trim(), password }
      : { phone: identifier.trim(), password };

    try {
      const res = await login(body).unwrap();
      dispatch(
        setCredentials({
          accessToken: res.accessToken,
          user: res.user,
          business: res.business,
        })
      );
      navigate("/", { replace: true });
    } catch {
      setError("Invalid credentials. Please try again.");
    }
  };

  const showError = error && (touched.identifier || touched.password);

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
        <div className="login-title">Business Portal</div>
        <div className="login-subtitle">
          Enter your email or phone and password to sign in.
        </div>
        <form onSubmit={handleSubmit} autoComplete="off" style={{ width: "100%" }}>
          <div className="login-form-group">
            <label className="login-label" htmlFor="login-identifier">
              Email or phone*
            </label>
            <input
              id="login-identifier"
              className={`login-input${showError ? " error" : ""}`}
              type="text"
              placeholder="Email or phone number"
              value={identifier}
              onChange={(e) => {
                setIdentifier(e.target.value);
                setError("");
              }}
              onBlur={() => setTouched((p) => ({ ...p, identifier: true }))}
              autoFocus
              autoComplete="username"
            />
          </div>
          <div className="login-form-group">
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
            {showError && <div className="login-error-message">{error}</div>}
          </div>
          <div className="login-signin-row">
            <button
              type="submit"
              className="login-signin-btn"
              disabled={isLoading}
            >
              {isLoading ? "Signing in…" : "Sign in"}
            </button>
          </div>
        </form>
      </div>
      <div className="login-right" aria-hidden="true" />
    </div>
  );
}

export default Login;
