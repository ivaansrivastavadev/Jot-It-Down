/**
 * Jot It Down - Hierarchical Bullet Note App
 * Material You Dark Theme
 * File: /app/minimal.js
 */

class BulletApp {
    constructor() {
        this.root = {
            id: 'root',
            text: 'Home',
            children: [],
            collapsed: false
        };
        this.currentDocument = null;
        this.focusedBulletId = null;
        this.focusStack = ['root']; // Stack of focused bullet IDs for zoom
    }

    async init() {
        try {
            await db.init();
            await this.loadDefaultDocument();
            this.setupEventListeners();
            this.render();
            this.updateFocusPath();
        } catch (error) {
            console.error('Init error:', error);
        }
    }

    async loadDefaultDocument() {
        try {
            const docs = await db.getAllNotes();
            if (docs.length > 0) {
                this.currentDocument = docs[0];
                try {
                    const parsed = JSON.parse(this.currentDocument.content || '{}');
                    this.root = parsed.id ? parsed : { id: 'root', text: 'Home', children: [], collapsed: false };
                } catch (e) {
                    this.root = { id: 'root', text: 'Home', children: [], collapsed: false };
                }
            } else {
                // Create initial document with one empty bullet
                const initialBullet = {
                    id: this.generateId(),
                    text: '',
                    children: [],
                    collapsed: false
                };
                this.root = {
                    id: 'root',
                    text: 'Home',
                    children: [initialBullet],
                    collapsed: false
                };
                this.currentDocument = await db.saveNote({
                    title: 'Main Document',
                    content: JSON.stringify(this.root),
                    isPinned: false
                });
            }
        } catch (error) {
            console.error('Failed to load document:', error);
            const initialBullet = {
                id: this.generateId(),
                text: '',
                children: [],
                collapsed: false
            };
            this.root = {
                id: 'root',
                text: 'Home',
                children: [initialBullet],
                collapsed: false
            };
        }
    }

    setupEventListeners() {
        document.addEventListener('keydown', (e) => this.handleGlobalKeydown(e));
    }

    handleGlobalKeydown(e) {
        // Handle zoom with Ctrl+[ and Ctrl+]
        if (e.ctrlKey && e.key === '[') {
            e.preventDefault();
            this.zoomIn();
            return;
        }

        if (e.ctrlKey && e.key === ']') {
            e.preventDefault();
            this.zoomOut();
            return;
        }

        // Handle arrow navigation
        if (e.key === 'ArrowUp' && e.target.classList.contains('bullet-input')) {
            e.preventDefault();
            this.navigateUp();
            return;
        }

        if (e.key === 'ArrowDown' && e.target.classList.contains('bullet-input')) {
            e.preventDefault();
            this.navigateDown();
            return;
        }

        // Only handle other keys if target is an input
        if (!e.target.classList.contains('bullet-input')) return;

        const bulletId = e.target.dataset.bulletId;
        const bullet = this.findBulletById(bulletId);
        
        if (!bullet) return;

        if (e.key === 'Tab') {
            e.preventDefault();
            if (e.shiftKey) {
                this.unindent(bullet);
            } else {
                this.indent(bullet);
            }
            this.saveCurrent();
            this.render(() => {
                this.focusInput(bulletId);
            });
            return;
        }

        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            const input = e.target;
            const cursorPos = input.selectionStart;
            const textAfterCursor = bullet.text.substring(cursorPos);
            
            bullet.text = bullet.text.substring(0, cursorPos);

            const newBullet = {
                id: this.generateId(),
                text: textAfterCursor,
                children: [],
                collapsed: false
            };

            const parentAndIndex = this.findBulletParent(bullet);
            if (parentAndIndex) {
                const index = parentAndIndex.parent.children.indexOf(bullet);
                parentAndIndex.parent.children.splice(index + 1, 0, newBullet);
            }

            this.saveCurrent();
            this.render(() => {
                this.focusInput(newBullet.id);
            });
            return;
        }

