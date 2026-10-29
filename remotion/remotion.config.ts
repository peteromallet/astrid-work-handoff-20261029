import {Config} from '@remotion/cli/config';
import path from 'node:path';
import fs from 'node:fs';
import {pcmAacMp4Stitch} from './pcm-aac-stitch';
import {remotionPrimitiveAliasesFor} from './webpack-alias.mjs';
import {installAdmittedFrameStreaming} from './stream-frames';
// One chrome-headless-shell shared by every stack (see shared-browser.mjs).
import {sharedBrowserExecutable} from './shared-browser.mjs';

// The real CLI captures this cwd while executing the config. Deferred hooks
// retain the same selected root even after the loader restores its caller cwd.
const remotionRoot = process.cwd();
if (!path.isAbsolute(remotionRoot)
    || !fs.statSync(path.join(remotionRoot, 'remotion.config.ts')).isFile()) {
  throw new Error('Remotion config requires its selected absolute config directory');
}
installAdmittedFrameStreaming({remotionRoot});

Config.setVideoImageFormat('jpeg');
Config.setOverwriteOutput(true);
Config.setChromiumOpenGlRenderer('swangle');
const sharedBrowser = sharedBrowserExecutable();
if (sharedBrowser) Config.setBrowserExecutable(sharedBrowser);
// Set only by Astrid's invocation-scoped Three.js MP4 capture path. Ordinary
// Remotion and alpha/ProRes renders retain their existing audio mux behavior.
const pcmAacOutput = process.env.ASTRID_REMOTION_PCM_AAC_OUTPUT;
if (pcmAacOutput) {
  Config.overrideFfmpegCommand(pcmAacMp4Stitch(pcmAacOutput));
}
// Keep Remotion's CLI bundle and the runtime's smoke-bundle resolver on the
// same declaration-driven V3 alias implementation.
Config.overrideWebpackConfig(remotionPrimitiveAliasesFor(remotionRoot));
