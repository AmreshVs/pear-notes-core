export function createApply({ onNode, onDeviceRemoved, onSealedSaveRejected }?: {
    onNode?: () => void;
    onDeviceRemoved?: () => void;
    onSealedSaveRejected?: () => void;
}): (nodes: any, view: any, host: any) => Promise<void>;
//# sourceMappingURL=apply.d.ts.map