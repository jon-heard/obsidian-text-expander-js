////////////////////////////////////////////////////////////////////////////////////////////////////
// Input blocker - Turn on/off input blocking in the UI.  Darkens the screen while blocking input //
////////////////////////////////////////////////////////////////////////////////////////////////////

"use strict";

namespace InputBlocker
{
	export function initialize(plugin: TextExpanderJsPlugin)
	{
		_plugin = plugin;
	}

	// Adds/removes a tinted full-screen div to prevent user-input
	export function setEnabled(value: boolean): void
	{
		if (value)
		{
			// If Input blocker UI already exists, do nothing
			if (document.getElementById("tejs_inputBlocker")) { return; }

			// Create the input blocker UI
			let blockerUi: any = document.createElement("div");
			blockerUi.id = "tejs_inputBlocker";
			blockerUi.classList.add("tejs_fadedOut");
			document.getElementsByTagName("body")[0].prepend(blockerUi);

			// Animate fadin
			window.getComputedStyle(blockerUi).opacity;
			blockerUi.classList.remove("tejs_fadedOut")

			// Enable input blocking
			_plugin.inputDisabled = true;
		}
		else
		{
			// Remove the input blocker UI
			let blockerUi: any = document.getElementById("tejs_inputBlocker");
			if (blockerUi) { blockerUi.remove(); }

			// Disable input blocking
			_plugin.inputDisabled = false;
		}
	}

///////////////////////////////////////////////////////////////////////////////////////////////////

	let _plugin: TextExpanderJsPlugin;
}