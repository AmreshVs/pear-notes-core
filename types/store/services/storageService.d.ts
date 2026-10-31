export namespace themeStorage {
    function load(): string;
    function save(theme: any): boolean;
    function apply(theme: any): void;
}
export function resolveTheme(theme: any): any;
export namespace settingsStorage {
    export function load_1(): any;
    export { load_1 as load };
    export function save_1(settings: any): boolean;
    export { save_1 as save };
}
export namespace foldersStorage {
    export function load_2(): any;
    export { load_2 as load };
    export function save_2(folders: any): boolean;
    export { save_2 as save };
}
//# sourceMappingURL=storageService.d.ts.map