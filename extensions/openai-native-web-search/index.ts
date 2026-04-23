import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

const TOOL_NAME = "web_search";
const TOOL_PARAMETERS = Type.Object({}, { additionalProperties: false });

type FunctionToolPayload = {
  type?: unknown;
  name?: unknown;
};

type ProviderPayload = {
  tools?: unknown[];
  [key: string]: unknown;
};

const supportsNativeWebSearch = (model: ExtensionContext["model"]): boolean => {
  return model?.provider === "openai-codex";
};

const isSyntheticWebSearchTool = (tool: unknown): tool is FunctionToolPayload => {
  return !!tool && typeof tool === "object" && (tool as FunctionToolPayload).type === "function" && (tool as FunctionToolPayload).name === TOOL_NAME;
};

const syncToolActivation = (pi: ExtensionAPI, ctx: ExtensionContext): void => {
  const activeTools = pi.getActiveTools();
  const hasTool = activeTools.includes(TOOL_NAME);

  if (supportsNativeWebSearch(ctx.model)) {
    if (!hasTool) {
      pi.setActiveTools([...activeTools, TOOL_NAME]);
    }
    return;
  }

  if (hasTool) {
    pi.setActiveTools(activeTools.filter((name) => name !== TOOL_NAME));
  }
};

export default function openaiNativeWebSearch(pi: ExtensionAPI) {
  pi.registerTool({
    name: TOOL_NAME,
    label: TOOL_NAME,
    description:
      "Search the web for up-to-date external information relevant to the current task. Available only on the openai-codex provider.",
    promptSnippet:
      "Search the web for up-to-date external information relevant to the current task.",
    promptGuidelines: [
      "Use web_search when the task needs current external information or sources beyond the workspace.",
    ],
    parameters: TOOL_PARAMETERS,
    prepareArguments: () => ({}),
    async execute() {
      throw new Error("web_search is native on openai-codex and should not execute locally");
    },
  });

  pi.on("session_start", async (_event, ctx) => {
    syncToolActivation(pi, ctx);
  });

  pi.on("session_switch", async (_event, ctx) => {
    syncToolActivation(pi, ctx);
  });

  pi.on("model_select", async (_event, ctx) => {
    syncToolActivation(pi, ctx);
  });

  pi.on("before_provider_request", (event, ctx) => {
    if (!supportsNativeWebSearch(ctx.model)) {
      return undefined;
    }

    if (!event.payload || typeof event.payload !== "object") {
      return undefined;
    }

    const tools = (event.payload as ProviderPayload).tools;
    if (!Array.isArray(tools)) {
      return undefined;
    }

    let rewritten = false;
    const rewrittenTools = tools.map((tool) => {
      if (!isSyntheticWebSearchTool(tool)) {
        return tool;
      }

      rewritten = true;
      return {
        type: "web_search",
        external_web_access: true,
      };
    });

    if (!rewritten) {
      return undefined;
    }

    return {
      ...(event.payload as ProviderPayload),
      tools: rewrittenTools,
    };
  });
}
