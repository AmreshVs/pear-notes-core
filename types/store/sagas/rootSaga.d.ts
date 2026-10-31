export default function rootSaga(): Generator<import("redux-saga/effects").TakeEffect | import("redux-saga/effects").ForkEffect<void> | import("redux-saga/effects").PutEffect<{
    payload: undefined;
    type: "ui/init-app";
}> | import("redux-saga/effects").AllEffect<import("redux-saga/effects").ForkEffect<void> | import("redux-saga/effects").ForkEffect<Generator<import("redux-saga/effects").ForkEffect<never> | Generator<import("redux-saga/effects").SelectEffect | import("redux-saga/effects").TakeEffect | import("redux-saga/effects").PutEffect<{
    payload: any;
    type: "editor/syncEditorWithNote";
}>, void, unknown>, void, unknown>>>, void, unknown>;
//# sourceMappingURL=rootSaga.d.ts.map