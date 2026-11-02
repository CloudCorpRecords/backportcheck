/**
 * backportcheck MCP server. Tools: check_backport.
 *
 * Why the low-level Server instead of McpServer: the high-level
 * helper converts zod schemas to JSON Schema and injects keys
 * not in this tool's defined spec ("$schema" and
 * "additionalProperties"), which breaks exact tool-list/schema
 * parity with the spec. This file serves tools/list with the
 * spec's exact input schema as an explicit literal, and every
 * tools/call is validated by the core, which names the
 * offending path on invalid input.
 *
 * The computation is pure and local: no upstream API, no
 * authentication, no configuration, and no repository is
 * touched — the tool only decides a backport plan.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { checkBackport, formatPayload, VERSION } from "./backportcheck.js";

const TOOLS = [
  {
    name: "check_backport",
    description:
      "Decide whether a fix needs a backport: filter the release branches to the supported ones older than the fix version and at or after the version that introduced the bug, then assign each an action by severity.",
    inputSchema: {
      type: "object" as const,
      properties: {
        fix_version: {
          type: "string",
          description: "Version the fix lands in, as x.y.z",
        },
        severity: {
          type: "string",
          description: "Severity of the fix",
          enum: ["critical", "major", "minor"],
        },
        branches: {
          type: "array",
          description: "Release branches: {name, version, supported}",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              version: { type: "string" },
              supported: { type: "boolean" },
            },
            required: ["name", "version", "supported"],
          },
        },
        introduced_in: {
          type: "string",
          description: "Version that introduced the bug, as x.y.z (optional)",
        },
      },
      required: ["fix_version", "severity", "branches"],
    },
  },
];

function textResult(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: typeof value === "string" ? value : JSON.stringify(value, null, 2),
      },
    ],
  };
}

function errorResult(err: unknown) {
  return {
    content: [
      { type: "text" as const, text: err instanceof Error ? err.message : String(err) },
    ],
    isError: true,
  };
}

const server = new Server(
  { name: "backportcheck", version: VERSION },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    let out: unknown;
    if (name === "check_backport") {
      out = checkBackport(args ?? {});
    } else {
      throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }
    return textResult(formatPayload(out));
  } catch (err) {
    if (err instanceof McpError) throw err;
    return errorResult(err);
  }
});

async function main(): Promise<void> {
  await server.connect(new StdioServerTransport());
}

void main();
