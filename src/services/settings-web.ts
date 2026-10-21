import { openDB, DBSchema, IDBPDatabase } from 'idb';

/**
 * Security-hardened settings service using encrypted IndexedDB.
 * 
 * Security features:
 * - AES-GCM 256-bit encryption via Web Crypto API
 * - PBKDF2-SHA256 key derivation with 250,000 iterations
 * - Random 256-bit salt per key stored alongside ciphertext
 * - Auto-lock after 10 minutes of inactivity
 * - Master-password validation (min 12 chars, common-password rejection)
 * - Closure-held typed password buffer cleared on lock, auto-lock, and unload
 * - No localStorage/sessionStorage usage
 */

// Common password list for strength checking (top 100 most common)
const COMMON_PASSWORDS = new Set([
  '123456', '123456789', 'qwerty', 'password', '12345678', '111111', '123123', '12345',
  '1234567890', 'qwerty123', '000000', '1q2w3e4r', 'abc123', 'password1', '1234567',
  '1234', '1234567890123456', 'iloveyou', '12345678901234', 'dragon', 'sunshine',
  'princess', 'letmein', '123456789012', 'welcome', 'shadow', 'monkey', '12345678901',
  'football', 'michael', 'charlie', 'superman', 'trustno1', '1234567890123', '654321',
  '123456789012345', '123321', 'jordan', 'harley', 'jennifer', '12345678901234567',
  'hunter', 'buster', 'soccer', 'killer', 'george', 'tigger', 'zxcvbn', 'cookie',
  'michelle', 'jessica', 'pepper', '123456789012345678', 'daniel', 'access', '1234567890123456789',
  'maggie', '12345678901234567890', '123456789012345678901', 'andrea', 'amanda', '1234567890123456789012',
  'melissa', '12345678901234567890123', '123456789012345678901234', 'ashley', '1234567890123456789012345',
  'mickey', '12345678901234567890123456', '123456789012345678901234567', 'starwars', '1234567890123456789012345678',
  'bailey', '12345678901234567890123456789', '123456789012345678901234567890', 'passw0rd', '1234567890123456789012345678901',
  'master', '12345678901234567890123456789012', 'hello', '123456789012345678901234567890123', 'freedom', 'whatever',
  'qazwsx', '1234567890123456789012345678901234', 'trustno1', '12345678901234567890123456789012345',
]);

interface EncryptedValue {
  iv: Uint8Array;
  ciphertext: Uint8Array;
  salt: Uint8Array;
}

interface SettingsDBSchema extends DBSchema {
  settings: {
    key: string;
    value: EncryptedValue;
  };
}

const PBKDF2_ITERATIONS = 250_000;
const KEY_LENGTH = 256; // bits
const IV_LENGTH = 12; // bytes for AES-GCM
const SALT_LENGTH = 32; // bytes (256 bits)
const AUTO_LOCK_MS = 10 * 60 * 1000; // 10 minutes
const MIN_MASTER_PASSWORD_LENGTH = 12;
const STORE_LOCKED_MESSAGE = 'Store is locked';

function isSecureContext(): boolean {
  return typeof window !== 'undefined' && window.isSecureContext === true;
}

function hasWebCrypto(): boolean {
  return typeof window !== 'undefined' && !!window.crypto?.subtle;
}

function getWebCrypto(): Crypto {
  if (!isSecureContext() || !hasWebCrypto()) {
    throw new Error('A secure context with Web Crypto is required for encrypted settings');
  }
  return window.crypto;
}

function validateMasterPassword(password: string): void {
  if (typeof password !== 'string' || password.length < MIN_MASTER_PASSWORD_LENGTH) {
    throw new Error(`Password must be at least ${MIN_MASTER_PASSWORD_LENGTH} characters`);
  }
  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    throw new Error('Password is too common, please choose a stronger one');
  }
}

async function deriveKey(
  passwordBytes: Uint8Array,
  salt: Uint8Array,
  assertSessionActive: () => void,
): Promise<CryptoKey> {
  const crypto = getWebCrypto();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    passwordBytes,
    'PBKDF2',
    false,
    ['deriveKey']
  );
  assertSessionActive();

  const key = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: KEY_LENGTH },
    false,
    ['encrypt', 'decrypt']
  );
  assertSessionActive();
  return key;
}

async function encryptValue(
  value: string,
  passwordBytes: Uint8Array,
  assertSessionActive: () => void,
): Promise<EncryptedValue> {
  const crypto = getWebCrypto();
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const key = await deriveKey(passwordBytes, salt, assertSessionActive);
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const data = new TextEncoder().encode(value);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    data
  );
  assertSessionActive();

  return {
    iv,
    ciphertext: new Uint8Array(ciphertext),
    salt,
  };
}

