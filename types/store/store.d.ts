export const VAULT_SCOPED_SLICES: string[];
export const store: import("@reduxjs/toolkit").EnhancedStore<{
    notes: {
        notes: any[];
        notesKeys: any[];
        notesData: any[];
        selectedNote: any;
        isLoading: boolean;
        error: any;
    };
    folders: {
        folderKeys: any[];
        folderData: {};
        selectedFolder: string;
        isLoading: boolean;
        error: any;
    };
    ui: {
        searchQuery: string;
        showSettings: boolean;
        askVault: any;
        shouldAutoRenameNextFolder: boolean;
        editor: any;
        isLoading: boolean;
        error: any;
        hyperdriveServerAddress: string;
    };
    editor: {
        title: string;
        content: string;
        contentText: string;
        editorInstance: any;
        isFocused: boolean;
        baseKey: any;
        baseTitle: string;
        baseContent: string;
        conflict: any;
        recentLocalWrites: any[];
        syncToken: number;
        lastResolution: any;
    };
    sync: {
        invite: any;
        inviteId: any;
        publicKey: any;
        expiresAt: any;
        isLoading: boolean;
        error: any;
        showPairingInput: boolean;
        inviterStatus: {
            step: string;
            message: string;
            progress: number;
        };
        receiverStatus: {
            step: string;
            message: string;
            progress: number;
        };
        deviceRemoved: boolean;
        needsReload: boolean;
        vaultUpdateRequired: boolean;
        heldMerge: any;
        heldMergeDismissed: boolean;
    };
    settings: {
        theme: string;
        fontFamily: string;
        editorFontSize: number;
        sortBy: string;
        lockMethod: string;
        lockPasswordSalt: string;
        lockPasswordHash: string;
        activityLogEnabled: boolean;
        activityRetentionDays: number;
        isLoading: boolean;
    };
    syncedDevices: {
        devicesKeys: any[];
        devicesData: {};
        localPreferences: {};
        isLoading: boolean;
        error: any;
        indexerPendingKey: any;
        indexerPendingStep: any;
        indexerError: any;
        indexerErrorDeviceKey: any;
    };
    backup: {
        exportStatus: {
            step: string;
            message: string;
            progress: number;
            current: number;
            total: number;
        };
        importStatus: {
            step: string;
            message: string;
            progress: number;
            current: number;
            total: number;
        };
        exportBuffer: any;
    };
    storage: {
        notesStorageInfo: any[];
        totalBlobBytes: number;
        totalOnDiskBytes: number;
        reclaimableBytes: number;
        isReclaiming: boolean;
        downloads: any[];
        uploads: any[];
        sealWaiting: any[];
        isLoading: boolean;
        error: any;
    };
    activity: {
        entries: any[];
        cursor: string;
        hasMore: boolean;
        filter: string;
        deviceKey: string;
        noteKey: string;
        historyNoteKey: any;
        noteEntries: {};
        diffs: {};
        recovering: {};
        stats: {
            count: number;
            bytes: number;
            oldestAt: number;
        };
        isLoading: boolean;
        isLoadingMore: boolean;
        isClearing: boolean;
        error: any;
    };
    localAi: {
        loaded: boolean;
        device: {
            status: string;
            reason: any;
            totalMemoryBytes: number;
            freeDiskBytes: number;
        };
        network: string;
        config: {
            version: number;
            wifiOnly: boolean;
            features: {
                [k: string]: {
                    model?: any;
                    enabled: boolean;
                    tier: string;
                    language: string;
                };
            };
            translation: {
                lastTarget: any;
            };
            offload: {
                useMac: boolean;
                serve: boolean;
            };
            downloaded: {};
        };
        models: {};
        notice: any;
        index: {
            enabled: boolean;
            waitForCharging: boolean;
            status: string;
            done: number;
            total: number;
            deferred: number;
            error: any;
            lastRun: any;
            changedAt: number;
        };
        related: {
            noteKey: any;
            status: string;
            forKey: any;
            hits: any[];
            indexAt: number;
        };
        duplicates: {
            status: string;
            pairs: any[];
            indexAt: number;
        };
        upcoming: {
            title: any;
            snoozed: any[];
        };
        offloadStatus: {
            available: boolean;
            deviceTitle: string;
        };
        offloadServing: {
            active: boolean;
            activeDevice: string;
            lastDevice: string;
            lastAt: number;
        };
        suggestions: {
            noteKey: any;
            title: any;
            folder: any;
        };
        aiSuggestions: Readonly<{
            tasks: true;
            titles: true;
            folders: true;
            related: true;
        }>;
    };
    vaults: {
        list: any[];
        pending: any;
        pendingId: any;
        error: any;
        failedAction: any;
        forceRemovalId: any;
        enteredAt: number;
    };
    search: {
        scope: string;
        includeLocked: boolean;
        status: string;
        pendingQuery: string;
        query: string;
        folderKey: string;
        hits: {};
        total: number;
        meaning: {
            status: string;
            query: string;
            indexAt: number;
            hits: any[];
        };
    };
}, import("redux").UnknownAction, import("@reduxjs/toolkit").Tuple<[import("redux").StoreEnhancer<{
    dispatch: import("redux-thunk").ThunkDispatch<{
        notes: {
            notes: any[];
            notesKeys: any[];
            notesData: any[];
            selectedNote: any;
            isLoading: boolean;
            error: any;
        };
        folders: {
            folderKeys: any[];
            folderData: {};
            selectedFolder: string;
            isLoading: boolean;
            error: any;
        };
        ui: {
            searchQuery: string;
            showSettings: boolean;
            askVault: any;
            shouldAutoRenameNextFolder: boolean;
            editor: any;
            isLoading: boolean;
            error: any;
            hyperdriveServerAddress: string;
        };
        editor: {
            title: string;
            content: string;
            contentText: string;
            editorInstance: any;
            isFocused: boolean;
            baseKey: any;
            baseTitle: string;
            baseContent: string;
            conflict: any;
            recentLocalWrites: any[];
            syncToken: number;
            lastResolution: any;
        };
        sync: {
            invite: any;
            inviteId: any;
            publicKey: any;
            expiresAt: any;
            isLoading: boolean;
            error: any;
            showPairingInput: boolean;
            inviterStatus: {
                step: string;
                message: string;
                progress: number;
            };
            receiverStatus: {
                step: string;
                message: string;
                progress: number;
            };
            deviceRemoved: boolean;
            needsReload: boolean;
            vaultUpdateRequired: boolean;
            heldMerge: any;
            heldMergeDismissed: boolean;
        };
        settings: {
            theme: string;
            fontFamily: string;
            editorFontSize: number;
            sortBy: string;
            lockMethod: string;
            lockPasswordSalt: string;
            lockPasswordHash: string;
            activityLogEnabled: boolean;
            activityRetentionDays: number;
            isLoading: boolean;
        };
        syncedDevices: {
            devicesKeys: any[];
            devicesData: {};
            localPreferences: {};
            isLoading: boolean;
            error: any;
            indexerPendingKey: any;
            indexerPendingStep: any;
            indexerError: any;
            indexerErrorDeviceKey: any;
        };
        backup: {
            exportStatus: {
                step: string;
                message: string;
                progress: number;
                current: number;
                total: number;
            };
            importStatus: {
                step: string;
                message: string;
                progress: number;
                current: number;
                total: number;
            };
            exportBuffer: any;
        };
        storage: {
            notesStorageInfo: any[];
            totalBlobBytes: number;
            totalOnDiskBytes: number;
            reclaimableBytes: number;
            isReclaiming: boolean;
            downloads: any[];
            uploads: any[];
            sealWaiting: any[];
            isLoading: boolean;
            error: any;
        };
        activity: {
            entries: any[];
            cursor: string;
            hasMore: boolean;
            filter: string;
            deviceKey: string;
            noteKey: string;
            historyNoteKey: any;
            noteEntries: {};
            diffs: {};
            recovering: {};
            stats: {
                count: number;
                bytes: number;
                oldestAt: number;
            };
            isLoading: boolean;
            isLoadingMore: boolean;
            isClearing: boolean;
            error: any;
        };
        localAi: {
            loaded: boolean;
            device: {
                status: string;
                reason: any;
                totalMemoryBytes: number;
                freeDiskBytes: number;
            };
            network: string;
            config: {
                version: number;
                wifiOnly: boolean;
                features: {
                    [k: string]: {
                        model?: any;
                        enabled: boolean;
                        tier: string;
                        language: string;
                    };
                };
                translation: {
                    lastTarget: any;
                };
                offload: {
                    useMac: boolean;
                    serve: boolean;
                };
                downloaded: {};
            };
            models: {};
            notice: any;
            index: {
                enabled: boolean;
                waitForCharging: boolean;
                status: string;
                done: number;
                total: number;
                deferred: number;
                error: any;
                lastRun: any;
                changedAt: number;
            };
            related: {
                noteKey: any;
                status: string;
                forKey: any;
                hits: any[];
                indexAt: number;
            };
            duplicates: {
                status: string;
                pairs: any[];
                indexAt: number;
            };
            upcoming: {
                title: any;
                snoozed: any[];
            };
            offloadStatus: {
                available: boolean;
                deviceTitle: string;
            };
            offloadServing: {
                active: boolean;
                activeDevice: string;
                lastDevice: string;
                lastAt: number;
            };
            suggestions: {
                noteKey: any;
                title: any;
                folder: any;
            };
            aiSuggestions: Readonly<{
                tasks: true;
                titles: true;
                folders: true;
                related: true;
            }>;
        };
        vaults: {
            list: any[];
            pending: any;
            pendingId: any;
            error: any;
            failedAction: any;
            forceRemovalId: any;
            enteredAt: number;
        };
        search: {
            scope: string;
            includeLocked: boolean;
            status: string;
            pendingQuery: string;
            query: string;
            folderKey: string;
            hits: {};
            total: number;
            meaning: {
                status: string;
                query: string;
                indexAt: number;
                hits: any[];
            };
        };
    }, undefined, import("redux").UnknownAction>;
}>, import("redux").StoreEnhancer]>>;
//# sourceMappingURL=store.d.ts.map