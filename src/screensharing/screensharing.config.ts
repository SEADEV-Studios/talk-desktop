/*
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { app } from 'electron'
import { isWindows } from '../app/system.utils.ts'

/**
 * Chromium feature instructing the Windows.Graphics.Capture API
 * to draw its capture border around the captured window.
 *
 * @see https://learn.microsoft.com/en-us/uwp/api/windows.graphics.capture.graphicscapturesession.isborderrequired
 */
const WGC_REQUIRE_BORDER_FEATURE = 'WebRtcWgcRequireBorder'

/**
 * Let Windows mark a shared window with its own capture border.
 *
 * Windows draws a yellow border around a window captured via Windows.Graphics.Capture,
 * which Chromium uses for window capture. The border is drawn by the system on the local screen only,
 * it is not a part of the captured frames, so the other participants of a call never see it.
 *
 * Chromium opts out of this border by default (WebRtcWgcRequireBorder is disabled),
 * which silently removes the only indication of an active window sharing on Windows 11.
 * On Windows 10 the border is always drawn, as opting out requires Windows 11.
 *
 * Note: Chromium does not use Windows.Graphics.Capture for screen capture,
 * so an entire screen is never marked by the system and is marked by the application instead.
 *
 * Must be called before the app is ready, as Chromium features are resolved on startup.
 */
export function applyNativeWindowCaptureBorder() {
	if (!isWindows) {
		return
	}

	// Do not drop features enabled via the command line
	const enabledFeatures = app.commandLine.getSwitchValue('enable-features')
	app.commandLine.appendSwitch('enable-features', [enabledFeatures, WGC_REQUIRE_BORDER_FEATURE].filter(Boolean).join(','))
}
