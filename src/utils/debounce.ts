export interface DebouncedFunction<T extends (...args: any[]) => any> {
  (...args: Parameters<T>): void;
  cancel(): void;
  flush(): void;
  pending(): boolean;
  remainingMs(): number;
}

export function debounce<T extends (...args: any[]) => any>(
  fn: T,
  delay: number,
): DebouncedFunction<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastArgs: Parameters<T> | undefined;
  let fireAt = 0;

  const debounced = (...args: Parameters<T>): void => {
    lastArgs = args;
    if (timer !== undefined) {
      clearTimeout(timer);
    }
    fireAt = Date.now() + delay;
    timer = setTimeout(() => {
      timer = undefined;
      fireAt = 0;
      const args = lastArgs!;
      lastArgs = undefined;
      fn(...args);
    }, delay);
  };

  debounced.cancel = (): void => {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
      lastArgs = undefined;
      fireAt = 0;
    }
  };

  debounced.flush = (): void => {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
      fireAt = 0;
      const args = lastArgs!;
      lastArgs = undefined;
      fn(...args);
    }
  };

  debounced.pending = (): boolean => timer !== undefined;

  debounced.remainingMs = (): number => {
    if (fireAt === 0) {
      return 0;
    }
    return Math.max(0, fireAt - Date.now());
  };

  return debounced;
}
