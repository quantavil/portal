/** Minimal async key-value store. Values are strings (JSON): reading 23 strings is much faster than structured-cloning 20k objects. */
export interface KV {
  get(key: string): Promise<string | undefined>;
  list(prefix: string): Promise<[key: string, value: string][]>;
  /** Atomic: optionally wipe everything first, then put all entries, in ONE transaction. */
  write(puts: Record<string, string>, opts?: { clear?: boolean }): Promise<void>;
}

const STORE = "kv";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("fmhy-home", 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const done = (tx: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = tx.onabort = () => reject(tx.error ?? new Error("transaction aborted"));
  });

const result = <T>(req: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

export function idbKV(): KV {
  let db: Promise<IDBDatabase> | undefined;
  const get_db = () => (db ??= open());
  return {
    async get(key) {
      const store = (await get_db()).transaction(STORE).objectStore(STORE);
      return (await result(store.get(key))) as string | undefined;
    },
    async list(prefix) {
      const store = (await get_db()).transaction(STORE).objectStore(STORE);
      const range = IDBKeyRange.bound(prefix, prefix + "\uffff");
      const [keys, vals] = await Promise.all([result(store.getAllKeys(range)), result(store.getAll(range))]);
      return keys.map((k, i) => [String(k), vals[i] as string]);
    },
    async write(puts, opts) {
      const tx = (await get_db()).transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      if (opts?.clear) store.clear();
      for (const [k, v] of Object.entries(puts)) store.put(v, k);
      await done(tx);
    },
  };
}
