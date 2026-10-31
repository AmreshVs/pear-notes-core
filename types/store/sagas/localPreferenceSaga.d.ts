export function restoreSelectionsSaga(): Generator<import("redux-saga/effects").PutEffect<{
    payload: any;
    type: "notes/setSelectedNote";
}> | import("redux-saga/effects").PutEffect<{
    payload: any;
    type: "folders/setSelectedFolder";
}> | import("redux-saga/effects").AllEffect<import("redux-saga/effects").CallEffect<any>>, void, [any, any]>;
export function watchLocalPreferenceSaga(): Generator<import("redux-saga/effects").ForkEffect<never>, void, unknown>;
//# sourceMappingURL=localPreferenceSaga.d.ts.map