async function decryptValue(
  encrypted: EncryptedValue,
  passwordBytes: Uint8Array,
  assertSessionActive: () => void,
): Promise<string | null> {
  const crypto = getWebCrypto();
  try {
    const key = await deriveKey(passwordBytes, encrypted.salt, assertSessionActive);
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: encrypted.iv },
      key,
      encrypted.ciphertext
    );
    assertSessionActive();
    return new TextDecoder().decode(decrypted);
  } catch (error) {
    if (error instanceof Error && error.message === STORE_LOCKED_MESSAGE) {
      throw error;
    }
    // Wrong password or corrupted ciphertext. Secure-context failures happen before this catch.
    return null;
  }
}

function arrayBufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function encryptedValueToStorable(encrypted: EncryptedValue): Record<string, string> {
  return {
    iv: arrayBufferToBase64(encrypted.iv),
    ciphertext: arrayBufferToBase64(encrypted.ciphertext),
    salt: arrayBufferToBase64(encrypted.salt),
  };
}

function storableToEncryptedValue(storable: Record<string, string>): EncryptedValue {
  return {
    iv: base64ToArrayBuffer(storable.iv),
    ciphertext: base64ToArrayBuffer(storable.ciphertext),
    salt: base64ToArrayBuffer(storable.salt),
  };
}

export interface SettingsStoreWeb {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
  clear(): Promise<void>;
  has(key: string): Promise<boolean>;
  isEncryptionAvailable(): Promise<boolean>;
  isLocked(): boolean;
  lock(): void;
  unlock(password: string): Promise<void>;
  migrateFromElectron(electronData: unknown): Promise<{ success: boolean; reason?: string }>;
}

