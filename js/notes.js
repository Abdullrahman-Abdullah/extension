// Notes Widget - مستقل تماماً
document.addEventListener('DOMContentLoaded', function () {
    const notesWidget = document.getElementById('notes-widget');
    const notesDragHandle = document.getElementById('notesDragHandle');
    const notesList = document.getElementById('notesList');
    const addNoteBtn = document.getElementById('addNoteBtn');

    // عناصر المودال
    const modalBackdrop = document.getElementById('noteModalBackdrop');
    const modalTitle = document.getElementById('noteModalTitle');
    const noteTitleInput = document.getElementById('noteTitleInput');
    const noteContentInput = document.getElementById('noteContentInput');
    const saveNoteBtn = document.getElementById('saveNoteBtn');
    const cancelNoteBtn = document.getElementById('cancelNoteBtn');
    const closeModalBtn = document.getElementById('closeNoteModal');

    let notes = [];
    let currentNoteId = null;
    let highestZIndex = 0; // يبدأ من رقم عالي

    // تحميل الملاحظات المحفوظة
    loadNotes();

    // ===== نظام التحريك (مثل todo) =====
    if (notesWidget && notesDragHandle) {
        makeDraggable(notesWidget, notesDragHandle, 'notesPosition');
    }

    // رفع العنصر للأمام عند النقر
    if (notesWidget) {
        notesWidget.addEventListener('mousedown', function (e) {
            if (e.target.closest('.notes-drag-handle') ||
                e.target.closest('button') ||
                e.target.closest('input')) return;

            bringToFront(notesWidget);
        });
    }

    // ===== دوال التحريك =====
    function makeDraggable(element, handle, storageKey) {
        let isDragging = false;
        let startX, startY, startLeft, startTop;
        let longPressTimer;

        loadPosition(element, storageKey);

        handle.addEventListener('mousedown', startLongPress);
        handle.addEventListener('touchstart', startLongPress, { passive: false });

        handle.addEventListener('touchmove', (e) => {
            if (isDragging) {
                e.preventDefault();
                moveElement(e.touches[0], element);
            }
        }, { passive: false });

        handle.addEventListener('touchend', stopDrag);
        handle.addEventListener('touchcancel', stopDrag);

        document.addEventListener('mousemove', (e) => {
            if (isDragging) moveElement(e, element);
        });

        document.addEventListener('mouseup', stopDrag);

        function startLongPress(e) {
            e.preventDefault();
            longPressTimer = setTimeout(() => {
                startDrag(e, element);
            }, 100); // 100ms للتمييز بين النقر والسحب
        }

        function startDrag(e, el) {
            isDragging = true;
            el.classList.add('dragging');

            // رفع العنصر أثناء السحب
            if (window.LayerSystem) {
                LayerSystem.raise(element.id, 'drag');
            }

            const clientX = e.clientX || (e.touches && e.touches[0].clientX);
            const clientY = e.clientY || (e.touches && e.touches[0].clientY);

            if (clientX === undefined) return;

            const rect = el.getBoundingClientRect();

            startX = clientX;
            startY = clientY;
            startLeft = rect.left;
            startTop = rect.top;

            el.style.transition = 'none';
        }

        function moveElement(e, el) {
            if (!isDragging) return;

            e.preventDefault();


            const clientX = e.clientX || (e.touches && e.touches[0].clientX);
            const clientY = e.clientY || (e.touches && e.touches[0].clientY);

            if (clientX === undefined) return;

            const deltaX = clientX - startX;
            const deltaY = clientY - startY;

            let newLeft = startLeft + deltaX;
            let newTop = startTop + deltaY;

            const elWidth = el.offsetWidth;
            const elHeight = el.offsetHeight;
            const windowWidth = window.innerWidth;
            const windowHeight = window.innerHeight;

            newLeft = Math.max(5, Math.min(newLeft, windowWidth - elWidth - 5));
            newTop = Math.max(5, Math.min(newTop, windowHeight - elHeight - 5));

            el.style.left = newLeft + 'px';
            el.style.top = newTop + 'px';
            el.style.right = 'auto';
            el.style.bottom = 'auto';
        }

        function stopDrag() {
            if (longPressTimer) clearTimeout(longPressTimer);

            if (isDragging) {
                isDragging = false;
                element.classList.remove('dragging');
                element.style.transition = '';
                savePosition(element, storageKey);
            }
        }

        function savePosition(el, key) {
            const left = el.style.left;
            const top = el.style.top;
            if (left && top) {
                localStorage.setItem(key, JSON.stringify({ left, top }));
            }
        }

        function loadPosition(el, key) {
            try {
                const saved = localStorage.getItem(key);
                if (saved) {
                    const pos = JSON.parse(saved);
                    el.style.left = pos.left;
                    el.style.top = pos.top;
                    el.style.right = 'auto';
                    el.style.bottom = 'auto';
                }
            } catch (e) { }
        }
    }

    function bringToFront(element) {
        highestZIndex += 1;
        element.style.zIndex = highestZIndex;

        element.style.transition = 'transform 0.2s, box-shadow 0.2s';
        element.style.transform = 'scale(1.01)';
        element.style.boxShadow = '0 30px 60px -10px rgba(110, 231, 183, 0.3)';

        setTimeout(() => {
            element.style.transform = '';
            element.style.boxShadow = '';
        }, 200);
    }

    // ===== دوال الملاحظات =====
    function loadNotes() {
        try {
            const saved = localStorage.getItem('glass_notes');
            if (saved) {
                notes = JSON.parse(saved);
            } else {
                // ملاحظات تجريبية
                console.log('No saved notes found, initializing with sample notes.');
            }
        } catch (e) {
            notes = [];
        }
        renderNotes();
    }

    function saveNotes() {
        localStorage.setItem('glass_notes', JSON.stringify(notes));
        renderNotes();
    }

    function renderNotes() {
        if (!notesList) return;

        if (notes.length === 0) {
            notesList.innerHTML = `
            <div class="notes-empty">
                <i class="bi bi-journal-text"></i>
                <p>لا توجد ملاحظات</p>
                <p style="font-size: 0.8rem;">اضغط + لإضافة ملاحظة</p>
            </div>
        `;
            return;
        }

        // إنشاء العناصر بدون onclick
        notesList.innerHTML = notes.map(note => `
        <div class="note-card" data-id="${note.id}">
            <div class="note-title">${escapeHtml(note.title || 'بلا عنوان')}</div>
            <div class="note-preview">${escapeHtml(note.content || '')}</div>
            <div class="note-footer">
                <span class="note-date">${note.date || new Date().toLocaleDateString('ar-EG')}</span>
                <div class="note-actions">
                    <button class="note-edit-btn" data-id="${note.id}">
                        <i class="bi bi-pencil"></i>
                    </button>
                    <button class="note-delete-btn" data-id="${note.id}">
                        <i class="bi bi-trash3"></i>
                    </button>
                </div>
            </div>
        </div>
    `).join('');

        // إضافة الأحداث بعد إنشاء العناصر
        document.querySelectorAll('.note-edit-btn').forEach(btn => {
            btn.addEventListener('click', function (e) {
                e.stopPropagation();
                const id = parseInt(this.dataset.id);
                editNote(id);
            });
        });

        document.querySelectorAll('.note-delete-btn').forEach(btn => {
            btn.addEventListener('click', function (e) {
                e.stopPropagation();
                const id = parseInt(this.dataset.id);
                deleteNote(id);
            });
        });

        // إضافة حدث للنقر على البطاقة نفسها لتعديل سريع
        document.querySelectorAll('.note-card').forEach(card => {
            card.addEventListener('dblclick', function () {
                const id = parseInt(this.dataset.id);
                editNote(id);
            });
        });
    }

    // تعديل دوال editNote و deleteNote لتكون داخل النطاق
    function editNote(id) {
        const note = notes.find(n => n.id === id);
        if (note) {
            currentNoteId = id;
            noteTitleInput.value = note.title || '';
            noteContentInput.value = note.content || '';
            modalTitle.textContent = 'تعديل الملاحظة';
            modalBackdrop.classList.add('active');
            bringToFront(modalBackdrop);
        }
    }

    function deleteNote(id) {
        if (confirm('هل أنت متأكد من حذف هذه الملاحظة؟')) {
            notes = notes.filter(n => n.id !== id);
            saveNotes();
            // showToast('🗑️ تم حذف الملاحظة');
        }
    }

    // دوال عامة للوصول من الأزرار


    function openNewNoteModal() {
        currentNoteId = null;
        noteTitleInput.value = '';
        noteContentInput.value = '';
        modalTitle.textContent = 'ملاحظة جديدة';
        modalBackdrop.classList.add('active');
    }

    function closeNoteModal() {
        modalBackdrop.classList.remove('active');
    }

    function saveNote() {
        const title = noteTitleInput.value.trim();
        const content = noteContentInput.value.trim();

        if (!title && !content) {
            // showToast('⚠️ أدخل عنوان أو محتوى');
            return;
        }

        if (currentNoteId) {
            // تعديل
            const index = notes.findIndex(n => n.id === currentNoteId);
            if (index !== -1) {
                notes[index] = {
                    ...notes[index],
                    title: title || 'بلا عنوان',
                    content: content,
                    date: new Date().toLocaleDateString('ar-EG')
                };
            }
        } else {
            // إضافة جديدة
            notes.unshift({
                id: Date.now(),
                title: title || 'بلا عنوان',
                content: content,
                date: new Date().toLocaleDateString('ar-EG')
            });
        }

        saveNotes();
        closeNoteModal();
        // showToast(currentNoteId ? '✏️ تم التعديل' : '➕ تمت الإضافة');
    }

    function showToast(text) {
        const toast = document.createElement('div');
        toast.style.cssText = `
            position: fixed;
            bottom: 100px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(25, 30, 40, 0.95);
            backdrop-filter: blur(10px);
            border: 1px solid rgba(110, 231, 183, 0.3);
            border-radius: 40px;
            padding: 10px 24px;
            color: white;
            font-size: 0.9rem;
            box-shadow: 0 10px 30px rgba(0,0,0,0.3);
            z-index: 1000002;
            animation: fadeInOut 1.5s ease;
        `;
        toast.textContent = text;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 1500);
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // الأحداث
    if (addNoteBtn) addNoteBtn.addEventListener('click', openNewNoteModal);
    if (saveNoteBtn) saveNoteBtn.addEventListener('click', saveNote);
    if (cancelNoteBtn) cancelNoteBtn.addEventListener('click', closeNoteModal);
    if (closeModalBtn) closeModalBtn.addEventListener('click', closeNoteModal);

    // إغلاق المودال بالضغط خارج المحتوى
    if (modalBackdrop) {
        modalBackdrop.addEventListener('click', function (e) {
            if (e.target === modalBackdrop) closeNoteModal();
        });
    }

    // إضافة تأثيرات الحركة
    const style = document.createElement('style');
    style.textContent = `
        @keyframes fadeInOut {
            0% { opacity: 0; transform: translate(-50%, -30%); }
            15% { opacity: 1; transform: translate(-50%, -50%); }
            85% { opacity: 1; transform: translate(-50%, -50%); }
            100% { opacity: 0; transform: translate(-50%, -70%); }
        }
    `;
    document.head.appendChild(style);

    // بدء التطبيق
    renderNotes();
});

// في نهاية ملف notes.js
if (document.getElementById('notes-widget') && document.getElementById('notesResizeHandle')) {
    makeResizable(
        document.getElementById('notes-widget'),
        'notesResizeHandle',
        {
            minWidth: 260,
            minHeight: 280,
            maxWidth: 600,
            maxHeight: 700,
            onResizeStart: (el) => console.log('بدء تغيير حجم notes'),
            onResizeEnd: (el) => console.log('انتهاء تغيير حجم notes')
        }
    );
}