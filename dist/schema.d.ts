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
    /** gh subcommand tokens, e.g. ['issue', 'list'] */
    subcommand: string[];
    /** JSON fields confirmed available in the local gh binary, filtered to repo-scope-safe set */
    jsonFields: string[];
}
export declare function buildToolDefinitions(): Promise<ToolDefinition[]>;
/**
 * Builds the gh args array using --flag=value notation throughout.
 * This prevents option injection: a value starting with '-' cannot
 * be misinterpreted as a separate flag by gh's argument parser.
 */
export declare function buildGhArgs(tool: ToolDefinition, args: Record<string, unknown>): string[];
//# sourceMappingURL=schema.d.ts.map