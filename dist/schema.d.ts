/**
 * Schema definitions for exposed gh tools.
 *
 * Field list design:
 *   STATIC_FIELDS is the authoritative source of truth.
 *   It contains only fields that work with the standard `repo` OAuth scope
 *   and have been stable across gh major versions.
 *
 *   The probe (detectJsonFields) is NOT called at startup.
 *   Rationale: the probe has no reliability guarantee — gh's output format
 *   is human-readable and can change with any release. Running an unreliable
 *   subprocess at every server start adds latency and timeout risk for zero
 *   guaranteed gain. Static fields are the correct default.
 */
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
    jsonFields: string[];
}
export declare function buildToolDefinitions(): ToolDefinition[];
/**
 * Builds the gh args array using --flag=value notation throughout.
 * Prevents option injection: a value starting with '-' cannot be
 * misinterpreted as a separate flag by gh's argument parser.
 */
export declare function buildGhArgs(tool: ToolDefinition, args: Record<string, unknown>): string[];
//# sourceMappingURL=schema.d.ts.map