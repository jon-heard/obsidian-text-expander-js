///////////////////////////////////////////////////////////////////////////////////////////////////
// Shortcut loader - Load shortcuts from a shortcut-file, or from all shortcut-files & settings. //
///////////////////////////////////////////////////////////////////////////////////////////////////

"use strict";

const REGEX_NOTE_METADATA: RegExp = /^\n*---\n(?:[^-]+\n)?---\n/;
const REGEX_SPLIT_FIRST_DASH: RegExp = / - (.*)/s;
const GENERAL_HELP_PREAMBLE = `return [ "#### Help - General
Here are shortcuts for help with __Text Expander JS__.
- __help__ - Shows this text.
- __ref settings__ - Describes shortcuts defined in the Settings.
- __ref all__ - Describes _all_ shortcuts (except for the ones in this list).`;
const GENERAL_HELP_PREAMBLE_SHORTCUT_FILES = `
- For help on specific shortcut-files, __help__ and __ref__ can be followed by:`;
const SFILE_HELP_PREAMBLE = `return "#### Help - $1
_Use shortcut __ref $2__ for a list of shortcuts._

`;
const SFILE_REF_PREAMBLE = `let result = "#### Reference - $1
_Use shortcut __help $2__ for general help._
";`;

abstract class ShortcutLoader
{
	// Parses a shortcut-file's contents into a useful data format and returns it
	public static parseShortcutFile(
		filename: string, content: string, maintainCodeFence?: boolean,
		maintainAboutString?: boolean) : any
	{
		return this.parseShortcutFile_internal(
			filename, content, maintainCodeFence, maintainAboutString);
	}

	// Offer "setupShortcuts" function for use as a callback.
	// Function loads all shortcuts from the settings and shortcut-file list into the plugin.
	public static getFunction_setupShortcuts(): Function
	{
		return this.setupShortcuts_internal.bind(this);
	}

///////////////////////////////////////////////////////////////////////////////////////////////////

	private static parseShortcutFile_internal(
		filename: string, content: string, maintainCodeFence?: boolean,
		maintainAboutString?: boolean) : any
	{
		// Sanitize newlines.  "\r" disrupts calculations, including the regex replace.
		content = content.replaceAll("\r", "");

		// Remove any note metadata
		content = content.replace(REGEX_NOTE_METADATA, "");

		// Result vars
		let fileAbout: string = "";
		let shortcuts: Array<any> = [];
		let shortcutAbouts: Array<any> = [];

		// Flag set when an error occurs.  Used for single popup for ALL file errors.
		let fileHasErrors: boolean = false;

		const sections: Array<string> = content.split("~~").map((v: string) => v.trim());
		fileAbout = sections[0];

		// Check for the obvious error of misnumbered sections (bounded by "~~")
		if (!!((sections.length-1) % 3))
		{
			UserNotifier.run(
			{
				consoleMessage: "In shortcut-file \"" + filename + "\"",
				messageType: "MISNUMBERED-SECTION-COUNT-ERROR"
			});
			fileHasErrors = true;
		}

		// Parse each shortcut in the file
		// NOTE: this loop checks i+2 and increments by 3 as it uses i, i+1 and i+2.
		for (let i: number = 1; i+2 < sections.length; i += 3)
		{
			// Test string handling
			let testRegex: any = null;
			if (maintainCodeFence)
			{
				// "maintainCodeFence" is not possible with a real RegExp object.
				// Instead, create RegExp-style-dummy to retain fence within API.
				testRegex = { source: sections[i] };
			}
			else
			{
				let c = sections[i];

				// Handle the Test being in a basic fenced code-block
				if (c.startsWith("```") && c.endsWith("```"))
				{
					c = c.substring(3, c.length-3).trim();
				}

				try
				{
					testRegex = new RegExp(c);
				}
				catch (e: any)
				{
					UserNotifier.run(
					{
						consoleMessage: "In shortcut-file \"" + filename + "\":\n" + INDENT + c,
						messageType: "BAD-TEST-STRING-ERROR"
					});
					fileHasErrors = true;
					continue;
				}
			}

			// Expansion string handling
			let exp: string = sections[i+1];
			// Handle the Expansion being in a javascript fenced code-block
			if (!maintainCodeFence)
			{
				if (exp.startsWith("```js") && exp.endsWith("```"))
				{
					exp = exp.substring(5, exp.length-3).trim();
				}
			}

			// Add shortcut to result
			if (maintainAboutString)
			{
				shortcuts.push({
					test: testRegex, expansion: exp, about: sections[i+2] });
			}
			else
			{
				shortcuts.push({ test: testRegex, expansion: exp });
			}

			// About string handling
			// Skip if it's a helper script, helper blocker or setup script, or if the About
			// string's syntax string is the string "hidden"
			if (testRegex.source !== "(?:)" && testRegex.source !== "^tejs setup$" &&
			    testRegex.source !== "^tejs shutdown$" && !sections[i+2].startsWith("hidden - "))
			{
				let aboutParts: Array<string> =
					sections[i+2].split(REGEX_SPLIT_FIRST_DASH).map((v: string) => v.trim());
				// If no syntax string is included, use the Regex string instead
				if (aboutParts.length === 1)
				{
					aboutParts = [testRegex.source, aboutParts[0]];
				}
				shortcutAbouts.push({ syntax: aboutParts[0], description: aboutParts[1] });
			}
		}

		// If errors during parsing, notify user in a general popup notification.
		// Any errors were added to console at the moment they were found.
		if (fileHasErrors)
		{
			UserNotifier.run(
			{
				popupMessage: "Shortcut-file issues\n" + filename,
				consoleHasDetails: true
			});
		}

		// Return result of parsing the shortcut file
		return { shortcuts: shortcuts, fileAbout: fileAbout, shortcutAbouts: shortcutAbouts };
	}

