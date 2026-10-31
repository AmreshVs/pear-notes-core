export function enterVaultInPlace(): Generator<import("redux-saga/effects").PutEffect<{
    payload: undefined;
    type: "ui/clear-vault-state";
}> | import("redux-saga/effects").PutEffect<{
    payload: undefined;
    type: "ui/init-app";
}> | import("redux-saga/effects").PutEffect<{
    payload: undefined;
    type: "vaults/vaultEntered";
}>, void, unknown>;
export function watchVaultsSaga(): Generator<import("redux-saga/effects").ForkEffect<never>, void, unknown>;
//# sourceMappingURL=vaultsSaga.d.ts.map