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
    /** JSON fields confirmed available in the local gh binary */
    jsonFields: string[];
}
export declare function buildToolDefinitions(): Promise<ToolDefinition[]>;
/** Builds the gh args array for direct spawn — no shell string, no injection surface. */
export declare function buildGhArgs(tool: ToolDefinition, args: Record<string, unknown>): string[];
//# sourceMappingURL=schema.d.ts.map