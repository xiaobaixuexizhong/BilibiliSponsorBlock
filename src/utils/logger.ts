if (typeof window !== "undefined") {
    window["SBLogs"] = {
        debug: [],
        warn: [],
        lifecycle: [],
    };
}

type LogLevel = "debug" | "warn";

function pushLog(level: LogLevel, message: string) {
    const line = `[${new Date().toISOString()}] ${message}`;

    if (typeof window !== "undefined") {
        window["SBLogs"][level].push(line);
    }

    return line;
}

export function logDebug(message: string) {
    const line = pushLog("debug", message);

    if (typeof window === "undefined") {
        console.log(line);
    }
}

export function logWarn(message: string) {
    const line = pushLog("warn", message);

    if (typeof window === "undefined") {
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
    const entry = {
        time: new Date().toISOString(),
        stage,
        hidden: typeof document !== "undefined" ? document.hidden : undefined,
        readyState: typeof document !== "undefined" ? document.readyState : undefined,
        details,
    };

    if (typeof window !== "undefined") {
        window["SBLogs"].lifecycle.push(entry);
    }

    console.log("[BSB lifecycle]", entry);
}
