export const loadNotes: import("@reduxjs/toolkit").ActionCreatorWithoutPayload<"notes/loadNotes">;
export const loadNotesSuccess: import("@reduxjs/toolkit").ActionCreatorWithoutPayload<"notes/loadNotesSuccess">;
export const loadNotesFailure: import("@reduxjs/toolkit").ActionCreatorWithPayload<any, "notes/loadNotesFailure">;
export const setSelectedNote: import("@reduxjs/toolkit").ActionCreatorWithPayload<any, "notes/setSelectedNote">;
export const setLastMerge: import("@reduxjs/toolkit").ActionCreatorWithPayload<any, "notes/setLastMerge">;
export const setMergePreview: import("@reduxjs/toolkit").ActionCreatorWithPayload<any, "notes/setMergePreview">;
export const setLockRefusal: import("@reduxjs/toolkit").ActionCreatorWithPayload<any, "notes/setLockRefusal">;
export const setLoading: import("@reduxjs/toolkit").ActionCreatorWithPayload<any, "notes/setLoading">;
export const setNoteKeys: import("@reduxjs/toolkit").ActionCreatorWithPayload<any, "notes/setNoteKeys">;
export const setNoteData: import("@reduxjs/toolkit").ActionCreatorWithPayload<any, "notes/setNoteData">;
export const setNotesDataBatch: import("@reduxjs/toolkit").ActionCreatorWithPayload<any, "notes/setNotesDataBatch">;
export const clearState: import("@reduxjs/toolkit").ActionCreatorWithoutPayload<"notes/clearState">;
export function getNoteKeys(state: any): any;
export function getNotesData(state: any): any;
export function getNoteData(key: any): ((state: any) => any) & {
    clearCache: () => void;
    resultsCount: () => number;
    resetResultsCount: () => void;
} & {
    resultFunc: (resultFuncArgs_0: any) => any;
    memoizedResultFunc: ((resultFuncArgs_0: any) => any) & {
        clearCache: () => void;
        resultsCount: () => number;
        resetResultsCount: () => void;
    };
    lastResult: () => any;
    dependencies: [(state: any) => any];
    recomputations: () => number;
    resetRecomputations: () => void;
    dependencyRecomputations: () => number;
    resetDependencyRecomputations: () => void;
} & {
    memoize: typeof import("reselect").weakMapMemoize;
    argsMemoize: typeof import("reselect").weakMapMemoize;
};
export function getSelectedNote(state: any): any;
export function getLastMerge(state: any): any;
export function getMergePreview(state: any): any;
export function getLockRefusal(state: any): any;
export function getIsLoading(state: any): any;
export const getNotes: ((state: any) => any) & {
    clearCache: () => void;
    resultsCount: () => number;
    resetResultsCount: () => void;
} & {
    resultFunc: (resultFuncArgs_0: any, resultFuncArgs_1: any) => any;
    memoizedResultFunc: ((resultFuncArgs_0: any, resultFuncArgs_1: any) => any) & {
        clearCache: () => void;
        resultsCount: () => number;
        resetResultsCount: () => void;
    };
    lastResult: () => any;
    dependencies: [(state: any) => any, (state: any) => any];
    recomputations: () => number;
    resetRecomputations: () => void;
    dependencyRecomputations: () => number;
    resetDependencyRecomputations: () => void;
} & {
    memoize: typeof import("reselect").weakMapMemoize;
    argsMemoize: typeof import("reselect").weakMapMemoize;
};
export function isSearchingAllNotes(selectedFolder: any, searchTerms: any, scope: any): boolean;
export const getFilteredNotes: ((state: any) => any) & {
    clearCache: () => void;
    resultsCount: () => number;
    resetResultsCount: () => void;
} & {
    resultFunc: (resultFuncArgs_0: any, resultFuncArgs_1: any, resultFuncArgs_2: string[], resultFuncArgs_3: any, resultFuncArgs_4: any, resultFuncArgs_5: any, resultFuncArgs_6: any) => any;
    memoizedResultFunc: ((resultFuncArgs_0: any, resultFuncArgs_1: any, resultFuncArgs_2: string[], resultFuncArgs_3: any, resultFuncArgs_4: any, resultFuncArgs_5: any, resultFuncArgs_6: any) => any) & {
        clearCache: () => void;
        resultsCount: () => number;
        resetResultsCount: () => void;
    };
    lastResult: () => any;
    dependencies: [((state: any) => any) & {
        clearCache: () => void;
        resultsCount: () => number;
        resetResultsCount: () => void;
    } & {
        resultFunc: (resultFuncArgs_0: any, resultFuncArgs_1: any) => any;
        memoizedResultFunc: ((resultFuncArgs_0: any, resultFuncArgs_1: any) => any) & {
            clearCache: () => void;
            resultsCount: () => number;
            resetResultsCount: () => void;
        };
        lastResult: () => any;
        dependencies: [(state: any) => any, (state: any) => any];
        recomputations: () => number;
        resetRecomputations: () => void;
        dependencyRecomputations: () => number;
        resetDependencyRecomputations: () => void;
    } & {
        memoize: typeof import("reselect").weakMapMemoize;
        argsMemoize: typeof import("reselect").weakMapMemoize;
    }, (state: any) => any, ((state: any) => string[]) & {
        clearCache: () => void;
        resultsCount: () => number;
        resetResultsCount: () => void;
    } & {
        resultFunc: (resultFuncArgs_0: any) => string[];
        memoizedResultFunc: ((resultFuncArgs_0: any) => string[]) & {
            clearCache: () => void;
            resultsCount: () => number;
            resetResultsCount: () => void;
        };
        lastResult: () => string[];
        dependencies: [(state: any) => any];
        recomputations: () => number;
        resetRecomputations: () => void;
        dependencyRecomputations: () => number;
        resetDependencyRecomputations: () => void;
    } & {
        memoize: typeof import("reselect").weakMapMemoize;
        argsMemoize: typeof import("reselect").weakMapMemoize;
    }, ((state: any) => any) & {
        clearCache: () => void;
        resultsCount: () => number;
        resetResultsCount: () => void;
    } & {
        resultFunc: (resultFuncArgs_0: any, resultFuncArgs_1: any) => any;
        memoizedResultFunc: ((resultFuncArgs_0: any, resultFuncArgs_1: any) => any) & {
            clearCache: () => void;
            resultsCount: () => number;
            resetResultsCount: () => void;
        };
        lastResult: () => any;
        dependencies: [(state: any) => any, (state: any) => any];
        recomputations: () => number;
        resetRecomputations: () => void;
        dependencyRecomputations: () => number;
        resetDependencyRecomputations: () => void;
    } & {
        memoize: typeof import("reselect").weakMapMemoize;
        argsMemoize: typeof import("reselect").weakMapMemoize;
    }, (state: any) => any, (state: any) => any, (state: any) => any];
    recomputations: () => number;
    resetRecomputations: () => void;
    dependencyRecomputations: () => number;
    resetDependencyRecomputations: () => void;
} & {
    memoize: typeof import("reselect").weakMapMemoize;
    argsMemoize: typeof import("reselect").weakMapMemoize;
};
export const RELATED_NOTES_SHOWN: 8;
/** Related-notes panel rows: hits for the open note that are still listed (not locked or trashed). */
export const getRelatedNoteRows: ((state: any) => any) & {
    clearCache: () => void;
    resultsCount: () => number;
    resetResultsCount: () => void;
} & {
    resultFunc: (resultFuncArgs_0: any, resultFuncArgs_1: any) => any;
    memoizedResultFunc: ((resultFuncArgs_0: any, resultFuncArgs_1: any) => any) & {
        clearCache: () => void;
        resultsCount: () => number;
        resetResultsCount: () => void;
    };
    lastResult: () => any;
    dependencies: [((state: any) => any) & {
        clearCache: () => void;
        resultsCount: () => number;
        resetResultsCount: () => void;
    } & {
        resultFunc: (resultFuncArgs_0: any, resultFuncArgs_1: any) => any;
        memoizedResultFunc: ((resultFuncArgs_0: any, resultFuncArgs_1: any) => any) & {
            clearCache: () => void;
            resultsCount: () => number;
            resetResultsCount: () => void;
        };
        lastResult: () => any;
        dependencies: [(state: any) => any, (state: any) => any];
        recomputations: () => number;
        resetRecomputations: () => void;
        dependencyRecomputations: () => number;
        resetDependencyRecomputations: () => void;
    } & {
        memoize: typeof import("reselect").weakMapMemoize;
        argsMemoize: typeof import("reselect").weakMapMemoize;
    }, (state: any) => any];
    recomputations: () => number;
    resetRecomputations: () => void;
    dependencyRecomputations: () => number;
    resetDependencyRecomputations: () => void;
} & {
    memoize: typeof import("reselect").weakMapMemoize;
    argsMemoize: typeof import("reselect").weakMapMemoize;
};
/** Possible-duplicate pairs whose notes are both still listed. */
export const getDuplicatePairRows: ((state: any) => any) & {
    clearCache: () => void;
    resultsCount: () => number;
    resetResultsCount: () => void;
} & {
    resultFunc: (resultFuncArgs_0: any, resultFuncArgs_1: any) => any;
    memoizedResultFunc: ((resultFuncArgs_0: any, resultFuncArgs_1: any) => any) & {
        clearCache: () => void;
        resultsCount: () => number;
        resetResultsCount: () => void;
    };
    lastResult: () => any;
    dependencies: [((state: any) => any) & {
        clearCache: () => void;
        resultsCount: () => number;
        resetResultsCount: () => void;
    } & {
        resultFunc: (resultFuncArgs_0: any, resultFuncArgs_1: any) => any;
        memoizedResultFunc: ((resultFuncArgs_0: any, resultFuncArgs_1: any) => any) & {
            clearCache: () => void;
            resultsCount: () => number;
            resetResultsCount: () => void;
        };
        lastResult: () => any;
        dependencies: [(state: any) => any, (state: any) => any];
        recomputations: () => number;
        resetRecomputations: () => void;
        dependencyRecomputations: () => number;
        resetDependencyRecomputations: () => void;
    } & {
        memoize: typeof import("reselect").weakMapMemoize;
        argsMemoize: typeof import("reselect").weakMapMemoize;
    }, (state: any) => any];
    recomputations: () => number;
    resetRecomputations: () => void;
    dependencyRecomputations: () => number;
    resetDependencyRecomputations: () => void;
} & {
    memoize: typeof import("reselect").weakMapMemoize;
    argsMemoize: typeof import("reselect").weakMapMemoize;
};
export const getListedNoteCount: ((state: any) => any) & {
    clearCache: () => void;
    resultsCount: () => number;
    resetResultsCount: () => void;
} & {
    resultFunc: (resultFuncArgs_0: any) => any;
    memoizedResultFunc: ((resultFuncArgs_0: any) => any) & {
        clearCache: () => void;
        resultsCount: () => number;
        resetResultsCount: () => void;
    };
    lastResult: () => any;
    dependencies: [((state: any) => any) & {
        clearCache: () => void;
        resultsCount: () => number;
        resetResultsCount: () => void;
    } & {
        resultFunc: (resultFuncArgs_0: any, resultFuncArgs_1: any) => any;
        memoizedResultFunc: ((resultFuncArgs_0: any, resultFuncArgs_1: any) => any) & {
            clearCache: () => void;
            resultsCount: () => number;
            resetResultsCount: () => void;
        };
        lastResult: () => any;
        dependencies: [(state: any) => any, (state: any) => any];
        recomputations: () => number;
        resetRecomputations: () => void;
        dependencyRecomputations: () => number;
        resetDependencyRecomputations: () => void;
    } & {
        memoize: typeof import("reselect").weakMapMemoize;
        argsMemoize: typeof import("reselect").weakMapMemoize;
    }];
    recomputations: () => number;
    resetRecomputations: () => void;
    dependencyRecomputations: () => number;
    resetDependencyRecomputations: () => void;
} & {
    memoize: typeof import("reselect").weakMapMemoize;
    argsMemoize: typeof import("reselect").weakMapMemoize;
};
export function upcomingDuplicateId(pair: any): string;
export function upcomingTitleId(noteKey: any): string;
/** The Upcoming suggestions card: the closest duplicate pair and one untitled note's title, each behind its switch. */
export const getUpcomingSuggestions: ((state: any) => Readonly<{
    duplicate: any;
    title: any;
}>) & {
    clearCache: () => void;
    resultsCount: () => number;
    resetResultsCount: () => void;
} & {
    resultFunc: (resultFuncArgs_0: any, resultFuncArgs_1: any, resultFuncArgs_2: any, resultFuncArgs_3: boolean, resultFuncArgs_4: boolean) => Readonly<{
        duplicate: any;
        title: any;
    }>;
    memoizedResultFunc: ((resultFuncArgs_0: any, resultFuncArgs_1: any, resultFuncArgs_2: any, resultFuncArgs_3: boolean, resultFuncArgs_4: boolean) => Readonly<{
        duplicate: any;
        title: any;
    }>) & {
        clearCache: () => void;
        resultsCount: () => number;
        resetResultsCount: () => void;
    };
    lastResult: () => Readonly<{
        duplicate: any;
        title: any;
    }>;
    dependencies: [((state: any) => any) & {
        clearCache: () => void;
        resultsCount: () => number;
        resetResultsCount: () => void;
    } & {
        resultFunc: (resultFuncArgs_0: any, resultFuncArgs_1: any) => any;
        memoizedResultFunc: ((resultFuncArgs_0: any, resultFuncArgs_1: any) => any) & {
            clearCache: () => void;
            resultsCount: () => number;
            resetResultsCount: () => void;
        };
        lastResult: () => any;
        dependencies: [((state: any) => any) & {
            clearCache: () => void;
            resultsCount: () => number;
            resetResultsCount: () => void;
        } & {
            resultFunc: (resultFuncArgs_0: any, resultFuncArgs_1: any) => any;
            memoizedResultFunc: ((resultFuncArgs_0: any, resultFuncArgs_1: any) => any) & {
                clearCache: () => void;
                resultsCount: () => number;
                resetResultsCount: () => void;
            };
            lastResult: () => any;
            dependencies: [(state: any) => any, (state: any) => any];
            recomputations: () => number;
            resetRecomputations: () => void;
            dependencyRecomputations: () => number;
            resetDependencyRecomputations: () => void;
        } & {
            memoize: typeof import("reselect").weakMapMemoize;
            argsMemoize: typeof import("reselect").weakMapMemoize;
        }, (state: any) => any];
        recomputations: () => number;
        resetRecomputations: () => void;
        dependencyRecomputations: () => number;
        resetDependencyRecomputations: () => void;
    } & {
        memoize: typeof import("reselect").weakMapMemoize;
        argsMemoize: typeof import("reselect").weakMapMemoize;
    }, (state: any) => any, (state: any) => any, (state: any) => boolean, (state: any) => boolean];
    recomputations: () => number;
    resetRecomputations: () => void;
    dependencyRecomputations: () => number;
    resetDependencyRecomputations: () => void;
} & {
    memoize: typeof import("reselect").weakMapMemoize;
    argsMemoize: typeof import("reselect").weakMapMemoize;
};
/**
 * "Related by meaning" rows for the current query: vector hits in the search
 * scope that exact search didn't find. Locked and trashed notes never show.
 */