        if (e.key === 'Backspace') {
            const input = e.target;
            const isAtStart = input.selectionStart === 0;
            const isEmpty = bullet.text === '';

            if (isAtStart && isEmpty) {
                e.preventDefault();
                const parentAndIndex = this.findBulletParent(bullet);
                
                if (parentAndIndex && parentAndIndex.parent.children.length > 1) {
                    // Delete this bullet if there are others
                    if (parentAndIndex.index > 0) {
                        const prevBullet = parentAndIndex.parent.children[parentAndIndex.index - 1];
                        prevBullet.children.push(...bullet.children);
                        parentAndIndex.parent.children.splice(parentAndIndex.index, 1);
                        
                        this.saveCurrent();
                        this.render(() => {
                            this.focusInput(prevBullet.id);
                        });
                    }
                }
                return;
            }

            if (isAtStart && !isEmpty && input.selectionStart === input.selectionEnd) {
                e.preventDefault();
                const parentAndIndex = this.findBulletParent(bullet);
                
                if (parentAndIndex && parentAndIndex.index > 0) {
                    const prevBullet = parentAndIndex.parent.children[parentAndIndex.index - 1];
                    const cursorPos = prevBullet.text.length;
                    prevBullet.text += bullet.text;
                    prevBullet.children.push(...bullet.children);
                    parentAndIndex.parent.children.splice(parentAndIndex.index, 1);
                    
                    this.saveCurrent();
                    this.render(() => {
                        this.focusInput(prevBullet.id);
                        setTimeout(() => {
                            const inp = document.querySelector(`[data-bullet-id="${prevBullet.id}"]`);
                            if (inp) inp.setSelectionRange(cursorPos, cursorPos);
                        }, 0);
                    });
                }
                return;
            }
        }
    }

     navigateUp() {
         const focusedBullet = this.getFocusedBullet();
         if (!focusedBullet || !focusedBullet.children) return;

         const children = focusedBullet.children;
         if (children.length === 0) return;

         // Find current focused input
         const currentInput = document.querySelector('.bullet-input:focus');
         if (!currentInput) {
             // No input focused, focus first
             this.focusInput(children[0].id);
             return;
         }

         const currentBulletId = currentInput.dataset.bulletId;
         const currentIndex = children.findIndex(b => b.id === currentBulletId);

         if (currentIndex > 0) {
             this.focusInput(children[currentIndex - 1].id);
         } else if (currentIndex === 0) {
             // At first bullet, try to focus previous sibling or parent
             const parentAndIndex = this.findBulletParent(focusedBullet);
             if (parentAndIndex && parentAndIndex.index > 0) {
                 const prevSibling = parentAndIndex.parent.children[parentAndIndex.index - 1];
                 this.focusInput(prevSibling.id);
             }
         }
     }

     navigateDown() {
         const focusedBullet = this.getFocusedBullet();
         if (!focusedBullet || !focusedBullet.children) return;

         const children = focusedBullet.children;
         if (children.length === 0) return;

         // Find current focused input
         const currentInput = document.querySelector('.bullet-input:focus');
         if (!currentInput) {
             // No input focused, focus first
             this.focusInput(children[0].id);
             return;
         }

         const currentBulletId = currentInput.dataset.bulletId;
         const currentIndex = children.findIndex(b => b.id === currentBulletId);

         if (currentIndex < children.length - 1) {
             this.focusInput(children[currentIndex + 1].id);
         } else if (currentIndex === children.length - 1) {
             // At last bullet, try to focus next sibling
             const parentAndIndex = this.findBulletParent(focusedBullet);
             if (parentAndIndex && parentAndIndex.index < parentAndIndex.parent.children.length - 1) {
                 const nextSibling = parentAndIndex.parent.children[parentAndIndex.index + 1];
                 this.focusInput(nextSibling.id);
             }
         }
     }

    zoomIn() {
        // Zoom into the currently focused bullet
        if (this.focusedBulletId && this.focusedBulletId !== 'root') {
            this.focusStack.push(this.focusedBulletId);
            this.render();
            this.updateFocusPath();
        }
    }

    zoomOut() {
        // Zoom out to parent
        if (this.focusStack.length > 1) {
            this.focusStack.pop();
            this.render();
            this.updateFocusPath();
        }
    }

    getFocusedBullet() {
        // Get the currently focused bullet (the last one in the stack)
        const focusId = this.focusStack[this.focusStack.length - 1];
        return this.findBulletById(focusId);
    }

     updateFocusPath() {
         const pathBar = document.getElementById('focusPath');
         const titleElement = document.getElementById('focusedTitle');
         
         // Clear and rebuild
         pathBar.innerHTML = '';
         
         for (let i = 0; i < this.focusStack.length; i++) {
             const bulletId = this.focusStack[i];
             const bullet = this.findBulletById(bulletId);
             
             if (bullet) {
                 const displayText = bullet.text || (bulletId === 'root' ? 'Home' : 'Untitled');
                 
                 if (i > 0) {
                     const sep = document.createTextNode(' / ');
                     pathBar.appendChild(sep);
                 }
                 
                 if (i === this.focusStack.length - 1) {
                     // Current focus - not clickable
                     const current = document.createTextNode(displayText);
                     pathBar.appendChild(current);
                 } else {
                     // Parent - clickable
                     const span = document.createElement('span');
                     span.className = 'focus-path-item';
                     span.textContent = displayText;
                     const targetIndex = i;
                     span.onclick = () => {
                         this.focusStack = this.focusStack.slice(0, targetIndex + 1);
                         this.render();
                         this.updateFocusPath();
                     };
                     pathBar.appendChild(span);
                 }
             }
         }
         
         // Update H2 title - show current focused bullet text, or "Home" if at root
         const currentBullet = this.getFocusedBullet();
         if (currentBullet) {
             if (currentBullet.id === 'root') {
                 titleElement.textContent = 'Home';
             } else {
                 titleElement.textContent = currentBullet.text || 'Untitled';
             }
         }
     }

    indent(bullet) {
        const parentAndIndex = this.findBulletParent(bullet);
        if (!parentAndIndex || parentAndIndex.index === 0) {
            return;
        }

        const prevBullet = parentAndIndex.parent.children[parentAndIndex.index - 1];
        parentAndIndex.parent.children.splice(parentAndIndex.index, 1);
        prevBullet.children.push(bullet);
        prevBullet.collapsed = false;
    }

    unindent(bullet) {
        const parentAndIndex = this.findBulletParent(bullet);
        if (!parentAndIndex || parentAndIndex.parent.id === 'root') {
            return;
        }

        const parent = parentAndIndex.parent;
        const grandParentAndIndex = this.findBulletParent(parent);
        
        if (!grandParentAndIndex) return;

        const indexInParent = parent.children.indexOf(bullet);
        parent.children.splice(indexInParent, 1);
        
        const indexInGrandParent = grandParentAndIndex.parent.children.indexOf(parent);
        grandParentAndIndex.parent.children.splice(indexInGrandParent + 1, 0, bullet);
    }

     findBulletById(id, node = this.root) {
         if (node.id === id) return node;
         
         if (node.children) {
             for (let child of node.children) {
                 const result = this.findBulletById(id, child);
                 if (result) return result;
             }
         }
         return null;
     }

     findPathToId(targetId, node = this.root, path = []) {
         // Recursively find the full path from root to a bullet
         path.push(node.id);
         
         if (node.id === targetId) {
             return path;
         }
         
         if (node.children) {
             for (let child of node.children) {
                 const result = this.findPathToId(targetId, child, [...path]);
                 if (result) return result;
             }
         }
         return null;
     }

     findBulletParent(bullet, node = this.root) {
         if (!node.children) return null;
         
         for (let i = 0; i < node.children.length; i++) {
             if (node.children[i].id === bullet.id) {
                 return { parent: node, index: i };
             }
             const result = this.findBulletParent(bullet, node.children[i]);
             if (result) return result;
         }
         return null;
     }

    createBulletElement(bullet, level = 0) {
        const hasChildren = bullet.children && bullet.children.length > 0;
        const isCollapsed = bullet.collapsed;

        const div = document.createElement('div');
        div.className = 'bullet-item';

        const content = document.createElement('div');
        content.className = 'bullet-content';

        // Toggle button (only if has children)
        if (hasChildren) {
            const toggle = document.createElement('button');
            toggle.className = `toggle-children ${isCollapsed ? 'hidden' : ''}`;
            toggle.textContent = '▼';
            toggle.dataset.bulletId = bullet.id;
            toggle.onclick = (e) => {
                e.stopPropagation();
                bullet.collapsed = !bullet.collapsed;
                this.saveCurrent();
                this.render();
            };
            content.appendChild(toggle);
        } else {
            const spacer = document.createElement('div');
            spacer.style.width = '16px';
            spacer.style.flexShrink = '0';
            content.appendChild(spacer);
        }

        // Bullet marker
        const marker = document.createElement('span');
        marker.className = 'bullet-marker';
        marker.textContent = '•';
        marker.style.cursor = 'pointer';
        marker.onclick = () => {
            this.focusOnBullet(bullet);
        };
        content.appendChild(marker);

        // Input field - single line, inline
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'bullet-input';
        input.value = bullet.text;
        input.placeholder = 'Type here...';
        input.dataset.bulletId = bullet.id;
        
        input.addEventListener('input', (e) => {
            bullet.text = input.value;
            
            // Debounce save
            clearTimeout(this.saveTimeout);
            this.saveTimeout = setTimeout(() => this.saveCurrent(), 500);
        });

        input.addEventListener('focus', () => {
            this.focusedBulletId = bullet.id;
        });

        input.addEventListener('blur', () => {
            this.focusedBulletId = null;
        });

        // Click on bullet to focus
        input.addEventListener('click', (e) => {
            e.stopPropagation();
        });

        content.appendChild(input);
        div.appendChild(content);

        // Children container - indented
        if (hasChildren && !isCollapsed) {
            const childrenDiv = document.createElement('div');
            childrenDiv.className = 'bullet-children';
            childrenDiv.style.marginLeft = `${level * 16 + 16}px`;
            bullet.children.forEach(child => {
                childrenDiv.appendChild(this.createBulletElement(child, level + 1));
            });
            div.appendChild(childrenDiv);
        }

        return div;
    }

     focusOnBullet(bullet) {
         // When clicking on a bullet marker, zoom into it with full path from root
         const path = this.findPathToId(bullet.id);
         if (path) {
             this.focusStack = path;
         } else {
             // Fallback: just push the bullet id
             this.focusStack.push(bullet.id);
         }
         this.render();
         this.updateFocusPath();
     }

    focusInput(bulletId) {
        setTimeout(() => {
            const input = document.querySelector(`[data-bullet-id="${bulletId}"]`);
            if (input) {
                input.focus();
                input.setSelectionRange(input.value.length, input.value.length);
            }
        }, 0);
    }

    render(callback) {
        const container = document.getElementById('bulletsContainer');
        container.innerHTML = '';

        // Get the currently focused node
        const focusedBullet = this.getFocusedBullet();
        
        if (!focusedBullet) {
            this.focusStack = ['root'];
            this.render(callback);
            return;
        }

        const childrenToShow = focusedBullet.children || [];

        if (childrenToShow.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'empty-state-msg';
            empty.textContent = 'Click to add a bullet point';
            
            empty.addEventListener('click', () => {
                const newBullet = {
                    id: this.generateId(),
                    text: '',
                    children: [],
                    collapsed: false
                };
                focusedBullet.children.push(newBullet);
                this.saveCurrent();
                this.render(() => {
                    this.focusInput(newBullet.id);
                });
            });
            
            container.appendChild(empty);
        } else {
            childrenToShow.forEach(bullet => {
                container.appendChild(this.createBulletElement(bullet, 0));
            });
        }

        if (callback) callback();
    }

    async saveCurrent() {
        if (this.currentDocument) {
            this.currentDocument.content = JSON.stringify(this.root);
            try {
                await db.saveNote(this.currentDocument);
            } catch (error) {
                console.error('Failed to save:', error);
            }
        }
    }

    generateId() {
        return `bullet_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    }
}

// Initialize app
let app;
document.addEventListener('DOMContentLoaded', async () => {
    app = new BulletApp();
    await app.init();
    
    // Setup WIP indicator
    const wipIndicator = document.querySelector('.wip-indicator');
    if (wipIndicator) {
        wipIndicator.addEventListener('click', () => {
            wipIndicator.classList.add('hidden');
        });
    }
});
