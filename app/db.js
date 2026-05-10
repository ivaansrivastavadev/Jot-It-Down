/**
 * Database Module - IndexedDB wrapper for note management
 * File: /app/db.js
 */

class NoteDB {
    constructor() {
        this.dbName = 'JotItDownDB';
        this.storeName = 'notes';
        this.version = 1;
        this.db = null;
    }

    /**
     * Initialize the IndexedDB database
     */
    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);

            request.onerror = () => {
                console.error('Database failed to open');
                reject(request.error);
            };

            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(this.storeName)) {
                    const objectStore = db.createObjectStore(this.storeName, { keyPath: 'id' });
                    objectStore.createIndex('created', 'created', { unique: false });
                    objectStore.createIndex('isPinned', 'isPinned', { unique: false });
                }
            };

            request.onsuccess = () => {
                this.db = request.result;
                console.log('Database opened successfully');
                resolve(this.db);
            };
        });
    }

    /**
     * Add or update a note
     */
    async saveNote(note) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const objectStore = transaction.objectStore(this.storeName);

            const noteData = {
                id: note.id || this.generateId(),
                title: note.title,
                content: note.content,
                isPinned: note.isPinned || false,
                created: note.created || Date.now(),
                modified: Date.now(),
            };

            const request = note.id 
                ? objectStore.put(noteData) 
                : objectStore.add(noteData);

            request.onsuccess = () => resolve(noteData);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Get all notes sorted by pinned status and modification date
     */
    async getAllNotes() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const objectStore = transaction.objectStore(this.storeName);
            const request = objectStore.getAll();

            request.onsuccess = () => {
                const notes = request.result;
                // Sort by pinned first, then by modified date (newest first)
                notes.sort((a, b) => {
                    if (a.isPinned !== b.isPinned) {
                        return b.isPinned - a.isPinned;
                    }
                    return b.modified - a.modified;
                });
                resolve(notes);
            };
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Get a single note by ID
     */
    async getNoteById(id) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const objectStore = transaction.objectStore(this.storeName);
            const request = objectStore.get(id);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Search notes by title or content
     */
    async searchNotes(query) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const objectStore = transaction.objectStore(this.storeName);
            const request = objectStore.getAll();

            request.onsuccess = () => {
                const notes = request.result;
                const filtered = notes.filter(note =>
                    note.title.toLowerCase().includes(query.toLowerCase()) ||
                    note.content.toLowerCase().includes(query.toLowerCase())
                );
                
                // Sort by pinned first, then by modified date
                filtered.sort((a, b) => {
                    if (a.isPinned !== b.isPinned) {
                        return b.isPinned - a.isPinned;
                    }
                    return b.modified - a.modified;
                });
                
                resolve(filtered);
            };
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Delete a note by ID
     */
    async deleteNote(id) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const objectStore = transaction.objectStore(this.storeName);
            const request = objectStore.delete(id);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Delete all notes
     */
    async deleteAllNotes() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const objectStore = transaction.objectStore(this.storeName);
            const request = objectStore.clear();

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Generate unique ID
     */
    generateId() {
        return `note_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
}

// Initialize database instance
const db = new NoteDB();