	private static async setupShortcuts_internal(): Promise<void>
	{
		const plugin = TextExpanderJsPlugin.getInstance();

		// To fill with data for the generation of help shortcuts
		let abouts: Array<any> = [];

		// Restart the master list of shortcuts
		plugin.shortcuts = [ { test: /^help$/, expansion: "" } ];
		let shortcutFiles: Array<string> = [];
		this.updateGeneralHelpShortcut(shortcutFiles);

		// Add shortcuts defined directly in the settings
		let parseResult: any =
			this.parseShortcutFile_internal("settings", plugin.settings.shortcuts);
		plugin.shortcuts = plugin.shortcuts.concat(parseResult.shortcuts);
		abouts.push({ filename: "", shortcutAbouts: parseResult.shortcutAbouts });

		// Add a helper-blocker to segment helper scripts within their shortcut-files
		plugin.shortcuts.push({});

		// Go over all shortcut-files
		for (const shortcutFile of plugin.settings.shortcutFiles)
		{
			if (!shortcutFile.enabled) { continue; }
			const file: any = plugin.app.vault.fileMap[shortcutFile.address];
			if (!file)
			{
				UserNotifier.run(
				{
					popupMessage: "Missing shortcut-file\n" + shortcutFile.address,
					consoleMessage: shortcutFile.address,
					messageType: "MISSING-SHORTCUT-FILE-ERROR"
				});
				continue;
			}

			const content: string = await plugin.app.vault.cachedRead(file);

			// Parse shortcut-file contents
			parseResult = this.parseShortcutFile(shortcutFile.address, content)

			// Look for a "setup" script in this shortcut-file.  Run if found.
			for (const newShortcut of parseResult.shortcuts)
			{
				if (newShortcut.test.source === "^tejs setup$")
				{
					// If setup script returns TRUE, don't use shortcuts
					if (ShortcutExpander.runExpansionScript(newShortcut.expansion))
					{
						parseResult.shortcuts = null;
					}
					break;
				}
			}

			// If setup script returned true, abort adding the new shortcuts
			if (!parseResult.shortcuts) { continue; }

			// Look for "shutdown" script in this shortcut-file.  Store if found.
			for (const newShortcut of parseResult.shortcuts)
			{
				if (newShortcut.test.source === "^tejs shutdown$")
				{
					plugin.shutdownScripts[shortcutFile.address] = newShortcut.expansion;
					break;
				}
			}

			// Add new shortcuts to master list, followed by helper-blocker
			plugin.shortcuts = plugin.shortcuts.concat(parseResult.shortcuts);
			plugin.shortcuts.push({});

			// Get the file About string and shortcut About strings
			let baseName: string = shortcutFile.address.substring(
				shortcutFile.address.lastIndexOf("/")+1,
				shortcutFile.address.length-3);
			baseName = baseName.startsWith("tejs_") ? baseName.substr(5) : baseName;
			shortcutFiles.push(baseName);
			this.updateGeneralHelpShortcut(shortcutFiles);
			abouts.push(
			{
				filename: baseName,
				fileAbout: parseResult.fileAbout,
				shortcutAbouts: parseResult.shortcutAbouts
			});
		}

		// Generate and add help shortcuts
		plugin.shortcuts = this.generateHelpShortcuts(abouts).concat(plugin.shortcuts);
	}

