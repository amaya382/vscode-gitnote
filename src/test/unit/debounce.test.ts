import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { debounce } from "../../utils/debounce";

describe("debounce", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should delay function execution", () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 1000);

    debounced();
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(999);
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("should reset timer on subsequent calls", () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 1000);

    debounced();
    vi.advanceTimersByTime(500);
    debounced();
    vi.advanceTimersByTime(500);

    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(500);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("should pass latest arguments", () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 1000);

    debounced("a");
    debounced("b");
    debounced("c");

    vi.advanceTimersByTime(1000);
    expect(fn).toHaveBeenCalledWith("c");
  });

  it("should cancel pending execution", () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 1000);

    debounced();
    debounced.cancel();

    vi.advanceTimersByTime(2000);
    expect(fn).not.toHaveBeenCalled();
  });

  it("should flush pending execution immediately", () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 1000);

    debounced("arg");
    debounced.flush();

    expect(fn).toHaveBeenCalledWith("arg");
    expect(fn).toHaveBeenCalledTimes(1);

    // Should not fire again
    vi.advanceTimersByTime(2000);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("should report pending state correctly", () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 1000);

    expect(debounced.pending()).toBe(false);

    debounced();
    expect(debounced.pending()).toBe(true);

    vi.advanceTimersByTime(1000);
    expect(debounced.pending()).toBe(false);
  });

  it("flush should not call fn if nothing is pending", () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 1000);

    debounced.flush();
    expect(fn).not.toHaveBeenCalled();
  });

  it("cancel should clear pending state", () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 1000);

    debounced();
    expect(debounced.pending()).toBe(true);

    debounced.cancel();
    expect(debounced.pending()).toBe(false);
  });
});
