///////////////////////////////////////////////////////////////////////////////
// Popups - Provides functionality for alert, confirm, input and pick popups //
///////////////////////////////////////////////////////////////////////////////

"use strict";

class Popups
{
	public static initialize(plugin: TextExpanderJsPlugin)
	{
		Popups._instance = new Popups(plugin);
	}
	
	public static getInstance(): Popups
	{
		return Popups._instance;
	}
	
	public async alert(message: string): Promise<void>
	{
		await this.alert_internal(message);
	}

	public async confirm(message: string): Promise<boolean>
	{
		return await this.confirm_internal(message);
	}

	public async input(message: string, defaultValue?: string): Promise<string>
	{
		return await this.input_internal(message, defaultValue);
	}

	public async pick(
		message: string, options: Array<string>, defaultValue?: number, optionValues?: Array<any>)
		: Promise<any>
	{
		return await this.pick_internal(message, options, defaultValue, optionValues);
	}

///////////////////////////////////////////////////////////////////////////////////////////////////

	private static _instance: Popups;

	private _app: any;
	
	private constructor(plugin: TextExpanderJsPlugin)
	{
		this._app = plugin.app;
	}

	private async alert_internal(message: string): Promise<void>
	{
		return await new Promise((resolve, reject) =>
		{
			new AlertDialogBox(
				this._app, message, () => resolve()
			).open();
		});
	}

	private async confirm_internal(message: string): Promise<boolean>
	{
		return await new Promise((resolve, reject) =>
		{
			new ConfirmDialogBox(
				this._app, message, (result: boolean) => resolve(result)
			).open();
		});
	}

	public async input_internal(message: string, defaultValue?: string) : Promise<string>
	{
		return await new Promise((resolve, reject) =>
		{
			new InputDialogBox(
				this._app, message, defaultValue,
				(result: any) => resolve(result)
			).open();
		});
	}
	
	public async pick_internal(
		message: string, options: Array<string>, defaultValue?: number, optionValues?: Array<any>)
		: Promise<any>
	{
		return await new Promise((resolve, reject) =>
		{
			new PickDialogBox(
				this._app, message, options, defaultValue, optionValues,
				(result: any) => resolve(result)
			).open();
		});
	}
}

///////////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////

class AlertDialogBox extends obsidian.Modal
{
	public constructor(app: any, message: string, callback: Function)
	{
		super(app);
		this._message = message;
		this._callback = callback;
		this.modalEl.classList.add("tejs_popup");
	}

	public onOpen()
	{
		const messageLines = this._message.split("\n");
		for (const line of messageLines)
		{
			this.titleEl.createEl("div", { text: line });
		}

		new obsidian.Setting(this.contentEl)
			.addButton((button: any) =>
			{
				button
					.setButtonText("Ok")
					.onClick(() =>
					{
						this.close();
					})
			})
			.settingEl.style.padding = "0";
	}

	public onClose()
	{
		this.contentEl.empty();
		this._callback();
	}

	private _message: string;
	private _callback: Function;
}

///////////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////

class ConfirmDialogBox extends obsidian.Modal
{
	public constructor(app: any, message: string, callback: Function)
	{
		super(app);
		this._message = message;
		this._callback = callback;
		this._value = null;
		this.modalEl.classList.add("tejs_popup");
	}

	public onOpen()
	{
		const messageLines = this._message.split("\n");
		for (const line of messageLines)
		{
			this.titleEl.createEl("div", { text: line });
		}

		new obsidian.Setting(this.contentEl)
			.addButton((button: any) =>
			{
				button
					.setButtonText("Confirm")
					.onClick(() =>
					{
						this._value = true;
						this.close();
					})
			})
			.addButton((button: any) =>
			{
				button
					.setButtonText("Cancel")
					.onClick(() =>
					{
						this._value = false;
						this.close();
					})
			})
			.settingEl.style.padding = "0";
	}

	public onClose()
	{
		this.contentEl.empty();
		this._callback(this._value);
	}

	private _message: string;
	private _callback: Function;
	private _value: boolean;
}

///////////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////

class InputDialogBox extends obsidian.Modal
{
	public constructor(app: any, message: string, defaultValue: string, callback: Function)
	{
		super(app);
		this._message = message;
		this._callback = callback;
		this._value = defaultValue;
		this.modalEl.classList.add("tejs_popup");
	}

	public onOpen()
	{
		const messageLines = this._message.split("\n");
		for (const line of messageLines)
		{
			this.titleEl.createEl("div", { text: line });
		}

		new obsidian.Setting(this.contentEl)
			.addText((text: any) =>
			{
				text.setValue(this._value);
				text.inputEl.parentElement.previousSibling.remove();
				text.inputEl.classList.add("tejs_soloControl");
				this._control = text;
				this._value = null;
			})

		new obsidian.Setting(this.contentEl)
			.addButton((button: any) =>
			{
				button
					.setButtonText("Ok")
					.onClick(() =>
					{
						this._value = this._control.getValue();
						this.close();
					});
			})
			.addButton((button: any) =>
			{
				button
					.setButtonText("Cancel")
					.onClick(() =>
					{
						this.close();
					});
			})
			.settingEl.style.padding = "0";
	}

	public onClose()
	{
		this._callback(this._value);
		this.contentEl.empty();
	}

	private _message: string;
	private _callback: Function;
	private _value: string;
	private _control: any;
}

///////////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////

class PickDialogBox extends obsidian.Modal
{
	public constructor(
		app: any, message: string, options: Array<string>, defaultValue: number,
		optionValues: Array<any>, callback: Function)
	{
		super(app);
		this._message = message;
		this._options = options;
		this._value = Number(defaultValue) || 1;
		this._optionValues = optionValues;
		this._callback = callback;
		this.modalEl.classList.add("tejs_popup");
	}

	public onOpen()
	{
		const messageLines = this._message.split("\n");
		for (const line of messageLines)
		{
			this.titleEl.createEl("div", { text: line });
		}

		new obsidian.Setting(this.contentEl)
			.addDropdown((dropdown: any) =>
			{
				dropdown
					.addOptions(this._options)
					.setValue(this._value - 1)
				dropdown.selectEl.parentElement.previousSibling.remove();
				dropdown.selectEl.classList.add("tejs_soloControl");
				this._control = dropdown;
				this._value = null;
			});

		new obsidian.Setting(this.contentEl)
			.addButton((button: any) =>
			{
				button
					.setButtonText("Ok")
					.onClick(() =>
					{
						this._value = Number(this._control.getValue());
						this.close();
					});
			})
			.addButton((button: any) =>
			{
				button
					.setButtonText("Cancel")
					.setCta()
					.onClick(() =>
					{
						this.close();
					});
			})
			.settingEl.style.padding = "0";
	}

	public onClose()
	{
		if (this._value === null)
		{
			this._callback(this._value);
		}
		else if (this._optionValues)
		{
			this._callback(this._optionValues[this._value]);
		}
		else
		{
			this._callback(this._value + 1);
		}
		this.contentEl.empty();
	}

	private _message: string;
	private _options: Array<string>;
	private _value: number;
	private _optionValues: Array<any>;
	private _callback: Function;
	private _control: any;
}
