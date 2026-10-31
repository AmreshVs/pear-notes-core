/** "1h 52m" → 112 and "45 min" → 45; null when it isn't a duration. */
export function durationToMinutes(text: any): number;
/** Evaluates + - * / % and brackets; `12%` alone means 0.12. No eval(). */
export function calculate(expression: any): number;
/**
 * Adds to a date or time, or measures between two. `start` and `end` are
 * YYYY-MM-DD, YYYY-MM-DD HH:MM, HH:MM or "today"; `duration` is like 2h 38m.
 *
 * @param {{ start?: string, end?: string, add_days?: number, add_weeks?: number, add_hours?: number, add_minutes?: number, duration?: string }} [args]
 * @param {number} [now]
 */
export function dateMath({ start, end, add_days, add_weeks, add_hours, add_minutes, duration }?: {
    start?: string;
    end?: string;
    add_days?: number;
    add_weeks?: number;
    add_hours?: number;
    add_minutes?: number;
    duration?: string;
}, now?: number): {
    days: number;
    hours: number;
    minutes: number;
    text: string;
    result?: undefined;
} | {
    result: string;
    days?: undefined;
    hours?: undefined;
    minutes?: undefined;
    text?: undefined;
};
/** @param {{ value?: number, from?: string, to?: string }} [args] */
export function convertUnits({ value, from, to }?: {
    value?: number;
    from?: string;
    to?: string;
}): {
    result: number;
    unit: string;
};
export const VAULT_TOOL: Readonly<{
    SEARCH: "search_notes";
    GET_NOTE: "get_note";
    CALC: "calc";
    DATE_MATH: "date_math";
    CONVERT: "convert_units";
    CREATE_NOTE: "create_note";
    APPEND: "append_to_note";
    ADD_TASK: "add_task";
}>;
export const VAULT_WRITE_TOOLS: Set<"create_note" | "append_to_note" | "add_task">;
export const VAULT_TOOLS: {
    type: string;
    name: any;
    description: any;
    parameters: {
        type: string;
        properties: any;
        required: any[];
    };
}[];
//# sourceMappingURL=localAiVaultTools.d.ts.map