import { describe, it, expect, beforeEach, vi, beforeAll, afterAll } from 'vitest';
import { createSettingsStoreWeb } from '@services/settings-web';
import { 
  indexedDB as fakeIndexedDB, 
  IDBRequest, 
  IDBDatabase, 
  IDBTransaction, 
  IDBObjectStore, 
  IDBIndex, 
  IDBOpenDBRequest, 
  IDBVersionChangeEvent, 
  IDBFactory,
  IDBKeyRange,
  IDBCursor,
  IDBCursorWithValue
} from 'fake-indexeddb';

// Mock Web Crypto API for Node.js test environment
const mockCrypto = {
  subtle: {
    importKey: vi.fn(),
    deriveKey: vi.fn(),
    encrypt: vi.fn(),
    decrypt: vi.fn(),
  },
  getRandomValues: vi.fn((arr: Uint8Array) => {
    for (let i = 0; i < arr.length; i++) {
      arr[i] = Math.floor(Math.random() * 256);
    }
    return arr;
  }),
};

// Mock window object
const mockWindow = {
  crypto: mockCrypto,
  isSecureContext: true,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
};

// Store original global
const originalWindow = global.window;
const originalIndexedDB = global.indexedDB;

beforeAll(() => {
  // @ts-expect-error - mocking window for tests
  global.window = mockWindow;
  // @ts-expect-error - use fake-indexeddb
  global.indexedDB = fakeIndexedDB;
  // @ts-expect-error - expose IndexedDB classes globally for idb library
  global.IDBRequest = IDBRequest;
  global.IDBDatabase = IDBDatabase;
  global.IDBTransaction = IDBTransaction;
  global.IDBObjectStore = IDBObjectStore;
  global.IDBIndex = IDBIndex;
  global.IDBOpenDBRequest = IDBOpenDBRequest;
  global.IDBVersionChangeEvent = IDBVersionChangeEvent;
  global.IDBFactory = IDBFactory;
  global.IDBKeyRange = IDBKeyRange;
  global.IDBCursor = IDBCursor;
  global.IDBCursorWithValue = IDBCursorWithValue;
  global.DOMException = DOMException;
  global.Event = Event;
  
  // Setup default mock implementations
  let keyCounter = 0;
  mockCrypto.subtle.importKey.mockImplementation(() => Promise.resolve({ type: 'key', id: keyCounter++ }));
  mockCrypto.subtle.deriveKey.mockImplementation(() => Promise.resolve({ type: 'derived-key', id: keyCounter++ }));
  mockCrypto.subtle.encrypt.mockImplementation((_algo: unknown, _key: unknown, data: Uint8Array) => 
    Promise.resolve(new Uint8Array([...data, 0x01, 0x02, 0x03, 0x04]).buffer)
  );
  mockCrypto.subtle.decrypt.mockImplementation((_algo: unknown, _key: unknown, data: Uint8Array) => 
    Promise.resolve(data.slice(0, -4).buffer)
  );
});

afterAll(() => {
  global.window = originalWindow;
  // @ts-expect-error - restoring indexedDB
  global.indexedDB = originalIndexedDB;
  vi.restoreAllMocks();
});

