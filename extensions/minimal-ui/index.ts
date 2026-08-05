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

const MIN_CONTENT_LINES = 3;

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
		for (let i = 1; i < bottomIndex; i++) {
			lines.push(`${side}${inner[i]}${side}`);
		}
		const blank = `${side}${" ".repeat(width - 2)}${side}`;
		for (let i = bottomIndex - 1; i < MIN_CONTENT_LINES; i++) {
			lines.push(blank);
		}
		lines.push(this.buildBorder(width, "╰", "╯", bottomLeft, labels.bottomRight));
		for (let i = bottomIndex + 1; i < inner.length; i++) {
			lines.push(`${side}${inner[i]}${side}`);
		}
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

class BottomAnchor {
	private height = 0;

	constructor(private readonly tui: TUI) {}

	render(): string[] {
		const rows = this.tui.terminal.rows;
		const previous = (this.tui as { previousLines?: unknown }).previousLines;
		const others = Array.isArray(previous) ? previous.length - this.height : 0;
		this.height = Math.max(0, rows - others);
		return Array.from({ length: this.height }, () => "");
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

		const redraw = () => tui?.requestRender();

		const getLabels = (): EditorLabels => {
			if (!theme) return {};
			const level = sanitize(pi.getThinkingLevel());
			const path = theme.fg("muted", sanitize(shortenHome(ctx.cwd)));
			const git = branch ? theme.fg("accent", ` (${sanitize(branch)})`) : "";
			const model = theme.fg("muted", sanitize(ctx.model?.id ?? "no model"));
			const usage = ctx.getContextUsage();
			const context = usage?.percent != null ? theme.fg("muted", ` · ${Math.round(usage.percent)}%`) : "";
			return {
				bottomLeft: working ? theme.fg("accent", SPINNER_FRAMES[spinnerFrame] ?? "") : undefined,
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

		ctx.ui.setWidget("bottom-anchor", (instance) => new BottomAnchor(instance), { placement: "aboveEditor" });

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
			startSpinner();
			redraw();
		});

		pi.on("agent_end", () => {
			stopSpinner();
			redraw();
		});

		pi.on("thinking_level_select", redraw);
		pi.on("model_select", redraw);
		pi.on("message_end", redraw);

		pi.on("session_shutdown", () => {
			stopSpinner();
			ctx.ui.setWidget("bottom-anchor", undefined);
			ctx.ui.setFooter(undefined);
			ctx.ui.setEditorComponent(undefined);
			tui = undefined;
			theme = undefined;
		});
	});
}
