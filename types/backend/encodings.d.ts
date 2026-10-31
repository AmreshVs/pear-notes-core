export namespace blobId {
    function preencode(state: any, b: any): void;
    function encode(state: any, b: any): void;
    function decode(state: any): {
        blockOffset: number;
        blockLength: number;
        byteOffset: number;
        byteLength: number;
    };
}
//# sourceMappingURL=encodings.d.ts.map