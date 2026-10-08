import { beforeEach, describe, expect, test } from "bun:test";
import { bump, isPinned, renderPins, togglePin } from "../src/app/pins";
import { prefs } from "../src/app/store";

describe("pins unit tests", () => {
  beforeEach(() => {
    prefs.pins = [];
  });

  test("togglePin adds and removes pins and tracks isPinned", () => {
    expect(isPinned("https://example.com/")).toBe(false);

    const added = togglePin("https://example.com/", "Example");
    expect(added).toBe(true);
    expect(isPinned("https://example.com/")).toBe(true);
    expect(prefs.pins).toEqual([["https://example.com/", "Example", 0]]);

    bump("https://example.com/");
    expect(prefs.pins[0]![2]).toBe(1);

    const removed = togglePin("https://example.com/", "Example");
    expect(removed).toBe(false);
    expect(isPinned("https://example.com/")).toBe(false);
    expect(prefs.pins.length).toBe(0);
  });

  test("renderPins hides section when no pins, shows when pins present", () => {
    const sec = { hidden: false };
    const edit = { hidden: false, textContent: "Done" };
    const container = {
      _text: "something",
      get textContent() {
        return this._text;
      },
      set textContent(v: string) {
        this._text = v;
        if (!v) this.children = [];
      },
      classList: {
        classes: new Set(["edit"]),
        remove(c: string) {
          this.classes.delete(c);
        },
      },
      children: [] as unknown[],
      append(...items: unknown[]) {
        this.children.push(...items);
      },
    };

    // Mock minimal DOM for renderPins
    (globalThis as any).document = {
      getElementById(id: string) {
        if (id === "pins-sec") return sec;
        if (id === "edit") return edit;
        return null;
      },
      createElement(tag: string) {
        return {
          tag,
          className: "",
          href: "",
          rel: "",
          dataset: {} as Record<string, string>,
          children: [] as unknown[],
          append(...children: unknown[]) {
            this.children.push(...children);
          },
          setAttribute(k: string, v: string) {
            (this as any)[k] = v;
          },
        };
      },
    };

    // 1. With no pins: should be hidden, edit reset, no starter chips added
    renderPins(container as any);
    expect(sec.hidden).toBe(true);
    expect(edit.hidden).toBe(true);
    expect(edit.textContent).toBe("Edit");
    expect(container.classList.classes.has("edit")).toBe(false);
    expect(container.children.length).toBe(0);

    // 2. With pins: should be visible
    togglePin("https://test.example/", "Test");
    renderPins(container as any);
    expect(sec.hidden).toBe(false);
    expect(edit.hidden).toBe(false);
    expect(container.children.length).toBe(1);
    const pinAnchor = container.children[0] as any;
    expect(pinAnchor.tag).toBe("a");
    expect(pinAnchor.className).toBe("pin keycap");
    expect(pinAnchor.href).toBe("https://test.example/");
    const label = pinAnchor.children[0];
    expect(label.className).toBe("lb");
    expect(label.textContent).toBe("Test");
    const removeBtn = pinAnchor.children[1];
    expect(removeBtn.className).toBe("rm");

    // 3. Multiple pins ranked by clicks
    togglePin("https://second.example/", "Second");
    bump("https://second.example/");
    renderPins(container as any);
    expect(container.children.length).toBe(2);
    // Bumper item should be first
    expect((container.children[0] as any).href).toBe("https://second.example/");
    expect((container.children[1] as any).href).toBe("https://test.example/");

    // 4. Removing all pins hides the section again
    togglePin("https://test.example/", "Test");
    togglePin("https://second.example/", "Second");
    renderPins(container as any);
    expect(sec.hidden).toBe(true);
    expect(edit.hidden).toBe(true);
    expect(container.children.length).toBe(0);
  });
});
