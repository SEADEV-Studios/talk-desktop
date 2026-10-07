/*
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

// PROTOTYPE: mark a single shared window on macOS.
// The bounds and the z-order of a window of another application are not available via Electron,
// they are tracked by a native helper (resources/macos/window-tracker).

import type { BrowserWindow, Rectangle } from 'electron'
import type { ChildProcessWithoutNullStreams } from 'node:child_process'

import { app } from 'electron'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { createScreensharingMarkerWindow } from './screensharingMarker.window.ts'

/** Width of the marker border in px, must match screensharingMarker.css */
const BORDER_WIDTH = 5

type TrackedWindowState = { gone: true } | (Rectangle & {
	onScreen: boolean
	/** Process ID of the tracked window owner */
	pid: number
	/** Windows above the tracked one on the same layer, nearest first */
	above: { id: number, pid: number }[]
})

let trackedSourceId: string | null = null
let tracker: ChildProcessWithoutNullStreams | null = null
let markerWindow: BrowserWindow | null = null

/**
 * Mark a shared window, following its bounds and z-order
 *
 * @param sourceId - The window source ID, "window:{CGWindowID}:0"
 */
export function showWindowMarker(sourceId: string) {
	if (trackedSourceId === sourceId) {
		return
	}
	hideWindowMarker()

	trackedSourceId = sourceId
	const windowId = sourceId.split(':')[1]!
	// PROTOTYPE: dev only, the helper is not packaged
	const binary = path.join(app.getAppPath(), 'resources/macos/window-tracker/window-tracker')
	const process = spawn(binary, [windowId])
	tracker = process

	let buffer = ''
	process.stdout.setEncoding('utf8')
	process.stdout.on('data', (chunk: string) => {
		buffer += chunk
		let newLineIndex: number
		while ((newLineIndex = buffer.indexOf('\n')) !== -1) {
			const line = buffer.slice(0, newLineIndex)
			buffer = buffer.slice(newLineIndex + 1)
			if (tracker === process) {
				applyTrackedWindowState(JSON.parse(line) as TrackedWindowState)
			}
		}
	})
	process.stderr.on('data', (chunk) => console.error('[window-tracker]', chunk.toString()))
	process.on('error', (error) => console.error('[window-tracker] Failed to start', error))
	process.on('exit', () => {
		if (tracker === process) {
			hideWindowMarker()
		}
	})
}

/**
 * Remove the window marker, if any
 */
export function hideWindowMarker() {
	trackedSourceId = null
	if (tracker) {
		const process = tracker
		tracker = null
		process.kill()
	}
	if (markerWindow) {
		markerWindow.destroy()
		markerWindow = null
	}
}

/**
 * Update the marker according to the current state of the tracked window
 *
 * @param state - The tracked window state reported by the helper
 */
function applyTrackedWindowState(state: TrackedWindowState) {
	if ('gone' in state) {
		hideWindowMarker()
		return
	}

	// The border is drawn around the window, not over its content
	const bounds = {
		x: state.x - BORDER_WIDTH,
		y: state.y - BORDER_WIDTH,
		width: state.width + 2 * BORDER_WIDTH,
		height: state.height + 2 * BORDER_WIDTH,
	}

	if (!markerWindow) {
		markerWindow = createScreensharingMarkerWindow(bounds, { isWindowMarker: true })
		// A panel floats above normal windows, while the marker must stay in the same level as the marked window
		markerWindow.setAlwaysOnTop(false)
	} else {
		markerWindow.setBounds(bounds)
	}

	// Minimized, hidden or on another Space
	if (!state.onScreen) {
		markerWindow.hide()
		return
	}

	if (!markerWindow.isVisible()) {
		markerWindow.showInactive()
	}

	// The marker is in place when there are only windows of the same application between it and the marked window,
	// for example, small accessory windows some applications keep directly above their windows
	const markerWindowNumber = Number(markerWindow.getMediaSourceId().split(':')[1])
	const markerIndex = state.above.findIndex((window) => window.id === markerWindowNumber)
	const isMarkerInPlace = markerIndex !== -1
		&& state.above.slice(0, markerIndex).every((window) => window.pid === state.pid)
	if (!isMarkerInPlace) {
		try {
			markerWindow.moveAbove(trackedSourceId!)
		} catch (error) {
			console.error('[window-tracker] Failed to move the marker above the window', error)
		}
	}
}
