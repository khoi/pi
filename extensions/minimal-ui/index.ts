import { basename } from "node:path";

import { CustomEditor, type ExtensionAPI, type KeybindingsManager, type Theme } from "@earendil-works/pi-coding-agent";
import type { Component, EditorTheme, TUI } from "@earendil-works/pi-tui";
import { truncateToWidth } from "@earendil-works/pi-tui";

import { registerCompactTools } from "./tools.js";

const unsafeTerminalCharacters = /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g;
const sanitize = (text: string): string => text.replace(unsafeTerminalCharacters, "");

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const SPINNER_INTERVAL_MS = 80;

class StatusLine implements Component {
	private text = "";

	setText(text: string): void {
		this.text = text;
	}

	render(width: number): string[] {
		return width > 0 ? [truncateToWidth(this.text, width, "…")] : [];
	}

	invalidate(): void {}
}

class EmptyFooter implements Component {
	render(): string[] {
		return [];
	}

	invalidate(): void {}
}

class PromptEditor extends CustomEditor {
	constructor(
		tui: TUI,
		theme: EditorTheme,
		keybindings: KeybindingsManager,
		private promptColor: (str: string) => string,
	) {
		super(tui, theme, keybindings, { paddingX: 2 });
	}

	override render(width: number): string[] {
		const lines = super.render(width);
		const paddingX = this.getPaddingX();
		let prompted = false;
		return lines.map((line) => {
			if (prompted || !line.startsWith(" ".repeat(paddingX))) return line;
			prompted = true;
			return this.promptColor(">") + line.slice(1);
		});
	}
}

export default function minimalUi(pi: ExtensionAPI) {
	registerCompactTools(pi);

	pi.on("session_start", (event, ctx) => {
		if (ctx.mode !== "tui") return;

		let clearOnEditorMount = event.reason === "startup";

		let tui: TUI | undefined;
		let theme: Theme | undefined;
		let spinnerTimer: ReturnType<typeof setInterval> | undefined;
		let spinnerFrame = 0;
		let working = false;
		let succeeded = 0;
		let failed = 0;
		let branch: string | undefined;

		const status = new StatusLine();
		const model = new StatusLine();

		const redraw = () => tui?.requestRender();

		const renderStatus = () => {
			if (!theme) return;
			const directory = theme.fg("success", sanitize(basename(ctx.cwd)));
			const git = branch ? ` (${theme.fg("accent", sanitize(branch))})` : "";
			const counts = [
				succeeded > 0 ? theme.fg("success", `✓${succeeded}`) : "",
				failed > 0 ? theme.fg("error", `✕${failed}`) : "",
			]
				.filter(Boolean)
				.join(" ");
			const spinner = working ? ` ${theme.fg("accent", SPINNER_FRAMES[spinnerFrame] ?? "")}` : "";
			status.setText(`${directory}${git}${counts ? ` ${counts}` : ""}${spinner}`);
		};

		const renderModel = () => {
			if (!theme) return;
			model.setText(theme.fg("muted", `${sanitize(ctx.model?.id ?? "no model")} · ${pi.getThinkingLevel()}`));
		};

		const startSpinner = () => {
			working = true;
			spinnerFrame = 0;
			if (spinnerTimer) clearInterval(spinnerTimer);
			spinnerTimer = setInterval(() => {
				spinnerFrame = (spinnerFrame + 1) % SPINNER_FRAMES.length;
				renderStatus();
				redraw();
			}, SPINNER_INTERVAL_MS);
		};

		const stopSpinner = () => {
			working = false;
			if (spinnerTimer) clearInterval(spinnerTimer);
			spinnerTimer = undefined;
		};

		ctx.ui.setFooter((_tui, _footerTheme, footerData) => {
			branch = footerData.getGitBranch() ?? undefined;
			renderStatus();
			const unsubscribe = footerData.onBranchChange(() => {
				branch = footerData.getGitBranch() ?? undefined;
				renderStatus();
				redraw();
			});
			return Object.assign(new EmptyFooter(), {
				dispose() {
					unsubscribe();
				},
			});
		});

		ctx.ui.setWidget(
			"minimal-status",
			(instance, widgetTheme) => {
				tui = instance;
				theme = widgetTheme;
				renderStatus();
				return status;
			},
			{ placement: "aboveEditor" },
		);

		ctx.ui.setWidget(
			"minimal-model",
			(instance, widgetTheme) => {
				tui = instance;
				theme = widgetTheme;
				renderModel();
				return model;
			},
			{ placement: "belowEditor" },
		);

		ctx.ui.setEditorComponent((instance, editorTheme, keybindings) => {
			tui = instance;
			if (clearOnEditorMount) {
				clearOnEditorMount = false;
				instance.terminal.clearScreen();
				instance.requestRender(true);
			}
			return new PromptEditor(instance, editorTheme, keybindings, (str) => editorTheme.borderColor(str));
		});

		pi.on("agent_start", () => {
			ctx.ui.setWorkingVisible(false);
			succeeded = 0;
			failed = 0;
			startSpinner();
			renderStatus();
			redraw();
		});

		pi.on("tool_execution_end", (event) => {
			if (event.isError) failed++;
			else succeeded++;
			renderStatus();
			redraw();
		});

		pi.on("agent_end", () => {
			stopSpinner();
			renderStatus();
			redraw();
		});

		pi.on("session_shutdown", () => {
			stopSpinner();
			ctx.ui.setWidget("minimal-status", undefined);
			ctx.ui.setWidget("minimal-model", undefined);
			ctx.ui.setFooter(undefined);
			ctx.ui.setEditorComponent(undefined);
			tui = undefined;
			theme = undefined;
		});
	});
}
