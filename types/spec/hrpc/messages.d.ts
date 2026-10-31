export function resolveStruct(name: any, v?: number): {
    preencode(state: any, m: any): void;
    encode(state: any, m: any): void;
    decode(state: any): {};
};
export function getStruct(name: any, v?: number): {
    preencode(state: any, m: any): void;
    encode(state: any, m: any): void;
    decode(state: any): {};
};
export function getEnum(name: any): void;
export function getEncoding(name: any): {
    preencode(state: any, m: any): void;
    encode(state: any, m: any): void;
    decode(state: any): {};
};
export function encode(name: any, value: any, v?: number): any;
export function decode(name: any, buffer: any, v?: number): any;
export function setVersion(v: any): void;
export let version: number;
//# sourceMappingURL=messages.d.ts.map