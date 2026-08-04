import { basename } from "node:path";

import type { AssistantMessage } from "@earendil-works/pi-ai";
import { CustomEditor, type ExtensionAPI, type Theme } from "@earendil-works/pi-coding-agent";
import type { Component, TUI } from "@earendil-works/pi-tui";
import { truncateToWidth } from "@earendil-works/pi-tui";

import { registerCompactTools } from "./tools.js";

const unsafeTerminalCharacters = /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g;
const sanitize = (text: string): string => text.replace(unsafeTerminalCharacters, "");

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const SPINNER_INTERVAL_MS = 80;

const formatCost = (cost: number): string => (cost < 0.01 ? cost.toFixed(3) : cost.toFixed(2));

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

		const redraw = () => tui?.requestRender();

		const startSpinner = () => {
			working = true;
			spinnerFrame = 0;
			if (spinnerTimer) clearInterval(spinnerTimer);
			spinnerTimer = setInterval(() => {
				spinnerFrame = (spinnerFrame + 1) % SPINNER_FRAMES.length;
				redraw();
			}, SPINNER_INTERVAL_MS);
		};

		const stopSpinner = () => {
			working = false;
			if (spinnerTimer) clearInterval(spinnerTimer);
			spinnerTimer = undefined;
		};

		ctx.ui.setFooter((instance, footerTheme, footerData) => {
			tui = instance;
			theme = footerTheme;
			const unsubscribe = footerData.onBranchChange(() => redraw());

			return {
				dispose: unsubscribe,
				invalidate() {},
				render(width: number): string[] {
					if (!theme) return [];

					let totalCost = 0;
					for (const entry of ctx.sessionManager.getEntries()) {
						if (entry.type !== "message" || entry.message.role !== "assistant") continue;
						const message = entry.message as AssistantMessage;
						totalCost += message.usage?.cost?.total ?? 0;
					}

					const branch = footerData.getGitBranch();
					const directory = theme.fg("success", sanitize(basename(ctx.cwd)));
					const git = branch ? ` (${theme.fg("accent", sanitize(branch))})` : "";

					const modelId = sanitize(ctx.model?.id ?? "no model");
					const thinking = pi.getThinkingLevel();
					const model = theme.fg("muted", `${modelId} · ${thinking}`);

					const percent = ctx.getContextUsage()?.percent;
					const contextLabel =
						percent === null || percent === undefined ? "" : theme.fg("muted", `${Math.round(Math.max(0, Math.min(100, percent)))}%`);

					const usingSubscription = ctx.model ? ctx.modelRegistry.isUsingOAuth(ctx.model) : false;
					const cost =
						totalCost || usingSubscription
							? theme.fg("muted", `$${formatCost(totalCost)}${usingSubscription ? " (sub)" : ""}`)
							: "";

					const counts = [
						succeeded > 0 ? theme.fg("success", `✓${succeeded}`) : "",
						failed > 0 ? theme.fg("error", `✕${failed}`) : "",
					]
						.filter(Boolean)
						.join(" ");

					const spinner = working ? theme.fg("accent", SPINNER_FRAMES[spinnerFrame] ?? "") : "";

					const parts = [model, contextLabel, cost, counts, spinner].filter(Boolean).join(theme.fg("muted", " · "));
					const line = `${directory}${git} ${parts}`;
					return [truncateToWidth(line, width, "…")];
				},
			};
		});

		ctx.ui.setEditorComponent((instance, editorTheme, keybindings) => {
			tui = instance;
			if (clearOnEditorMount) {
				clearOnEditorMount = false;
				instance.terminal.clearScreen();
				instance.requestRender(true);
			}
			return new CustomEditor(instance, editorTheme, keybindings, { paddingX: 2 });
		});

		pi.on("agent_start", () => {
			ctx.ui.setWorkingVisible(false);
			succeeded = 0;
			failed = 0;
			startSpinner();
			redraw();
		});

		pi.on("tool_execution_end", (toolEvent) => {
			if (toolEvent.isError) failed++;
			else succeeded++;
			redraw();
		});

		pi.on("agent_end", () => {
			stopSpinner();
			redraw();
		});

		pi.on("session_shutdown", () => {
			stopSpinner();
			ctx.ui.setFooter(undefined);
			ctx.ui.setEditorComponent(undefined);
			tui = undefined;
			theme = undefined;
		});
	});
}
