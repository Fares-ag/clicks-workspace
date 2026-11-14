import { Config } from "@remotion/cli/config";

// PNG intermediates: JPEG frames visibly soften the app's small UI text.
Config.setVideoImageFormat("png");
Config.setCrf(12);
Config.setOverwriteOutput(true);
Config.setChromiumOpenGlRenderer("angle");
Config.setEntryPoint("src/index.jsx");
