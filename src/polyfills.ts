// Polyfills for modern ECMAScript proposals and fetch protection in sandboxed/iframe environments
// specifically Map.prototype.getOrInsertComputed, Map.prototype.getOrInsert, Promise.withResolvers,
// and ensuring window.fetch has a setter so that libraries can reassign or wrap it without throwing
// "Cannot set property fetch of #<Window> which has only a getter"

try {
  const win = typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : null);
  if (win && "fetch" in win) {
    let rawFetch = typeof (win as any).fetch === "function" ? (win as any).fetch.bind(win) : (win as any).fetch;
    const fetchDesc = Object.getOwnPropertyDescriptor(win, "fetch");
    if (!fetchDesc || !fetchDesc.set || fetchDesc.writable === false) {
      try {
        Object.defineProperty(win, "fetch", {
          get: function () {
            return rawFetch;
          },
          set: function (val: any) {
            rawFetch = val;
          },
          configurable: true,
          enumerable: true,
        });
      } catch {
        try {
          if (typeof Window !== "undefined" && Window.prototype) {
            Object.defineProperty(Window.prototype, "fetch", {
              get: function () {
                return rawFetch;
              },
              set: function (val: any) {
                rawFetch = val;
              },
              configurable: true,
              enumerable: true,
            });
          }
        } catch {}
      }
    }
  }
} catch {}

if (typeof Map !== "undefined") {
  if (typeof (Map.prototype as any).getOrInsertComputed !== "function") {
    Object.defineProperty(Map.prototype, "getOrInsertComputed", {
      value: function (key: any, callbackfn: (k: any) => any) {
        const actualKey = key === 0 && 1 / key === -Infinity ? 0 : key;
        if (this.has(actualKey)) {
          return this.get(actualKey);
        }
        if (typeof callbackfn !== "function") {
          throw new TypeError(callbackfn + " is not a function");
        }
        const value = callbackfn(actualKey);
        this.set(actualKey, value);
        return value;
      },
      writable: true,
      configurable: true,
      enumerable: false,
    });
  }

  if (typeof (Map.prototype as any).getOrInsert !== "function") {
    Object.defineProperty(Map.prototype, "getOrInsert", {
      value: function (key: any, value: any) {
        if (this.has(key)) {
          return this.get(key);
        }
        this.set(key, value);
        return value;
      },
      writable: true,
      configurable: true,
      enumerable: false,
    });
  }
}

if (typeof WeakMap !== "undefined") {
  if (typeof (WeakMap.prototype as any).getOrInsertComputed !== "function") {
    Object.defineProperty(WeakMap.prototype, "getOrInsertComputed", {
      value: function (key: any, callbackfn: (k: any) => any) {
        const actualKey = key === 0 && 1 / key === -Infinity ? 0 : key;
        if (this.has(actualKey)) {
          return this.get(actualKey);
        }
        if (typeof callbackfn !== "function") {
          throw new TypeError(callbackfn + " is not a function");
        }
        const value = callbackfn(actualKey);
        this.set(actualKey, value);
        return value;
      },
      writable: true,
      configurable: true,
      enumerable: false,
    });
  }

  if (typeof (WeakMap.prototype as any).getOrInsert !== "function") {
    Object.defineProperty(WeakMap.prototype, "getOrInsert", {
      value: function (key: any, value: any) {
        if (this.has(key)) {
          return this.get(key);
        }
        this.set(key, value);
        return value;
      },
      writable: true,
      configurable: true,
      enumerable: false,
    });
  }
}

if (typeof Promise !== "undefined" && typeof (Promise as any).withResolvers !== "function") {
  Object.defineProperty(Promise, "withResolvers", {
    value: function <T>() {
      let resolve!: (value: T | PromiseLike<T>) => void;
      let reject!: (reason?: any) => void;
      const promise = new (this as any)((res: (v: T | PromiseLike<T>) => void, rej: (r?: any) => void) => {
        resolve = res;
        reject = rej;
      });
      return { promise, resolve, reject };
    },
    writable: true,
    configurable: true,
    enumerable: false,
  });
}

if (typeof Promise !== "undefined" && typeof (Promise as any).try !== "function") {
  Object.defineProperty(Promise, "try", {
    value: function (callbackfn: (...args: any[]) => any, ...args: any[]) {
      return new (this as any)((resolve: (v: any) => void) => {
        resolve(callbackfn(...args));
      });
    },
    writable: true,
    configurable: true,
    enumerable: false,
  });
}

if (typeof (Math as any).sumPrecise !== "function") {
  Object.defineProperty(Math, "sumPrecise", {
    value: function (items: Iterable<number>) {
      let sum = 0;
      for (const n of items) {
        sum += Number(n);
      }
      return sum;
    },
    writable: true,
    configurable: true,
    enumerable: false,
  });
}

if (typeof Uint8Array !== "undefined") {
  if (typeof (Uint8Array as any).fromBase64 !== "function") {
    Object.defineProperty(Uint8Array, "fromBase64", {
      value: function (b64: string) {
        const clean = String(b64).replace(/[\r\n\s]/g, "").replace(/-/g, "+").replace(/_/g, "/");
        const bin = atob(clean);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) {
          bytes[i] = bin.charCodeAt(i);
        }
        return bytes;
      },
      writable: true,
      configurable: true,
      enumerable: false,
    });
  }

  if (typeof (Uint8Array.prototype as any).toHex !== "function") {
    Object.defineProperty(Uint8Array.prototype, "toHex", {
      value: function (this: Uint8Array) {
        let hex = "";
        for (let i = 0; i < this.length; i++) {
          hex += this[i].toString(16).padStart(2, "0");
        }
        return hex;
      },
      writable: true,
      configurable: true,
      enumerable: false,
    });
  }
}

if (typeof globalThis !== "undefined") {
  (globalThis as any).pdfjsVersion = "6.5.438";
}

export {};
