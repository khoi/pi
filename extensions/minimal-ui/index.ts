import { homedir } from "node:os";

import { CustomEditor, type ExtensionAPI, type Theme } from "@earendil-works/pi-coding-agent";
import type { Component, TUI } from "@earendil-works/pi-tui";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

import { registerCompactTools } from "./tools.js";

const unsafeTerminalCharacters = /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g;
const sanitize = (text: string): string => text.replace(unsafeTerminalCharacters, "");

const ANSI_PATTERN = /\x1b\[[0-9;]*m/g;

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const SPINNER_INTERVAL_MS = 80;

type FgColor = Parameters<Theme["fg"]>[0];

const THINKING_COLORS: Record<string, FgColor> = {
	off: "thinkingOff",
	minimal: "thinkingMinimal",
	low: "thinkingLow",
	medium: "thinkingMedium",
	high: "thinkingHigh",
	xhigh: "thinkingXhigh",
	max: "thinkingMax",
};

interface EditorLabels {
	topRight?: string;
	bottomLeft?: string;
	bottomRight?: string;
}

const isBorderLine = (line: string): boolean => {
	const plain = line.replace(ANSI_PATTERN, "");
	return /^─+$/.test(plain) || /^─+ [↑↓] \d+ more ─+$/.test(plain);
};

const scrollHint = (line: string | undefined): string | undefined => {
	if (!line) return undefined;
	return line.replace(ANSI_PATTERN, "").match(/[↑↓] \d+ more/)?.[0];
};

const shortenHome = (path: string): string => {
	const home = homedir();
	if (path === home) return "~";
	return path.startsWith(`${home}/`) ? `~${path.slice(home.length)}` : path;
};

class BoxedEditor extends CustomEditor {
	labels: () => EditorLabels = () => ({});

	render(width: number): string[] {
		if (width < 8) return super.render(width);
		const inner = super.render(width - 2);
		const labels = this.labels();

		let bottomIndex = inner.length - 1;
		if (this.isShowingAutocomplete()) {
			const found = inner.findLastIndex(isBorderLine);
			if (found > 0) bottomIndex = found;
		}

		const topHint = scrollHint(inner[0]);
		const bottomHint = bottomIndex > 0 ? scrollHint(inner[bottomIndex]) : undefined;
		const topLeft = topHint ? this.borderColor(topHint) : undefined;
		const bottomLeft =
			[labels.bottomLeft, bottomHint ? this.borderColor(bottomHint) : ""].filter(Boolean).join(" ") ||
			undefined;

		const side = this.borderColor("│");
		const lines: string[] = [this.buildBorder(width, "╭", "╮", topLeft, labels.topRight)];
		for (let i = 1; i < inner.length; i++) {
			if (i === bottomIndex) continue;
			lines.push(`${side}${inner[i]}${side}`);
		}
		lines.push(this.buildBorder(width, "╰", "╯", bottomLeft, labels.bottomRight));
		return lines;
	}

	private buildBorder(width: number, left: string, right: string, leftLabel?: string, rightLabel?: string): string {
		let leftWidth = leftLabel ? visibleWidth(leftLabel) + 3 : 0;
		let rightWidth = rightLabel ? visibleWidth(rightLabel) + 3 : 0;
		if (width - 2 - leftWidth - rightWidth < 1 && rightLabel) {
			rightLabel = truncateToWidth(rightLabel, Math.max(1, width - 6 - leftWidth), "…");
			rightWidth = visibleWidth(rightLabel) + 3;
		}
		if (width - 2 - leftWidth - rightWidth < 1 && leftLabel) {
			leftLabel = truncateToWidth(leftLabel, Math.max(1, width - 6 - rightWidth), "…");
			leftWidth = visibleWidth(leftLabel) + 3;
		}
		const fill = "─".repeat(Math.max(0, width - 2 - leftWidth - rightWidth));
		return (
			this.borderColor(left + (leftLabel ? "─" : "")) +
			(leftLabel ? ` ${leftLabel} ` : "") +
			this.borderColor(fill) +
			(rightLabel ? ` ${rightLabel} ` : "") +
			this.borderColor((rightLabel ? "─" : "") + right)
		);
	}
}

class EmptyFooter implements Component {
	render(): string[] {
		return [];
	}

	invalidate(): void {}
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
		let branch: string | undefined;
		let streamStartTime: number | undefined;
		let streamChars = 0;

		const redraw = () => tui?.requestRender();

		const getLabels = (): EditorLabels => {
			if (!theme) return {};
			const level = sanitize(pi.getThinkingLevel());
			const path = theme.fg("muted", sanitize(shortenHome(ctx.cwd)));
			const git = branch ? theme.fg("accent", ` (${sanitize(branch)})`) : "";
			const modelId = ctx.model?.id.split("/").at(-1) ?? "no model";
			const model = theme.fg("muted", sanitize(modelId));
			const usage = ctx.getContextUsage();
			const context = usage?.percent != null ? theme.fg("muted", ` · ${Math.round(usage.percent)}%`) : "";

			let left: string | undefined;
			if (working) {
				let label = SPINNER_FRAMES[spinnerFrame] ?? "";
				if (streamStartTime && streamChars > 0) {
					const elapsed = (Date.now() - streamStartTime) / 1000;
					if (elapsed > 0.5) {
						const tokens = streamChars * 0.35;
						const tps = tokens / elapsed;
						label += ` ${tps.toFixed(1)} nt/s`;
					}
				}
				left = theme.fg("accent", label);
			}

			return {
				bottomLeft: left,
				topRight: `${model} · ${theme.fg(THINKING_COLORS[level] ?? "muted", level)}${context}`,
				bottomRight: path + git,
			};
		};

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
			branch = footerData.getGitBranch() ?? undefined;
			const unsubscribe = footerData.onBranchChange(() => {
				branch = footerData.getGitBranch() ?? undefined;
				redraw();
			});
			return Object.assign(new EmptyFooter(), {
				dispose() {
					unsubscribe();
				},
			});
		});

		ctx.ui.setEditorComponent((instance, editorTheme, keybindings) => {
			tui = instance;
			if (clearOnEditorMount) {
				clearOnEditorMount = false;
				instance.terminal.clearScreen();
				instance.requestRender(true);
			}
			const editor = new BoxedEditor(instance, editorTheme, keybindings, { paddingX: 2 });
			editor.labels = getLabels;
			return editor;
		});

		pi.on("agent_start", () => {
			ctx.ui.setWorkingVisible(false);
			streamStartTime = Date.now();
			streamChars = 0;
			startSpinner();
			redraw();
		});

		pi.on("message_update", (event) => {
			const e = event.assistantMessageEvent;
			if ("delta" in e && typeof e.delta === "string") {
				streamChars += e.delta.length;
				redraw();
			}
		});

		pi.on("agent_end", () => {
			stopSpinner();
			streamStartTime = undefined;
			streamChars = 0;
			redraw();
		});

		pi.on("thinking_level_select", redraw);
		pi.on("model_select", redraw);
		pi.on("message_end", redraw);

		pi.on("session_shutdown", () => {
			stopSpinner();
			streamStartTime = undefined;
			streamChars = 0;
			ctx.ui.setFooter(undefined);
			ctx.ui.setEditorComponent(undefined);
			tui = undefined;
			theme = undefined;
		});
	});
}
