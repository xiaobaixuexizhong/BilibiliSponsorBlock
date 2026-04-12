import { sleep, waitFor } from "../utils/";
import { describeElement, describeVideo, logLifecycle } from "../utils/logger";
import { getControls, getLeftControls, getProgressBar, isVisible } from "../utils/pageUtils";
import { getVideo } from "../utils/video";
import { getPageLoaded } from "./state";

export interface PlayerUIReadySnapshot {
    hidden: boolean;
    pageLoaded: boolean;
    leftControls: HTMLElement | null;
    rightControls: HTMLElement | null;
    progressBar: HTMLElement | null;
    video: HTMLVideoElement | null;
}

function hasStableRect(element: HTMLElement | null): boolean {
    if (!element) {
        return false;
    }

    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
}

function hasUsableVideo(video: HTMLVideoElement | null): boolean {
    if (!video) {
        return false;
    }

    return video.readyState >= HTMLMediaElement.HAVE_METADATA && Number.isFinite(video.duration) && video.duration > 0;
}

export function capturePlayerUiReadySnapshot(): PlayerUIReadySnapshot {
    return {
        hidden: document.hidden,
        pageLoaded: getPageLoaded(),
        leftControls: getLeftControls(),
        rightControls: getControls(),
        progressBar: getProgressBar(),
        video: getVideo(),
    };
}

export function summarizePlayerUiSnapshot(snapshot: PlayerUIReadySnapshot): Record<string, unknown> {
    return {
        hidden: snapshot.hidden,
        pageLoaded: snapshot.pageLoaded,
        leftControls: describeElement(snapshot.leftControls),
        leftControlsVisible: isVisible(snapshot.leftControls),
        leftControlsRectReady: hasStableRect(snapshot.leftControls),
        rightControls: describeElement(snapshot.rightControls),
        rightControlsVisible: isVisible(snapshot.rightControls),
        rightControlsRectReady: hasStableRect(snapshot.rightControls),
        progressBar: describeElement(snapshot.progressBar),
        progressBarVisible: isVisible(snapshot.progressBar),
        progressBarRectReady: hasStableRect(snapshot.progressBar),
        video: describeVideo(snapshot.video),
        videoReady: hasUsableVideo(snapshot.video),
    };
}

export function isPlayerUiReady(snapshot = capturePlayerUiReadySnapshot()): boolean {
    return (
        !snapshot.hidden &&
        snapshot.pageLoaded &&
        hasUsableVideo(snapshot.video) &&
        isVisible(snapshot.leftControls) &&
        hasStableRect(snapshot.leftControls) &&
        isVisible(snapshot.rightControls) &&
        hasStableRect(snapshot.rightControls) &&
        isVisible(snapshot.progressBar) &&
        hasStableRect(snapshot.progressBar)
    );
}

let pendingPlayerUiReadyPromise: Promise<PlayerUIReadySnapshot> | null = null;

export async function waitForPlayerUiReady(timeout = 24 * 60 * 60 * 1000): Promise<PlayerUIReadySnapshot> {
    if (pendingPlayerUiReadyPromise) {
        return pendingPlayerUiReadyPromise;
    }

    logLifecycle("playerUI/wait:start", summarizePlayerUiSnapshot(capturePlayerUiReadySnapshot()));

    pendingPlayerUiReadyPromise = waitFor(capturePlayerUiReadySnapshot, timeout, 100, isPlayerUiReady)
        .then(async () => {
            await sleep(150);

            if (isPlayerUiReady()) {
                return capturePlayerUiReadySnapshot();
            }

            return waitFor(capturePlayerUiReadySnapshot, timeout, 100, isPlayerUiReady);
        })
        .then((snapshot) => {
            logLifecycle("playerUI/wait:resolved", summarizePlayerUiSnapshot(snapshot));
            return snapshot;
        })
        .finally(() => {
            pendingPlayerUiReadyPromise = null;
        });

    return pendingPlayerUiReadyPromise;
}
