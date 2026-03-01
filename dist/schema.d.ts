import type { OperationTier } from './security.js';
export interface ToolDefinition {
    name: string;
    description: string;
    inputSchema: {
        type: 'object';
        properties: Record<string, {
            type: string;
            description: string;
        }>;
        required?: string[];
    };
    subcommand: string[];
    tier: OperationTier;
    /** For read (Tier 0) tools: --json fields to request */
    jsonFields?: string[];
}
export declare function buildToolDefinitions(): ToolDefinition[];
/**
 * Builds the gh args array using --flag=value notation throughout.
 * Prevents option injection: a value starting with '-' cannot be
 * misinterpreted as a separate flag by gh's argument parser.
 */
export declare function buildGhArgs(tool: ToolDefinition, args: Record<string, unknown>): string[];
/** Human-readable preview of the command an agent intends to execute */
export declare function buildCommandPreview(tool: ToolDefinition, args: Record<string, unknown>): string;
//# sourceMappingURL=schema.d.ts.map