/** SPDX-License-Identifier: Apache-2.0
 * From OpenMotion, revision b6846fda08c4950fe4d50e5b01225bd49f84167b.
 * Selected functions copied unchanged; see docs/licenses/openmotion/NOTICE.md and LICENSE.
 */
export function formatTime(time: number): string {
  if (!Number.isFinite(time) || time < 0) return "00:00";
  const mins = Math.floor(time / 60);
  const secs = Math.floor(time % 60);
  // Zero-pad minutes as well as seconds so every readout is a stable-width
  // MM:SS (e.g. "00:44", not "0:44"). Minutes past 99 keep their extra digits
  // ("120:00"); an hours-style H:MM:SS grouping is applied by callers that need
  // it (see formatTimelineTickLabel), never here.
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

export function secondsToFrame(time: number, fps: number): number {
  if (!Number.isFinite(time) || time <= 0) return 0;
  if (!Number.isFinite(fps) || fps <= 0) return 0;
  return Math.round(time * fps);
}

export function frameToSeconds(frame: number, fps: number): number {
  if (!Number.isFinite(frame) || frame <= 0) return 0;
  if (!Number.isFinite(fps) || fps <= 0) return 0;
  return frame / fps;
}

