//////////////////////////////////////////////////////////////////////
// plugin - Class containing the main logic for this plugin project //
//////////////////////////////////////////////////////////////////////

"use strict";

// NOTE: The "Text Expander JS" plugin uses a custom format for shortcut-files.  I tried using
// existing formats (json, xml, etc), but they were cumbersome for developing javascript code in.
// The chosen format is simple, flexible, and allows for wrapping scripts in js-fenced-code-blocks.
// This makes it easy to write Expansion scripts within Obsidian which is the intended use-case.
// For a summary of the format, see here:
// https://github.com/jon-heard/obsidian-text-expander-js#tutorial-create-a-new-shortcut-file
// and here:
// https://github.com/jon-heard/obsidian-text-expander-js#development-aid-fenced-code-blocks

class TextExpanderJsPlugin extends obsidian.Plugin
{
	// Store the plugin's settings
	public settings: any;
	// Keep track of the suffix's final character
	public suffixEndCharacter: string;
	// Keep track of shutdown scripts for any shortcut-files that have them
	public shutdownScripts: any;
	// Keep a Dfc for shortcut-files.  This lets us monitor changes to them.
	public shortcutDfc: Dfc;
	// The master list of shortcuts: all registered shortcuts.  Referenced during expansion.
	public shortcuts: Array<any>;
	// The instance of the settings panel UI
	public settingsUi: TextExpanderJsPluginSettings;

	public onload(): void
	{
		this.onload_internal();
	}

	public onunload(): void
	{
		this.onunload_internal();
	}

	public saveSettings(): void
	{
		this.saveData(this.settings);
	}

	// Returns an array of the addresses for all shortcut-files that are registered and enabled
	public getActiveShortcutFileAddresses(): Array<string>
	{
		return this.settings.shortcutFiles.filter((f: any) => f.enabled).map((f: any) => f.address);
	}

	public static getInstance(): TextExpanderJsPlugin
	{
		return this._instance;
	}

	public static getDefaultSettings(): any
	{
		return this.getDefaultSettings_internal();
	}

///////////////////////////////////////////////////////////////////////////////////////////////////

	private _cm5_handleExpansionTrigger: any;
	private static _instance: TextExpanderJsPlugin;

	private async onload_internal(): Promise<void>
	{
		// Set this as THE instance
		TextExpanderJsPlugin._instance = this;

		// Load settings
		this.settings =
			Object.assign( {}, TextExpanderJsPlugin.getDefaultSettings(), await this.loadData() );

		// Now that settings are loaded, update variable for the suffix's final character
		this.suffixEndCharacter = this.settings.suffix.charAt(this.settings.suffix.length - 1);

		// Attach settings UI
		this.settingsUi = new TextExpanderJsPluginSettings(this);
		this.addSettingTab(this.settingsUi);

		// Initialize support objects
		ShortcutExpander.initialize();
		this.shortcutDfc = new Dfc(
			this.getActiveShortcutFileAddresses(), ShortcutLoader.getFunction_setupShortcuts(),
			this.onShortcutFileDisabled.bind(this), true);
		this.shortcutDfc.setMonitorType(
			this.settings.devMode ? DfcMonitorType.OnTouch : DfcMonitorType.OnModify);

		//Setup bound verson of this function for persistant use
		this._cm5_handleExpansionTrigger = this.cm5_handleExpansionTrigger.bind(this);

		// Connect "code mirror 5" instances to this plugin to trigger expansions
		this.registerCodeMirror( (cm: any) => cm.on("keydown", this._cm5_handleExpansionTrigger) );

		// Setup "code mirror 6" editor extension management to trigger expansions
		this.registerEditorExtension([
			require("@codemirror/state").EditorState.transactionFilter.of(
				this.cm6_handleExpansionTrigger.bind(this))
		]);

		// Track shutdown scripts in loaded shortcut-files to call when shortcut-file is unloaded.
		this.shutdownScripts = {};

		// Log that the plugin has loaded
		UserNotifier.run(
		{
			consoleMessage: "Loaded (" + this.manifest.version + ")",
			messageLevel: "info"
		});
	}

