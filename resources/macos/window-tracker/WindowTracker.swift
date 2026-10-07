/*
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

// PROTOTYPE: track a window of another application for the screen sharing marker.
//
// Usage: window-tracker <windowId>
//
// Prints a JSON line on every change of the tracked window:
//   {"x":0,"y":0,"width":0,"height":0,"onScreen":true,"pid":1,"above":[{"id":2,"pid":3}]}
// - x, y, width, height - bounds in global screen coordinates (points, top-left origin, as in Electron)
// - onScreen - false when the window is minimized, hidden or on another Space
// - pid - process ID of the tracked window owner
// - above - windows above the tracked one on the same layer, nearest first
// Prints {"gone":true} and exits when the window is closed.
// Exits when stdin is closed, so it never outlives the app.

import CoreGraphics
import Foundation

setvbuf(stdout, nil, _IOLBF, 0)

guard CommandLine.arguments.count == 2, let windowId = CGWindowID(CommandLine.arguments[1]) else {
	FileHandle.standardError.write("Usage: window-tracker <windowId>\n".data(using: .utf8)!)
	exit(64)
}

/// Get the info of a single window, including when it is not on screen.
/// Note: CGWindowListCopyWindowInfo with optionIncludingWindow returns nothing for a minimized window.
func getWindowInfo(_ id: CGWindowID) -> [String: Any]? {
	// The array must contain raw CGWindowID values, not objects
	var windowId = UnsafeRawPointer(bitPattern: UInt(id))
	let windowIds = CFArrayCreate(kCFAllocatorDefault, &windowId, 1, nil)
	let list = CGWindowListCreateDescriptionFromArray(windowIds) as? [[String: Any]]
	return list?.first
}

/// Get the windows above the given one on the same layer as JSON, nearest first.
/// Note: not only the nearest window, as some applications keep their own small windows directly above a window,
/// for example, iTerm2, which would hide any change of the z-order beyond it.
func getWindowsAbove(_ id: CGWindowID, layer: Int) -> String {
	let list = CGWindowListCopyWindowInfo([.optionOnScreenAboveWindow], id) as? [[String: Any]] ?? []
	// Front-to-back order: the closest window above is the last one
	return list
		.filter { ($0[kCGWindowLayer as String] as? Int) == layer }
		.reversed()
		.map { "{\"id\":\($0[kCGWindowNumber as String] as? Int ?? 0),\"pid\":\($0[kCGWindowOwnerPID as String] as? Int ?? 0)}" }
		.joined(separator: ",")
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
	let pid = info[kCGWindowOwnerPID as String] as? Int ?? 0
	let above = onScreen ? getWindowsAbove(windowId, layer: layer) : ""

	let output = "{\"x\":\(Int(bounds.origin.x)),\"y\":\(Int(bounds.origin.y)),\"width\":\(Int(bounds.width)),\"height\":\(Int(bounds.height)),\"onScreen\":\(onScreen),\"pid\":\(pid),\"above\":[\(above)]}"
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
