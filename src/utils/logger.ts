import Config from "../config";

const MAX_DEBUG_LOGS = 100;
const MAX_WARN_LOGS = 100;
const MAX_LIFECYCLE_LOGS = 120;

if (typeof window !== "undefined") {
    window["SBLogs"] = {
        debug: [],
        warn: [],
        lifecycle: [],
        lifecycleSummary: {},
    };
}

type LogLevel = "debug" | "warn";

function trimBuffer<T>(buffer: T[], maxEntries: number): void {
    if (buffer.length > maxEntries) {
        buffer.splice(0, buffer.length - maxEntries);
    }
}

export function shouldEmitConsoleLogs(): boolean {
    try {
        return Boolean(Config.config?.lifecycleDebug);
    } catch (error) {
        return false;
    }
}

function pushLog(level: LogLevel, message: string) {
    const line = `[${new Date().toISOString()}] ${message}`;

    if (typeof window !== "undefined") {
        window["SBLogs"][level].push(line);
        trimBuffer(window["SBLogs"][level], level === "debug" ? MAX_DEBUG_LOGS : MAX_WARN_LOGS);
    }

    return line;
}

export function logDebug(message: string) {
    const line = pushLog("debug", message);

    if (typeof window === "undefined" || shouldEmitConsoleLogs()) {
        console.log(line);
    }
}

export function logWarn(message: string) {
    const line = pushLog("warn", message);

    if (typeof window === "undefined" || shouldEmitConsoleLogs()) {
        console.warn(line);
    }
}

export function describeElement(element: Element | null | undefined): Record<string, unknown> {
    if (!(element instanceof Element)) {
        return {
            present: false,
        };
    }

    const htmlElement = element as HTMLElement;
    return {
        present: true,
        tagName: element.tagName.toLowerCase(),
        id: element.id || null,
        className: htmlElement.className || null,
        childElementCount: htmlElement.childElementCount ?? 0,
        connected: element.isConnected,
        text: element.textContent?.trim()?.slice(0, 80) || null,
    };
}

export function describeVideo(video: HTMLVideoElement | null | undefined): Record<string, unknown> {
    if (!(video instanceof HTMLVideoElement)) {
        return {
            present: false,
        };
    }

    return {
        present: true,
        currentTime: video.currentTime,
        duration: video.duration,
        readyState: video.readyState,
        networkState: video.networkState,
        paused: video.paused,
        ended: video.ended,
        autoplay: video.autoplay,
        src: video.currentSrc || video.src || null,
    };
}

export function describeSelector(selector: string): Record<string, unknown> {
    return {
        selector,
        ...describeElement(document.querySelector(selector)),
    };
}

export function logLifecycle(stage: string, details: Record<string, unknown> = {}): void {
    const entry: SponsorBlockLifecycleLogEntry = {
        time: new Date().toISOString(),
        stage,
        hidden: typeof document !== "undefined" ? document.hidden : undefined,
        readyState: typeof document !== "undefined" ? document.readyState : undefined,
        details,
    };

    if (typeof window !== "undefined") {
        const summary = window["SBLogs"].lifecycleSummary[stage];
        const previousEntry = window["SBLogs"].lifecycle[window["SBLogs"].lifecycle.length - 1];

        if (!summary) {
            window["SBLogs"].lifecycleSummary[stage] = {
                count: 1,
                firstTime: entry.time,
                lastTime: entry.time,
                hiddenTransitions: 0,
                readyStates: entry.readyState ? [entry.readyState] : [],
            };
        } else {
            summary.count++;
            summary.lastTime = entry.time;
            if (entry.readyState && !summary.readyStates.includes(entry.readyState)) {
                summary.readyStates.push(entry.readyState);
            }
            if (previousEntry && previousEntry.stage === stage && previousEntry.hidden !== entry.hidden) {
                summary.hiddenTransitions++;
            }
        }

        window["SBLogs"].lifecycle.push(entry);
        trimBuffer(window["SBLogs"].lifecycle, MAX_LIFECYCLE_LOGS);
    }

    if (typeof window === "undefined" || shouldEmitConsoleLogs()) {
        console.log("[BSB lifecycle]", entry);
    }
}

export function getLogsSnapshot(): {
    debug: string[];
    warn: string[];
    lifecycle: SponsorBlockLifecycleLogEntry[];
    lifecycleSummary: Record<string, SponsorBlockLifecycleStageSummary>;
} {
    return {
        debug: [...(window?.SBLogs?.debug ?? [])],
        warn: [...(window?.SBLogs?.warn ?? [])],
        lifecycle: [...(window?.SBLogs?.lifecycle ?? [])],
        lifecycleSummary: { ...(window?.SBLogs?.lifecycleSummary ?? {}) },
    };
}
