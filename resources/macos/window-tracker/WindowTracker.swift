/*
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

// PROTOTYPE: track a window of another application for the screen sharing marker.
//
// Usage: window-tracker <windowId>
//
// Prints a JSON line on every change of the tracked window:
//   {"x":0,"y":0,"width":0,"height":0,"onScreen":true,"above":123}
// - x, y, width, height - bounds in global screen coordinates (points, top-left origin, as in Electron)
// - onScreen - false when the window is minimized, hidden or on another Space
// - above - number of the window directly above the tracked one on the same layer, 0 if none
// Prints {"gone":true} and exits when the window is closed.
// Exits when stdin is closed, so it never outlives the app.

import CoreGraphics
import Foundation

setvbuf(stdout, nil, _IOLBF, 0)

guard CommandLine.arguments.count == 2, let windowId = CGWindowID(CommandLine.arguments[1]) else {
	FileHandle.standardError.write("Usage: window-tracker <windowId>\n".data(using: .utf8)!)
	exit(64)
}

/// Get the info of a single window, including when it is not on screen
func getWindowInfo(_ id: CGWindowID) -> [String: Any]? {
	let list = CGWindowListCopyWindowInfo([.optionIncludingWindow], id) as? [[String: Any]]
	return list?.first
}

/// Get the number of the window directly above the given one on the same layer
func getWindowAbove(_ id: CGWindowID, layer: Int) -> Int {
	// Front-to-back order: the closest window above is the last one
	let list = CGWindowListCopyWindowInfo([.optionOnScreenAboveWindow], id) as? [[String: Any]] ?? []
	let sameLayer = list.filter { ($0[kCGWindowLayer as String] as? Int) == layer }
	return sameLayer.last?[kCGWindowNumber as String] as? Int ?? 0
}

var lastOutput = ""

func poll() {
	guard let info = getWindowInfo(windowId),
	      let boundsDict = info[kCGWindowBounds as String] as! CFDictionary?,
	      let bounds = CGRect(dictionaryRepresentation: boundsDict) else {
		print("{\"gone\":true}")
		exit(0)
	}

	let onScreen = info[kCGWindowIsOnscreen as String] as? Bool ?? false
	let layer = info[kCGWindowLayer as String] as? Int ?? 0
	let above = onScreen ? getWindowAbove(windowId, layer: layer) : 0

	let output = "{\"x\":\(Int(bounds.origin.x)),\"y\":\(Int(bounds.origin.y)),\"width\":\(Int(bounds.width)),\"height\":\(Int(bounds.height)),\"onScreen\":\(onScreen),\"above\":\(above)}"
	if output != lastOutput {
		lastOutput = output
		print(output)
	}
}

// Exit as soon as the parent process closes stdin
FileHandle.standardInput.readabilityHandler = { handle in
	if handle.availableData.isEmpty {
		exit(0)
	}
}

// ~60 FPS to follow a window being dragged
Timer.scheduledTimer(withTimeInterval: 1.0 / 60.0, repeats: true) { _ in poll() }
poll()
RunLoop.main.run()
