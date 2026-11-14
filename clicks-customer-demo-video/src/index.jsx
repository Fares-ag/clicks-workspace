import { registerRoot, staticFile, delayRender, continueRender } from "remotion";
import { RemotionRoot } from "./Root";

/**
 * Helvetica Neue is the product's own typeface (clicks-user/assets/fonts).
 * Rendering is held until the faces are ready, otherwise the first frames
 * come out in the fallback.
 */
const WEIGHTS = [
  ["300", "HelveticaNeueLight.otf"],
  ["400", "HelveticaNeueRoman.otf"],
  ["500", "HelveticaNeueMedium.otf"],
  ["700", "HelveticaNeueBold.otf"],
];

const handle = delayRender("loading Helvetica Neue");
Promise.all(
  WEIGHTS.map(([weight, file]) => {
    const face = new FontFace("HelveticaNeue", `url(${staticFile(`fonts/${file}`)})`, { weight });
    return face.load().then((loaded) => document.fonts.add(loaded));
  })
)
  .then(() => continueRender(handle))
  .catch(() => continueRender(handle));

registerRoot(RemotionRoot);
