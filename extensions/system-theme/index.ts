import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const darkTheme = "zenbones-dark";
const lightTheme = "zenbones-light";
const pollIntervalMs = 2000;

const getThemeName = async (): Promise<string | undefined> => {
	if (process.platform !== "darwin") return undefined;

	try {
		const { stdout } = await execFileAsync("osascript", [
			"-e",
			'tell application "System Events" to tell appearance preferences to return dark mode',
		]);
		return stdout.trim() === "true" ? darkTheme : lightTheme;
	} catch {
		return undefined;
	}
};

export default function systemTheme(pi: ExtensionAPI) {
	let intervalId: ReturnType<typeof setInterval> | undefined;
	let currentTheme: string | undefined;

	const syncTheme = async (ctx: ExtensionContext): Promise<void> => {
		const nextTheme = await getThemeName();
		if (!nextTheme || nextTheme === currentTheme) return;
		const result = ctx.ui.setTheme(nextTheme);
		if (!result.success) return;
		currentTheme = nextTheme;
	};

	pi.on("session_start", async (_event, ctx) => {
		if (ctx.mode !== "tui") return;
		await syncTheme(ctx);

		if (intervalId) clearInterval(intervalId);
		intervalId = setInterval(() => {
			void syncTheme(ctx);
		}, pollIntervalMs);
	});

	pi.on("session_shutdown", () => {
		if (!intervalId) return;
		clearInterval(intervalId);
		intervalId = undefined;
		currentTheme = undefined;
	});
}