	private onunload_internal(): void
	{
		// Shutdown the shortcutDfc
		this.shortcutDfc.destructor();

		// Call all shutdown scripts of shortcut-files
		for (const filename in this.shutdownScripts)
		{
			this.onShortcutFileDisabled(filename);
		}

		// Disconnect "code mirror 5" instances from this plugin
		this.app.workspace.iterateCodeMirrors(
			(cm: any) => cm.off("keydown", this._cm5_handleExpansionTrigger));

		// Log that the plugin has unloaded
		UserNotifier.run(
		{
			consoleMessage: "Unloaded (" + this.manifest.version + ")",
			messageLevel: "info"
		});
	}

	// Call the given shortcut-file's shutdown script.
	// Note: This is called when shortcut-file is being disabled
	private onShortcutFileDisabled(filename: string): void
	{
		if (!this.shutdownScripts[filename]) { return; }
		ShortcutExpander.runExpansionScript(this.shutdownScripts[filename]);
		delete this.shutdownScripts[filename];
	}

	// CM5 callback for "keydown".  Used to kick off shortcut expansion attempt.
	private cm5_handleExpansionTrigger(cm: any, keydown: KeyboardEvent): void
	{
		if ((event as any)?.key === this.suffixEndCharacter)
		{
			this.tryShortcutExpansion();
		}
	}

	// CM6 callback for editor events.  Used to kick off shortcut expansion attempt.
	private cm6_handleExpansionTrigger(tr: any): any
	{
		// Only bother with key inputs that have changed the document
		if (!tr.isUserEvent("input.type") || !tr.docChanged) { return tr; }

		let shouldTryExpansion: boolean = false;

		// Iterate over each change made to the document
		tr.changes.iterChanges(
		(fromA: number, toA: number, fromB: number, toB: number, inserted: any) =>
		{
			// Only try expansion if the shortcut suffix's end character was hit
			if (inserted.text[0] === this.suffixEndCharacter)
			{
				shouldTryExpansion = true;
			}
		}, false);

		if (shouldTryExpansion)
		{
			this.tryShortcutExpansion();
		}

		return tr;
	}

	// Tries to get shortcut beneath caret and expand it.  setTimeout pauses for a frame to
	// give the calling event the opportunity to finish processing.  This is especially
	// important for CM5, as the typed key isn't in the editor until the calling event finishes.
	private tryShortcutExpansion(): void { setTimeout(() =>
	{
		const editor: any  = this.app.workspace.getActiveViewOfType(obsidian.MarkdownView)?.editor;
		if (!editor) { return; }

		// Find bounds of the shortcut beneath the caret (if there is one)
		const cursor: any = editor.getCursor();
		const lineText: string = editor.getLine(cursor.line);
		const prefixIndex: number = lineText.lastIndexOf(this.settings.prefix, cursor.ch);
		const suffixIndex: number = lineText.indexOf(
			this.settings.suffix, prefixIndex + this.settings.prefix.length);

		// If the caret is not at a shortcut, early-out
		if (prefixIndex === -1 || suffixIndex === -1 ||
		    (suffixIndex + this.settings.suffix.length) < cursor.ch)
		{
			return;
		}

		// Run the Expansion script on the shortcut under the caret
		const shortcutText: string =
			lineText.substring(prefixIndex + this.settings.prefix.length, suffixIndex);
		const expansionInfo: any =
		{
			isUserTriggered: true,
			line: lineText,
			inputStart: prefixIndex,
			inputEnd: suffixIndex + this.settings.suffix.length,
			shortcutText: shortcutText,
			prefix: this.settings.prefix,
			suffix: this.settings.suffix
		};
		let expansionText: string = ShortcutExpander.expand(shortcutText, false, expansionInfo);
		if (expansionText === null) { return; }

		// Handle a string array from the Expansion result
		if (Array.isArray(expansionText))
		{
			expansionText = expansionText.join("");
		}

		// Make sure we have a proper string
		expansionText = expansionText + "";

		// Replace written shortcut with Expansion result
		editor.replaceRange(
			expansionText,
			{ line: cursor.line, ch: prefixIndex },
			{ line: cursor.line, ch: suffixIndex + this.settings.suffix.length } );
	}, 0); }

	private static getDefaultSettings_internal(): any
	{
		let result = Object.assign({}, DEFAULT_SETTINGS);
		if (obsidian.Platform.isMobile)
		{
			result = Object.assign(result, DEFAULT_SUB_SETTINGS_MOBILE);
		}
		return result;
	}
}

module.exports = TextExpanderJsPlugin;