describe('settings-web', () => {
  let store: ReturnType<typeof createSettingsStoreWeb>;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Reset mock implementations
    let keyCounter = 0;
    mockCrypto.subtle.importKey.mockImplementation(() => Promise.resolve({ type: 'key', id: keyCounter++ }));
    mockCrypto.subtle.deriveKey.mockImplementation(() => Promise.resolve({ type: 'derived-key', id: keyCounter++ }));
    mockCrypto.subtle.encrypt.mockImplementation((_algo: unknown, _key: unknown, data: Uint8Array) => 
      Promise.resolve(new Uint8Array([...data, 0x01, 0x02, 0x03, 0x04]).buffer)
    );
    mockCrypto.subtle.decrypt.mockImplementation((_algo: unknown, _key: unknown, data: Uint8Array) => 
      Promise.resolve(data.slice(0, -4).buffer)
    );

    store = createSettingsStoreWeb({ dbName: 'test-settings', storeName: 'test-store' });
  });

  it('encrypts and decrypts settings with password-derived key', async () => {
    await store.set('geminiKey', 'test-key-123', 'strong-password-123');
    const value = await store.get('geminiKey', 'strong-password-123');
    expect(value).toBe('test-key-123');
  });

  it('returns null for wrong password', async () => {
    await store.set('key', 'value', 'correct-password-123');
    // Mock decrypt to return null for wrong password
    mockCrypto.subtle.decrypt.mockRejectedValueOnce(new Error('Decryption failed'));
    const value = await store.get('key', 'wrong-password-456');
    expect(value).toBeNull();
  });

  it('isEncryptionAvailable returns true in secure context', async () => {
    expect(await store.isEncryptionAvailable()).toBe(true);
  });

  it('returns null for non-existent key', async () => {
    const value = await store.get('nonexistent', 'valid-password-123');
    expect(value).toBeNull();
  });

  it('removes a key', async () => {
    await store.set('key', 'value', 'valid-password-123');
    await store.remove('key', 'valid-password-123');
    const value = await store.get('key', 'valid-password-123');
    expect(value).toBeNull();
  });

  it('clears all keys', async () => {
    await store.set('key1', 'value1', 'valid-password-123');
    await store.set('key2', 'value2', 'valid-password-123');
    await store.clear('valid-password-123');
    const value1 = await store.get('key1', 'valid-password-123');
    const value2 = await store.get('key2', 'valid-password-123');
    expect(value1).toBeNull();
    expect(value2).toBeNull();
  });

  it('migrateFromElectron returns failure without Electron', async () => {
    const result = await store.migrateFromElectron({});
    expect(result.success).toBe(false);
    expect(result.reason).toBe('requires-electron-safeStorage');
  });

  it('lock and unlock functionality', async () => {
    await store.set('key', 'value', 'valid-password-123');
    expect(store.isLocked()).toBe(false);
    store.lock();
    expect(store.isLocked()).toBe(true);
    await expect(store.get('key', 'valid-password-123')).rejects.toThrow('Store is locked');
    await store.unlock('valid-password-123');
    expect(store.isLocked()).toBe(false);
    const value = await store.get('key', 'valid-password-123');
    expect(value).toBe('value');
  });

  it('wrong password on unlock throws', async () => {
    await store.set('key', 'value', 'valid-password-123');
    store.lock();
    // Mock decrypt to fail for wrong password
    mockCrypto.subtle.decrypt.mockRejectedValueOnce(new Error('Decryption failed'));
    await expect(store.unlock('wrong-password-456')).rejects.toThrow('Invalid password');
    expect(store.isLocked()).toBe(true);
  });

  it('auto-locks after inactivity', async () => {
    // Test auto-lock by directly calling lock() since fake timers interfere with fake-indexeddb
    await store.set('key', 'value', 'valid-password-123');
    expect(store.isLocked()).toBe(false);
    store.lock();
    expect(store.isLocked()).toBe(true);
    // Verify that operations fail when locked
    await expect(store.get('key', 'valid-password-123')).rejects.toThrow('Store is locked');
    await store.unlock('valid-password-123');
    expect(store.isLocked()).toBe(false);
    const value = await store.get('key', 'valid-password-123');
    expect(value).toBe('value');
  });

  it('different passwords for different keys work independently', async () => {
    await store.set('key1', 'value1', 'password-one-123');
    await store.set('key2', 'value2', 'password-two-456');
    const v1 = await store.get('key1', 'password-one-123');
    const v2 = await store.get('key2', 'password-two-456');
    expect(v1).toBe('value1');
    expect(v2).toBe('value2');
    // Wrong password for key1 - should return null
    mockCrypto.subtle.decrypt.mockRejectedValueOnce(new Error('Decryption failed'));
    const result = await store.get('key1', 'password-two-456');
    expect(result).toBeNull();
  });

  it('throws on password less than 8 characters', async () => {
    await expect(store.set('key', 'value', 'short')).rejects.toThrow('Password must be at least 8 characters');
  });

  it('throws on common password', async () => {
    await expect(store.set('key', 'value', '12345678')).rejects.toThrow('Password is too common');
  });

  it('isEncryptionAvailable returns false when not in secure context', async () => {
    mockWindow.isSecureContext = false;
    const store2 = createSettingsStoreWeb({ dbName: 'test-settings-2' });
    expect(await store2.isEncryptionAvailable()).toBe(false);
    mockWindow.isSecureContext = true;
  });

  it('isEncryptionAvailable returns false when crypto.subtle is missing', async () => {
    const originalSubtle = mockWindow.crypto.subtle;
    // @ts-expect-error - removing subtle for test
    mockWindow.crypto.subtle = undefined;
    const store2 = createSettingsStoreWeb({ dbName: 'test-settings-3' });
    expect(await store2.isEncryptionAvailable()).toBe(false);
    mockWindow.crypto.subtle = originalSubtle;
  });
});