export function createSettingsStoreWeb(options: {
  dbName?: string;
  storeName?: string;
} = {}): SettingsStoreWeb {
  const dbName = options.dbName ?? 'estudiaia-settings';
  const storeName = options.storeName ?? 'settings';

  let db: IDBPDatabase<SettingsDBSchema> | null = null;
  let dbPromise: Promise<IDBPDatabase<SettingsDBSchema>> | null = null;
  let locked = true;
  let sessionPassword: Uint8Array | null = null;
  let autoLockTimer: ReturnType<typeof setTimeout> | null = null;
  let sessionExpiresAt: number | null = null;
  let sessionEpoch = 0;
  const activeWriteTransactions = new Set<{ abort(): void }>();

  async function getDB(): Promise<IDBPDatabase<SettingsDBSchema>> {
    if (db) return db;
    if (!dbPromise) {
      dbPromise = (async () => {
        const existingDatabase = await openDB<SettingsDBSchema>(dbName);
        if (existingDatabase.objectStoreNames.contains(storeName)) {
          return existingDatabase;
        }

        const nextVersion = existingDatabase.version + 1;
        existingDatabase.close();
        return openDB<SettingsDBSchema>(dbName, nextVersion, {
          upgrade(database) {
            if (!database.objectStoreNames.contains(storeName)) {
              database.createObjectStore(storeName);
            }
          },
        });
      })().then((database) => {
        db = database;
        return database;
      }).catch((error) => {
        dbPromise = null;
        throw error;
      });
    }
    return dbPromise;
  }

  function scheduleAutoLock(): void {
    if (autoLockTimer) {
      clearTimeout(autoLockTimer);
    }
    if (locked || sessionExpiresAt === null) {
      autoLockTimer = null;
      return;
    }

    autoLockTimer = setTimeout(() => {
      autoLockTimer = null;
      if (locked) return;
      if (sessionExpiresAt !== null && Date.now() >= sessionExpiresAt) {
        lock();
        return;
      }
      scheduleAutoLock();
    }, Math.max(0, sessionExpiresAt - Date.now()));
  }

  function resetAutoLock(): void {
    if (locked || !sessionPassword) return;
    sessionExpiresAt = Date.now() + AUTO_LOCK_MS;
    scheduleAutoLock();
  }

  function clearSessionPassword(): void {
    if (sessionPassword) {
      // Best effort only: JavaScript cannot guarantee memory zeroisation.
      sessionPassword.fill(0);
      sessionPassword = null;
    }
  }

  function lock(): void {
    sessionEpoch += 1;
    locked = true;
    sessionExpiresAt = null;
    for (const transaction of activeWriteTransactions) {
      try {
        transaction.abort();
      } catch {
        // A transaction that already completed cannot be aborted.
      }
    }
    clearSessionPassword();
    if (autoLockTimer) {
      clearTimeout(autoLockTimer);
      autoLockTimer = null;
    }
  }

  function expireSessionIfNeeded(): void {
    if (!locked && sessionExpiresAt !== null && Date.now() >= sessionExpiresAt) {
      lock();
    }
  }

  function requireActiveSession(): { password: Uint8Array; epoch: number } {
    expireSessionIfNeeded();
    if (locked || !sessionPassword) {
      throw new Error(STORE_LOCKED_MESSAGE);
    }
    return { password: sessionPassword, epoch: sessionEpoch };
  }

  function assertActiveSession(epoch: number): void {
    const session = requireActiveSession();
    if (session.epoch !== epoch) {
      throw new Error(STORE_LOCKED_MESSAGE);
    }
  }

  function assertUnlockStillCurrent(epoch: number): void {
    if (sessionEpoch !== epoch || !locked) {
      throw new Error(STORE_LOCKED_MESSAGE);
    }
  }

  async function commitWrite(
    session: { password: Uint8Array; epoch: number },
    operation: (store: {
      put(value: EncryptedValue, key: string): Promise<unknown>;
      delete(key: string): Promise<void>;
      clear(): Promise<void>;
    }) => Promise<unknown>,
  ): Promise<void> {
    const database = await getDB();
    // Revalidate before creating a readwrite transaction and again before its commit boundary.
    assertActiveSession(session.epoch);
    const transaction = database.transaction(storeName, 'readwrite') as unknown as {
      abort(): void;
      commit(): void;
      done: Promise<void>;
      store: {
        put(value: EncryptedValue, key: string): Promise<unknown>;
        delete(key: string): Promise<void>;
        clear(): Promise<void>;
      };
    };
    activeWriteTransactions.add(transaction);
    const transactionCompletion = transaction.done;
    // Lock can abort before a delayed request settles; observe completion now so
    // its AbortError cannot become an unhandled rejection while awaiting the request.
    void transactionCompletion.catch(() => undefined);

    try {
      assertActiveSession(session.epoch);
      await operation(transaction.store);
      // This is the final cancellation point: lock/expiry aborts tracked transactions
      // until the session has been revalidated and this explicit commit begins.
      assertActiveSession(session.epoch);
      transaction.commit();
      await transactionCompletion;
      assertActiveSession(session.epoch);
    } catch (error) {
      // An abort caused by lock/expiry must surface as a locked-session failure.
      assertActiveSession(session.epoch);
      throw error;
    } finally {
      activeWriteTransactions.delete(transaction);
    }
  }

  async function unlock(password: string): Promise<void> {
    if (!isLocked()) {
      resetAutoLock();
      return;
    }

    const unlockEpoch = sessionEpoch;
    getWebCrypto();
    validateMasterPassword(password);
    const candidatePassword = new TextEncoder().encode(password);
    let activated = false;

    try {
      const database = await getDB();
      assertUnlockStillCurrent(unlockEpoch);
      const keys = await database.getAllKeys(storeName);
      assertUnlockStillCurrent(unlockEpoch);
      for (const key of keys) {
        const encrypted = await database.get(storeName, key);
        assertUnlockStillCurrent(unlockEpoch);
        if (encrypted && await decryptValue(
          encrypted,
          candidatePassword,
          () => assertUnlockStillCurrent(unlockEpoch),
        ) === null) {
          throw new Error('Invalid password');
        }
        assertUnlockStillCurrent(unlockEpoch);
      }

      assertUnlockStillCurrent(unlockEpoch);
      sessionPassword = candidatePassword;
      locked = false;
      resetAutoLock();
      activated = true;
    } catch (error) {
      if (!activated) {
        candidatePassword.fill(0);
      }
      if (sessionEpoch === unlockEpoch && locked) {
        lock();
      }
      throw error;
    }
  }

  function isLocked(): boolean {
    expireSessionIfNeeded();
    return locked;
  }

  async function has(key: string): Promise<boolean> {
    const database = await getDB();
    return (await database.getKey(storeName, key)) !== undefined;
  }

  async function get(key: string): Promise<string | null> {
    const session = requireActiveSession();
    getWebCrypto();
    const database = await getDB();
    assertActiveSession(session.epoch);
    const encrypted = await database.get(storeName, key);
    assertActiveSession(session.epoch);
    if (!encrypted) {
      assertActiveSession(session.epoch);
      resetAutoLock();
      return null;
    }

    const value = await decryptValue(
      encrypted,
      session.password,
      () => assertActiveSession(session.epoch),
    );
    assertActiveSession(session.epoch);
    if (value === null) {
      lock();
      throw new Error('Encrypted setting could not be decrypted');
    }
    assertActiveSession(session.epoch);
    resetAutoLock();
    return value;
  }

  async function set(key: string, value: string): Promise<void> {
    const session = requireActiveSession();
    getWebCrypto();
    const encrypted = await encryptValue(
      value,
      session.password,
      () => assertActiveSession(session.epoch),
    );
    assertActiveSession(session.epoch);
    await commitWrite(session, (store) => store.put(encrypted, key));
    resetAutoLock();
  }

  async function remove(key: string): Promise<void> {
    const session = requireActiveSession();
    getWebCrypto();
    await commitWrite(session, (store) => store.delete(key));
    resetAutoLock();
  }

  async function clear(): Promise<void> {
    const session = requireActiveSession();
    getWebCrypto();
    await commitWrite(session, (store) => store.clear());
    resetAutoLock();
  }

  async function isEncryptionAvailable(): Promise<boolean> {
    return isSecureContext() && hasWebCrypto();
  }

  async function migrateFromElectron(_electronData: unknown): Promise<{ success: boolean; reason?: string }> {
    return { success: false, reason: 'requires-electron-safeStorage' };
  }

  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('beforeunload', lock);
  }

  return {
    get,
    set,
    remove,
    clear,
    has,
    isEncryptionAvailable,
    isLocked,
    lock,
    unlock,
    migrateFromElectron,
  };
}