export const getMeaningNotes: ((state: any) => any[]) & {
    clearCache: () => void;
    resultsCount: () => number;
    resetResultsCount: () => void;
} & {
    resultFunc: (resultFuncArgs_0: any, resultFuncArgs_1: any, resultFuncArgs_2: any, resultFuncArgs_3: any, resultFuncArgs_4: any, resultFuncArgs_5: any) => any[];
    memoizedResultFunc: ((resultFuncArgs_0: any, resultFuncArgs_1: any, resultFuncArgs_2: any, resultFuncArgs_3: any, resultFuncArgs_4: any, resultFuncArgs_5: any) => any[]) & {
        clearCache: () => void;
        resultsCount: () => number;
        resetResultsCount: () => void;
    };
    lastResult: () => any[];
    dependencies: [((state: any) => any) & {
        clearCache: () => void;
        resultsCount: () => number;
        resetResultsCount: () => void;
    } & {
        resultFunc: (resultFuncArgs_0: any, resultFuncArgs_1: any) => any;
        memoizedResultFunc: ((resultFuncArgs_0: any, resultFuncArgs_1: any) => any) & {
            clearCache: () => void;
            resultsCount: () => number;
            resetResultsCount: () => void;
        };
        lastResult: () => any;
        dependencies: [(state: any) => any, (state: any) => any];
        recomputations: () => number;
        resetRecomputations: () => void;
        dependencyRecomputations: () => number;
        resetDependencyRecomputations: () => void;
    } & {
        memoize: typeof import("reselect").weakMapMemoize;
        argsMemoize: typeof import("reselect").weakMapMemoize;
    }, ((state: any) => any) & {
        clearCache: () => void;
        resultsCount: () => number;
        resetResultsCount: () => void;
    } & {
        resultFunc: (resultFuncArgs_0: any, resultFuncArgs_1: any, resultFuncArgs_2: string[], resultFuncArgs_3: any, resultFuncArgs_4: any, resultFuncArgs_5: any, resultFuncArgs_6: any) => any;
        memoizedResultFunc: ((resultFuncArgs_0: any, resultFuncArgs_1: any, resultFuncArgs_2: string[], resultFuncArgs_3: any, resultFuncArgs_4: any, resultFuncArgs_5: any, resultFuncArgs_6: any) => any) & {
            clearCache: () => void;
            resultsCount: () => number;
            resetResultsCount: () => void;
        };
        lastResult: () => any;
        dependencies: [((state: any) => any) & {
            clearCache: () => void;
            resultsCount: () => number;
            resetResultsCount: () => void;
        } & {
            resultFunc: (resultFuncArgs_0: any, resultFuncArgs_1: any) => any;
            memoizedResultFunc: ((resultFuncArgs_0: any, resultFuncArgs_1: any) => any) & {
                clearCache: () => void;
                resultsCount: () => number;
                resetResultsCount: () => void;
            };
            lastResult: () => any;
            dependencies: [(state: any) => any, (state: any) => any];
            recomputations: () => number;
            resetRecomputations: () => void;
            dependencyRecomputations: () => number;
            resetDependencyRecomputations: () => void;
        } & {
            memoize: typeof import("reselect").weakMapMemoize;
            argsMemoize: typeof import("reselect").weakMapMemoize;
        }, (state: any) => any, ((state: any) => string[]) & {
            clearCache: () => void;
            resultsCount: () => number;
            resetResultsCount: () => void;
        } & {
            resultFunc: (resultFuncArgs_0: any) => string[];
            memoizedResultFunc: ((resultFuncArgs_0: any) => string[]) & {
                clearCache: () => void;
                resultsCount: () => number;
                resetResultsCount: () => void;
            };
            lastResult: () => string[];
            dependencies: [(state: any) => any];
            recomputations: () => number;
            resetRecomputations: () => void;
            dependencyRecomputations: () => number;
            resetDependencyRecomputations: () => void;
        } & {
            memoize: typeof import("reselect").weakMapMemoize;
            argsMemoize: typeof import("reselect").weakMapMemoize;
        }, ((state: any) => any) & {
            clearCache: () => void;
            resultsCount: () => number;
            resetResultsCount: () => void;
        } & {
            resultFunc: (resultFuncArgs_0: any, resultFuncArgs_1: any) => any;
            memoizedResultFunc: ((resultFuncArgs_0: any, resultFuncArgs_1: any) => any) & {
                clearCache: () => void;
                resultsCount: () => number;
                resetResultsCount: () => void;
            };
            lastResult: () => any;
            dependencies: [(state: any) => any, (state: any) => any];
            recomputations: () => number;
            resetRecomputations: () => void;
            dependencyRecomputations: () => number;
            resetDependencyRecomputations: () => void;
        } & {
            memoize: typeof import("reselect").weakMapMemoize;
            argsMemoize: typeof import("reselect").weakMapMemoize;
        }, (state: any) => any, (state: any) => any, (state: any) => any];
        recomputations: () => number;
        resetRecomputations: () => void;
        dependencyRecomputations: () => number;
        resetDependencyRecomputations: () => void;
    } & {
        memoize: typeof import("reselect").weakMapMemoize;
        argsMemoize: typeof import("reselect").weakMapMemoize;
    }, (state: any) => any, (state: any) => any, (state: any) => any, (state: any) => any];
    recomputations: () => number;
    resetRecomputations: () => void;
    dependencyRecomputations: () => number;
    resetDependencyRecomputations: () => void;
} & {
    memoize: typeof import("reselect").weakMapMemoize;
    argsMemoize: typeof import("reselect").weakMapMemoize;
};
export const getPinnedNotes: ((state: any) => any) & {
    clearCache: () => void;
    resultsCount: () => number;
    resetResultsCount: () => void;
} & {
    resultFunc: (resultFuncArgs_0: any, resultFuncArgs_1: any) => any;
    memoizedResultFunc: ((resultFuncArgs_0: any, resultFuncArgs_1: any) => any) & {
        clearCache: () => void;
        resultsCount: () => number;
        resetResultsCount: () => void;
    };
    lastResult: () => any;
    dependencies: [((state: any) => any) & {
        clearCache: () => void;
        resultsCount: () => number;
        resetResultsCount: () => void;
    } & {
        resultFunc: (resultFuncArgs_0: any, resultFuncArgs_1: any, resultFuncArgs_2: string[], resultFuncArgs_3: any, resultFuncArgs_4: any, resultFuncArgs_5: any, resultFuncArgs_6: any) => any;
        memoizedResultFunc: ((resultFuncArgs_0: any, resultFuncArgs_1: any, resultFuncArgs_2: string[], resultFuncArgs_3: any, resultFuncArgs_4: any, resultFuncArgs_5: any, resultFuncArgs_6: any) => any) & {
            clearCache: () => void;
            resultsCount: () => number;
            resetResultsCount: () => void;
        };
        lastResult: () => any;
        dependencies: [((state: any) => any) & {
            clearCache: () => void;
            resultsCount: () => number;
            resetResultsCount: () => void;
        } & {
            resultFunc: (resultFuncArgs_0: any, resultFuncArgs_1: any) => any;
            memoizedResultFunc: ((resultFuncArgs_0: any, resultFuncArgs_1: any) => any) & {
                clearCache: () => void;
                resultsCount: () => number;
                resetResultsCount: () => void;
            };
            lastResult: () => any;
            dependencies: [(state: any) => any, (state: any) => any];
            recomputations: () => number;
            resetRecomputations: () => void;
            dependencyRecomputations: () => number;
            resetDependencyRecomputations: () => void;
        } & {
            memoize: typeof import("reselect").weakMapMemoize;
            argsMemoize: typeof import("reselect").weakMapMemoize;
        }, (state: any) => any, ((state: any) => string[]) & {
            clearCache: () => void;
            resultsCount: () => number;
            resetResultsCount: () => void;
        } & {
            resultFunc: (resultFuncArgs_0: any) => string[];
            memoizedResultFunc: ((resultFuncArgs_0: any) => string[]) & {
                clearCache: () => void;
                resultsCount: () => number;
                resetResultsCount: () => void;
            };
            lastResult: () => string[];
            dependencies: [(state: any) => any];
            recomputations: () => number;
            resetRecomputations: () => void;
            dependencyRecomputations: () => number;
            resetDependencyRecomputations: () => void;
        } & {
            memoize: typeof import("reselect").weakMapMemoize;
            argsMemoize: typeof import("reselect").weakMapMemoize;
        }, ((state: any) => any) & {
            clearCache: () => void;
            resultsCount: () => number;
            resetResultsCount: () => void;
        } & {
            resultFunc: (resultFuncArgs_0: any, resultFuncArgs_1: any) => any;
            memoizedResultFunc: ((resultFuncArgs_0: any, resultFuncArgs_1: any) => any) & {
                clearCache: () => void;
                resultsCount: () => number;
                resetResultsCount: () => void;
            };
            lastResult: () => any;
            dependencies: [(state: any) => any, (state: any) => any];
            recomputations: () => number;
            resetRecomputations: () => void;
            dependencyRecomputations: () => number;
            resetDependencyRecomputations: () => void;
        } & {
            memoize: typeof import("reselect").weakMapMemoize;
            argsMemoize: typeof import("reselect").weakMapMemoize;
        }, (state: any) => any, (state: any) => any, (state: any) => any];
        recomputations: () => number;
        resetRecomputations: () => void;
        dependencyRecomputations: () => number;
        resetDependencyRecomputations: () => void;
    } & {
        memoize: typeof import("reselect").weakMapMemoize;
        argsMemoize: typeof import("reselect").weakMapMemoize;
    }, (state: any) => any];
    recomputations: () => number;
    resetRecomputations: () => void;
    dependencyRecomputations: () => number;
    resetDependencyRecomputations: () => void;
} & {
    memoize: typeof import("reselect").weakMapMemoize;
    argsMemoize: typeof import("reselect").weakMapMemoize;
};
export const getUnpinnedNotes: ((state: any) => any) & {
    clearCache: () => void;
    resultsCount: () => number;
    resetResultsCount: () => void;
} & {
    resultFunc: (resultFuncArgs_0: any, resultFuncArgs_1: any) => any;
    memoizedResultFunc: ((resultFuncArgs_0: any, resultFuncArgs_1: any) => any) & {
        clearCache: () => void;
        resultsCount: () => number;
        resetResultsCount: () => void;
    };
    lastResult: () => any;
    dependencies: [((state: any) => any) & {
        clearCache: () => void;
        resultsCount: () => number;
        resetResultsCount: () => void;
    } & {
        resultFunc: (resultFuncArgs_0: any, resultFuncArgs_1: any, resultFuncArgs_2: string[], resultFuncArgs_3: any, resultFuncArgs_4: any, resultFuncArgs_5: any, resultFuncArgs_6: any) => any;
        memoizedResultFunc: ((resultFuncArgs_0: any, resultFuncArgs_1: any, resultFuncArgs_2: string[], resultFuncArgs_3: any, resultFuncArgs_4: any, resultFuncArgs_5: any, resultFuncArgs_6: any) => any) & {
            clearCache: () => void;
            resultsCount: () => number;
            resetResultsCount: () => void;
        };
        lastResult: () => any;
        dependencies: [((state: any) => any) & {
            clearCache: () => void;
            resultsCount: () => number;
            resetResultsCount: () => void;
        } & {
            resultFunc: (resultFuncArgs_0: any, resultFuncArgs_1: any) => any;
            memoizedResultFunc: ((resultFuncArgs_0: any, resultFuncArgs_1: any) => any) & {
                clearCache: () => void;
                resultsCount: () => number;
                resetResultsCount: () => void;
            };
            lastResult: () => any;
            dependencies: [(state: any) => any, (state: any) => any];
            recomputations: () => number;
            resetRecomputations: () => void;
            dependencyRecomputations: () => number;
            resetDependencyRecomputations: () => void;
        } & {
            memoize: typeof import("reselect").weakMapMemoize;
            argsMemoize: typeof import("reselect").weakMapMemoize;
        }, (state: any) => any, ((state: any) => string[]) & {
            clearCache: () => void;
            resultsCount: () => number;
            resetResultsCount: () => void;
        } & {
            resultFunc: (resultFuncArgs_0: any) => string[];
            memoizedResultFunc: ((resultFuncArgs_0: any) => string[]) & {
                clearCache: () => void;
                resultsCount: () => number;
                resetResultsCount: () => void;
            };
            lastResult: () => string[];
            dependencies: [(state: any) => any];
            recomputations: () => number;
            resetRecomputations: () => void;
            dependencyRecomputations: () => number;
            resetDependencyRecomputations: () => void;
        } & {
            memoize: typeof import("reselect").weakMapMemoize;
            argsMemoize: typeof import("reselect").weakMapMemoize;
        }, ((state: any) => any) & {
            clearCache: () => void;
            resultsCount: () => number;
            resetResultsCount: () => void;
        } & {
            resultFunc: (resultFuncArgs_0: any, resultFuncArgs_1: any) => any;
            memoizedResultFunc: ((resultFuncArgs_0: any, resultFuncArgs_1: any) => any) & {
                clearCache: () => void;
                resultsCount: () => number;
                resetResultsCount: () => void;
            };
            lastResult: () => any;
            dependencies: [(state: any) => any, (state: any) => any];
            recomputations: () => number;
            resetRecomputations: () => void;
            dependencyRecomputations: () => number;
            resetDependencyRecomputations: () => void;
        } & {
            memoize: typeof import("reselect").weakMapMemoize;
            argsMemoize: typeof import("reselect").weakMapMemoize;
        }, (state: any) => any, (state: any) => any, (state: any) => any];
        recomputations: () => number;
        resetRecomputations: () => void;
        dependencyRecomputations: () => number;
        resetDependencyRecomputations: () => void;
    } & {
        memoize: typeof import("reselect").weakMapMemoize;
        argsMemoize: typeof import("reselect").weakMapMemoize;
    }, (state: any) => any];
    recomputations: () => number;
    resetRecomputations: () => void;
    dependencyRecomputations: () => number;
    resetDependencyRecomputations: () => void;
} & {
    memoize: typeof import("reselect").weakMapMemoize;
    argsMemoize: typeof import("reselect").weakMapMemoize;
};
export const getNoteCountsPerFolder: ((state: any) => {}) & {
    clearCache: () => void;
    resultsCount: () => number;
    resetResultsCount: () => void;
} & {
    resultFunc: (resultFuncArgs_0: any) => {};
    memoizedResultFunc: ((resultFuncArgs_0: any) => {}) & {
        clearCache: () => void;
        resultsCount: () => number;
        resetResultsCount: () => void;
    };
    lastResult: () => {};
    dependencies: [((state: any) => any) & {
        clearCache: () => void;
        resultsCount: () => number;
        resetResultsCount: () => void;
    } & {
        resultFunc: (resultFuncArgs_0: any, resultFuncArgs_1: any) => any;
        memoizedResultFunc: ((resultFuncArgs_0: any, resultFuncArgs_1: any) => any) & {
            clearCache: () => void;
            resultsCount: () => number;
            resetResultsCount: () => void;
        };
        lastResult: () => any;
        dependencies: [(state: any) => any, (state: any) => any];
        recomputations: () => number;
        resetRecomputations: () => void;
        dependencyRecomputations: () => number;
        resetDependencyRecomputations: () => void;
    } & {
        memoize: typeof import("reselect").weakMapMemoize;
        argsMemoize: typeof import("reselect").weakMapMemoize;
    }];
    recomputations: () => number;
    resetRecomputations: () => void;
    dependencyRecomputations: () => number;
    resetDependencyRecomputations: () => void;
} & {
    memoize: typeof import("reselect").weakMapMemoize;
    argsMemoize: typeof import("reselect").weakMapMemoize;
};
export const createNote: import("@reduxjs/toolkit").ActionCreatorWithPreparedPayload<[content?: {
    title?: string;
    note?: string;
}], {
    title?: string;
    note?: string;
}, "notes/create-note", never, never>;
export const updateNote: import("@reduxjs/toolkit").ActionCreatorWithoutPayload<"notes/update-note">;
export const flushNoteSaves: import("@reduxjs/toolkit").ActionCreatorWithoutPayload<"notes/flush-saves">;
export const selectNote: import("@reduxjs/toolkit").ActionCreatorWithoutPayload<"notes/select-note">;
export const setVisibleNotes: import("@reduxjs/toolkit").ActionCreatorWithoutPayload<"notes/set-visible-notes">;
export const deleteNote: import("@reduxjs/toolkit").ActionCreatorWithoutPayload<"notes/delete-note">;
export const deleteNotes: import("@reduxjs/toolkit").ActionCreatorWithoutPayload<"notes/delete-notes">;
export const moveNotes: import("@reduxjs/toolkit").ActionCreatorWithoutPayload<"notes/move-notes">;
export const restoreNote: import("@reduxjs/toolkit").ActionCreatorWithoutPayload<"notes/restore-note">;
export const restoreNotes: import("@reduxjs/toolkit").ActionCreatorWithoutPayload<"notes/restore-notes">;
export const mergeNotes: import("@reduxjs/toolkit").ActionCreatorWithoutPayload<"notes/merge-notes">;
export const undoMergeNotes: import("@reduxjs/toolkit").ActionCreatorWithoutPayload<"notes/undo-merge-notes">;
export const previewMergeNotes: import("@reduxjs/toolkit").ActionCreatorWithoutPayload<"notes/preview-merge-notes">;
export const clearMergePreview: import("@reduxjs/toolkit").ActionCreatorWithoutPayload<"notes/clear-merge-preview">;
export const splitNote: import("@reduxjs/toolkit").ActionCreatorWithoutPayload<"notes/split-note">;
export const applyFolderMoves: import("@reduxjs/toolkit").ActionCreatorWithoutPayload<"notes/apply-folder-moves">;
export const purgeExpiredTrash: import("@reduxjs/toolkit").ActionCreatorWithoutPayload<"notes/purge-expired-trash">;
export const subscribeAllNoteKeys: import("@reduxjs/toolkit").ActionCreatorWithoutPayload<"notes/subscribe-all-notes-keys">;
export const subscribeAllNotes: import("@reduxjs/toolkit").ActionCreatorWithoutPayload<"notes/subscribe-all-notes">;
declare const _default: import("redux").Reducer<{
    notes: any[];
    notesKeys: any[];
    notesData: any[];
    selectedNote: any;
    isLoading: boolean;
    error: any;
}>;
export default _default;
//# sourceMappingURL=notesSlice.d.ts.map