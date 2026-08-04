import {
	createBashToolDefinition,
	type ExtensionAPI,
	type ExtensionContext,
	type ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { Type, type Static } from "typebox";

import { createPtyBashOperations, executePtyCommand } from "./pty/pty-execute.js";
import { ensureSpawnHelperExecutable } from "./pty/spawn-helper.js";

const bashPtyParams = Type.Object({
	command: Type.String({ description: "Bash command to execute" }),
	timeout: Type.Optional(Type.Number({ description: "Timeout in seconds (optional, no default timeout)" })),
	usePTY: Type.Optional(
		Type.Boolean({
			description:
				"Run inside a PTY with a live terminal widget visible while running. Use for programs with rich ANSI progress output, like build systems.",
		}),
	),
});

type BashPtyParams = typeof bashPtyParams;

export function createPtyBashToolDefinition(
	cwd: string,
): ToolDefinition<BashPtyParams, unknown, unknown> {
	const { renderCall: _renderCall, renderResult: _renderResult, ...original } = createBashToolDefinition(cwd);
	return {
		...original,
		description: `${original.description} Supports optional usePTY=true for a live PTY terminal view of terminal-style programs with rich progress output.`,
		parameters: bashPtyParams,
		async execute(toolCallId, params: Static<BashPtyParams>, signal, onUpdate, ctx) {
			if (params.usePTY === true && signal) {
				return executePtyCommand(toolCallId, params, signal, ctx);
			}
			return original.execute(toolCallId, params, signal, onUpdate, ctx);
		},
	};
}

export function registerUserBashPty(pi: ExtensionAPI): void {
	ensureSpawnHelperExecutable();
	pi.on("user_bash", (_event, ctx) => ({
		operations: createPtyBashOperations(ctx as ExtensionContext),
	}));
}
