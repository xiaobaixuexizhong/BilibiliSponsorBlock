/** @jest-environment jsdom */

describe("video listeners", () => {
    beforeEach(() => {
        jest.resetModules();
        jest.doMock("../src/config", () => ({
            __esModule: true,
            default: {
                config: {
                    disableSkipping: true,
                },
            },
        }));
        jest.doMock("../src/content/danmakuSkip", () => ({
            danmakuForSkip: jest.fn(),
        }));
        jest.doMock("../src/utils/logger", () => ({
            logDebug: jest.fn(),
        }));
        jest.doMock("../src/utils/video", () => ({
            getVideoID: jest.fn(() => "BV1test"),
        }));
    });

    test("video ready and duration changes only emit player events", async () => {
        const { createContentApp } = await import("../src/content/app");
        const { CONTENT_EVENTS } = await import("../src/content/app/events");
        const { durationChangeListener, videoOnReadyListener } = await import("../src/content/videoListeners");
        const app = createContentApp();
        const video = document.createElement("video");
        const emitted: string[] = [];

        app.bus.on(CONTENT_EVENTS.PLAYER_VIDEO_READY, ({ video: eventVideo }) => {
            expect(eventVideo).toBe(video);
            emitted.push(CONTENT_EVENTS.PLAYER_VIDEO_READY);
        });
        app.bus.on(CONTENT_EVENTS.PLAYER_DURATION_CHANGED, ({ video: eventVideo }) => {
            expect(eventVideo).toBe(video);
            emitted.push(CONTENT_EVENTS.PLAYER_DURATION_CHANGED);
        });

        expect(() => videoOnReadyListener({ target: video } as unknown as Event)).not.toThrow();
        expect(() => durationChangeListener({ target: video } as unknown as Event)).not.toThrow();
        expect(emitted).toEqual([
            CONTENT_EVENTS.PLAYER_VIDEO_READY,
            CONTENT_EVENTS.PLAYER_DURATION_CHANGED,
        ]);
    });
});
