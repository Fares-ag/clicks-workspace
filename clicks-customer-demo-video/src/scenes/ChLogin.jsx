import React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import { Backdrop } from "../components/Backdrop";
import { PhoneFrame } from "../components/PhoneFrame";
import { PHONE } from "../components/Stage";
import { Eyebrow, Headline, Rule, Sub } from "../components/Type";
import { Bug } from "../components/Caption";

/**
 * Chapter A — the app, and who it is for. 255f.
 * Real sign-in: phone number, password, Sign In, Home. Nothing staged.
 */
export const ChLogin = () => {
  const p = PHONE.right;
  const at = { position: "absolute", left: p.left, top: p.top };

  return (
    <Backdrop side="right">
      <AbsoluteFill>
        <div style={{ position: "absolute", left: 120, top: 250, display: "flex", flexDirection: "column", gap: 34 }}>
          <Eyebrow delay={6}>Roadside assistance &middot; Qatar</Eyebrow>
          <Headline lines={["One press.", "Help on the way."]} delay={14} accentFrom={1} />
          <Rule delay={34} />
          <Sub delay={42}>
            Clicks puts roadside assistance in your pocket &mdash; and shares your exact location with dispatch.
          </Sub>
        </div>

        {/* Welcome screen through typing, run hot so the form fills fast. */}
        <Sequence durationInFrames={128}>
          <div style={at}>
            <PhoneFrame video src="clips/take10-login.mp4" startFrom={30} playbackRate={2.4} rotate={-5} />
          </div>
        </Sequence>
        {/* Filled form, Sign In, and the app opening on Home. */}
        <Sequence from={128}>
          <div style={at}>
            <PhoneFrame video src="clips/take10-login.mp4" startFrom={510} playbackRate={1.6} rotate={-5} enter={0} />
          </div>
        </Sequence>

        <Bug />
      </AbsoluteFill>
    </Backdrop>
  );
};
