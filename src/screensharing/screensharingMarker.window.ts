/*
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { Rectangle } from 'electron'

import { BrowserWindow } from 'electron'
import { isMac, isWindows } from '../app/system.utils.ts'
import { getWindowUrl, onReadyToShow } from '../app/utils.ts'

/**
 * Create a frameless click-through overlay window marking a screen as being shared.
 *
 * The window is not focusable and ignores any mouse events,
 * so it never interferes with the applications on the marked screen.
 *
 * Note: on Linux the window is only transparent with a compositing window manager,
 * which is the case for all the common desktop environments.
 *
 * @param bounds - Bounds of the marker
 * @param options - Options
 * @param options.isWindowMarker - PROTOTYPE: whether the marker follows a single window instead of covering a display
 */
export function createScreensharingMarkerWindow(bounds: Rectangle, { isWindowMarker = false } = {}) {
	const window = new BrowserWindow({
		...bounds,
		// A window marker is kept directly above the marked window instead
		alwaysOnTop: !isWindowMarker,
		// The marker covers the entire display, including the menu bar and the dock on macOS
		enableLargerThanScreen: true,
		focusable: false,
		frame: false,
		fullscreenable: false,
		hasShadow: false,
		maximizable: false,
		minimizable: false,
		movable: false,
		resizable: false,
		show: false,
		skipTaskbar: true,
		transparent: true,
		// A utility window is not offered as a shareable window and is not listed in the window switcher
		type: isWindows ? 'toolbar' : isMac ? 'panel' : 'normal',
		webPreferences: {
			// The marker is a static page, it requires no API from the main process
			nodeIntegration: false,
			sandbox: true,
		},
	})

	window.removeMenu()
	// Click-through: all the mouse events are passed to the window below the marker
	window.setIgnoreMouseEvents(true)
	if (!isWindowMarker) {
		// Above any other window, including fullscreen applications and other always-on-top windows
		window.setAlwaysOnTop(true, 'screen-saver')
		window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true })
	}
	// Exclude the marker from the captured stream, so that it is visible locally only.
	// Not supported on Linux, there the marker is a part of the shared screen.
	window.setContentProtection(true)

	window.loadURL(getWindowUrl('screensharing_marker'))

	// The marker has no interactive content and must never take the focus, thus - showInactive
	if (!isWindowMarker) {
		onReadyToShow(window, () => window.showInactive())
	}

	return window
}