	private static updateGeneralHelpShortcut(shortcutFiles: Array<string>): void
	{
		let expansion = GENERAL_HELP_PREAMBLE.replaceAll("\n", "\\n");
		if (shortcutFiles.length > 0)
		{
			expansion +=
				GENERAL_HELP_PREAMBLE_SHORTCUT_FILES.replaceAll("\n", "\\n") + "\", " +
				"\"\\n    - " + shortcutFiles.join("\",\"\\n    - ");
		}
		expansion += "\", \"\\n\\n\" ];"
		TextExpanderJsPlugin.getInstance().shortcuts[0].expansion = expansion;
	}

	// Creates help shortcuts based on "about" info from shortcuts and shortcut-files
	private static generateHelpShortcuts(abouts: any): Array<any>
	{
		// The final list of help shortcuts
		let result: Array<any> = [];

		// Helper functions
		function capitalize(s: string)
		{
			return s.charAt(0).toUpperCase() + s.slice(1);
		}
		function stringifyString(s: string)
		{
			return s.replaceAll("\"", "\\\"").replaceAll("\n", "\\n");
		}
		function makeHelpShortcut(name: string, about: string)
		{
			about ||= "No information available.";
			const expansion: string =
				SFILE_HELP_PREAMBLE.replaceAll("\n", "\\n").replaceAll("$1", capitalize(name)).
					replaceAll("$2", name) +
				stringifyString(about) +
				"\\n\\n\";";
			const test: RegExp = new RegExp("^help " + name + "$");
			result.push({ test: test, expansion: expansion });
		}
		function makeRefShortcut(groupName: string, abouts: any, displayName?: string)
		{
			displayName = displayName || capitalize(groupName);
			let expansion: string =
			SFILE_REF_PREAMBLE.replaceAll("\n", "\\n").replaceAll("$1", displayName).
				replaceAll("$2", groupName) + "\n";
			for (const about of abouts)
			{
				let description: string = "";
				if (about.description)
				{
					description = " - " + stringifyString(about.description);
				}
				expansion +=
					"result += \"- __" + about.syntax + "__" + description + "\\n\";\n";
			}
			if (!abouts.length)
			{
				expansion += "result += \"\\nNo shortcuts\\n\";\n";
			}
			expansion += "return result + \"\\n\";";
			const test: RegExp = new RegExp("^ref(?:erence)? " + groupName + "$");
			result.push({ test: test, expansion: expansion });
		}

		// Gather info
		let settingsAbouts: Array<any> = [];
		let shortcutFileAbouts: Array<any> = [];
		for (const about of abouts)
		{
			// If not the "settings" shortcut-file (the only about with a blank filename)
			if (about.filename)
			{
				// Add help only for shortcut-files that contain non-hidden shortcuts
				if (about.shortcutAbouts.length === 0) { continue; }
				// Make "help" shortcut for this shortcut-file
				makeHelpShortcut(about.filename, about.fileAbout);
				// Make "ref" shortcut for this shortcut-file
				makeRefShortcut(about.filename, about.shortcutAbouts);
				// Add to "ref all" list: reference of ALL shortcuts
				shortcutFileAbouts = shortcutFileAbouts.concat(about.shortcutAbouts);
			}
			else if (about.shortcutAbouts.length > 0)
			{
				// Add to "ref all" list: reference of ALL shortcuts
				settingsAbouts = about.shortcutAbouts;
			}
		}

		// Create "ref all" shortcut: expands to a reference for ALL shortcuts
		makeRefShortcut("all", settingsAbouts.concat(shortcutFileAbouts), "All shortcuts");

		// Create "ref settings" shortcut: expands to a reference for shortcuts defined in settings
		makeRefShortcut("settings", settingsAbouts);

		// Reversing ensures that "ref all" and "ref settings" aren't superseded by a poorly named
		// shortcut-file
		result.reverse();

		// Return list of help shortcuts we just generated
		return result;
	}
}
