import React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import { Backdrop } from "../components/Backdrop";
import { PhoneFrame } from "../components/PhoneFrame";
import { PHONE, phonePoint } from "../components/Stage";
import { Callout } from "../components/Callout";
import { Eyebrow, Headline, Rule } from "../components/Type";
import { Bug, Caption } from "../components/Caption";
import { nameTag } from "../components/NameTag";

/**
 * Chapter E — the job closes. 315f.
 * Completion brings up the rating sheet on its own; the receipt is the real
 * one the API issued, in Qatari riyals.
 */
export const ChDone = () => {
  const p = PHONE.right;
  const at = { position: "absolute", left: p.left, top: p.top };
  const stars = phonePoint("right", 200, 1690); // the star row in the rating sheet
  const amount = phonePoint("right", 200, 1180); // "Amount: 150 QAR" in the receipt

  return (
    <Backdrop side="right">
      <AbsoluteFill>
        <div style={{ position: "absolute", left: 120, top: 268, display: "flex", flexDirection: "column", gap: 30 }}>
          <Eyebrow delay={6}>Chapter 04 &middot; Done</Eyebrow>
          <Headline lines={["Paid, receipted,", "rated."]} delay={14} size={74} accentFrom={1} />
          <Rule delay={34} />
        </div>

        {/* The rating sheet presents itself the moment the job closes. */}
        <Sequence durationInFrames={160}>
          <div style={at}>
            <PhoneFrame
              video
              src="clips/take17-rating.mp4"
              startFrom={60}
              overlays={[nameTag("rating")]}
            />
          </div>
          <Callout x={stars.x} y={stars.y} label="Rate the work" dir="left" length={190} delay={34} />
          <Caption x={120} bottom={150} delay={16} hold={120}>
            The moment the job closes, the app asks how it went.
          </Caption>
        </Sequence>

        <Sequence from={160} durationInFrames={65}>
          <div style={at}>
            <PhoneFrame
              video
              src="clips/take17-rating.mp4"
              startFrom={330}
              enter={0}
              overlays={[nameTag("inProgressDimmed")]}
            />
          </div>
          <Caption x={120} bottom={150} delay={6}>
            One tap, and the feedback is in.
          </Caption>
        </Sequence>

        <Sequence from={225}>
          <div style={at}>
            <PhoneFrame src="stills/s17-receipt.png" enter={0} overlays={[nameTag("detailsDimmed")]} />
          </div>
          <Callout x={amount.x} y={amount.y} label="Receipt, in Qatari riyals" dir="left" length={200} delay={14} />
          <Caption x={120} bottom={150} delay={10}>
            And the receipt is there, with the job reference and the amount.
          </Caption>
        </Sequence>

        <Bug />
      </AbsoluteFill>
    </Backdrop>
  );
};
