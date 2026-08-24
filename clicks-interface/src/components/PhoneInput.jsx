import {
  COUNTRY_CODES,
  DEFAULT_COUNTRY_CODE,
  localLengthFor,
  toLocalDigits,
} from "../utils/phone";
import "./PhoneInput.css";

/**
 * Country prefix + 8-digit local number (login-style Qatar UX).
 * `value` / `onChange` always use local digits only (no +974 in the text field).
 */
export default function PhoneInput({
  value,
  onChange,
  countryCode = DEFAULT_COUNTRY_CODE,
  onCountryCodeChange,
  placeholder = "12345678",
  disabled = false,
  required = false,
  error = false,
  name = "phone",
  id,
}) {
  const local = toLocalDigits(value, countryCode);

  const handleLocalChange = (e) => {
    const next = toLocalDigits(e.target.value, countryCode);
    onChange?.(next);
  };

  return (
    <div className={`phone-input-wrapper${error ? " phone-input-error" : ""}`}>
      <select
        className="phone-input-prefix"
        value={countryCode}
        onChange={(e) => onCountryCodeChange?.(e.target.value)}
        disabled={disabled || !onCountryCodeChange}
        aria-label="Country code"
      >
        {COUNTRY_CODES.map((cc) => (
          <option key={cc.value} value={cc.value}>
            {cc.label}
          </option>
        ))}
      </select>
      <div className="phone-input-divider" />
      <input
        id={id}
        type="tel"
        inputMode="numeric"
        name={name}
        className="phone-input-number"
        value={local}
        onChange={handleLocalChange}
        placeholder={placeholder}
        disabled={disabled}
        required={required}
        maxLength={localLengthFor(countryCode)}
        autoComplete="tel-national"
      />
    </div>
  );
}
