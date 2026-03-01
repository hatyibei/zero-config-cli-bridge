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
}
export declare function getToolDefinitions(): ToolDefinition[];
export declare function buildGhCommand(toolName: string, args: Record<string, unknown>): string;
//# sourceMappingURL=schema.d.ts.map