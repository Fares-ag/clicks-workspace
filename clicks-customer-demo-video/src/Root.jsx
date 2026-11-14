import React from "react";
import { Composition, Folder } from "remotion";
import { ClicksDemo, TOTAL, TIMELINE } from "./Video";
import { FPS, W, H } from "./theme";

/**
 * `ClicksCustomerDemo` is the film. Each chapter is also registered on its own
 * so a single beat can be scrubbed or rendered without the whole timeline.
 * A review cut is just a frame range of the main composition — see
 * `npm run preview` in package.json.
 */
export const RemotionRoot = () => (
  <>
    <Composition
      id="ClicksCustomerDemo"
      component={ClicksDemo}
      durationInFrames={TOTAL}
      fps={FPS}
      width={W}
      height={H}
    />
    <Folder name="Chapters">
      {TIMELINE.map(({ id, dur, Scene }) => (
        <Composition
          key={id}
          id={`Chapter-${id}`}
          component={Scene}
          durationInFrames={dur}
          fps={FPS}
          width={W}
          height={H}
          defaultProps={{ durationInFrames: dur }}
        />
      ))}
    </Folder>
  </>
);
