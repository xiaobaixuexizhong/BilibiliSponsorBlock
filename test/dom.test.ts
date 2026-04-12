/** @jest-environment jsdom */

import { isVisible } from "../src/utils/dom";

describe("dom visibility helpers", () => {
    test("isVisible returns false for null", () => {
        expect(isVisible(null)).toBe(false);
    });

    test("isVisible returns false for zero-sized elements", () => {
        const element = document.createElement("div");

        Object.defineProperty(element, "offsetWidth", { configurable: true, value: 0 });
        Object.defineProperty(element, "offsetHeight", { configurable: true, value: 0 });

        expect(isVisible(element)).toBe(false);
    });

    test("isVisible returns true when the element occupies the hit-test point", () => {
        const element = document.createElement("div");
        document.body.appendChild(element);

        Object.defineProperty(element, "offsetWidth", { configurable: true, value: 100 });
        Object.defineProperty(element, "offsetHeight", { configurable: true, value: 50 });
        element.getBoundingClientRect = jest.fn(() => ({
            x: 0,
            y: 0,
            top: 0,
            left: 0,
            right: 100,
            bottom: 50,
            width: 100,
            height: 50,
            toJSON: () => ({}),
        })) as typeof element.getBoundingClientRect;

        const originalElementFromPoint = document.elementFromPoint;
        document.elementFromPoint = jest.fn(() => element);

        expect(isVisible(element)).toBe(true);

        document.elementFromPoint = originalElementFromPoint;
    });
});
