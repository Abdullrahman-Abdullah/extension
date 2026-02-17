// To-Do List مع خاصية التحريك لكلا العنصرين
document.addEventListener('DOMContentLoaded', function () {
    // ========== العنصر الأول (القائمة الرئيسية) ==========
    const todoWidget = document.getElementById('draggableTodo');
    const dragHandle1 = document.getElementById('dragHandle');

    // ========== العنصر الثاني (todo-short) ==========
    const todoShort = document.getElementById('todo-short');
    const dragHandle2 = document.getElementById('dragHandle2');

    
    // التحقق من وجود العناصر
    if (todoWidget && dragHandle1) {
        makeDraggable(todoWidget, dragHandle1, 'todoPosition');
    }

    if (todoShort && dragHandle2) {
        makeDraggable(todoShort, dragHandle2, 'todoShortPosition');
    }

    // ========== الدالة الموحدة للتحريك ==========
    function makeDraggable(element, handle, storageKey) {
        let isDragging = false;
        let startX, startY, startLeft, startTop;
        let longPressTimer;
        let isLongPress = false;

        // تحميل الموقع المحفوظ
        loadPosition(element, storageKey);

        // أحداث الماوس واللمس
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
            if (isDragging) {
                moveElement(e, element);
            }
        });

        document.addEventListener('mouseup', stopDrag);

        // بدء الضغط المطول
        function startLongPress(e) {
            e.preventDefault();

            // منع البدء إذا كان الضغط على عناصر تفاعلية
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON' ||
                e.target.closest('.todo-add-btn') || e.target.closest('.todo-delete-icon') ||
                e.target.closest('.todo-status-icon') || e.target.closest('.todo-clear-btn')) {
                return;
            }

            longPressTimer = setTimeout(() => {
                startDrag(e, element);
                isLongPress = true;
            }, 100);
        }

        // بدء السحب
        function startDrag(e, el) {
            isDragging = true;
            document.body.style.cursor = 'grabbing';
            el.classList.add('dragging');
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

            // showDragHint('اسحب للمكان المناسب');
        }

        // تحريك العنصر
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

            // منع خروج العنصر من الشاشة
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

        // إيقاف السحب
        function stopDrag() {
            if (longPressTimer) {
                clearTimeout(longPressTimer);
            }

            if (isDragging) {
                isDragging = false;
                element.classList.remove('dragging');
                document.body.style.cursor = '';
                element.style.transition = '';

                // حفظ الموقع
                savePosition(element, storageKey);
                // showDragHint('تم التثبيت ✓', 'success');
            }

            isLongPress = false;
        }

        // حفظ الموقع
        function savePosition(el, key) {
            const left = el.style.left;
            const top = el.style.top;

            if (left && top) {
                const position = { left, top };
                localStorage.setItem(key, JSON.stringify(position));
            }
        }

        // تحميل الموقع
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
            } catch (e) {
                // console.log(`لا يوجد موقع محفوظ لـ ${key}`);
            }
        }
    }

    // ========== الدوال المساعدة ==========
    function showDragHint(text, type = 'info') {
        const hint = document.createElement('div');
        hint.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(18, 22, 28, 0.95);
            backdrop-filter: blur(10px);
            border: 1px solid ${type === 'success' ? '#a78bfa' : 'rgba(255,255,255,0.1)'};
            border-radius: 40px;
            padding: 12px 28px;
            color: white;
            font-size: 0.95rem;
            box-shadow: 0 15px 35px rgba(0,0,0,0.4);
            z-index: 1000000;
            animation: fadeInOut 1.5s ease forwards;
            pointer-events: none;
        `;
        hint.textContent = text;
        document.body.appendChild(hint);

        setTimeout(() => hint.remove(), 1500);
    }

    // إضافة تأثير الحركة
    const style = document.createElement('style');
    style.textContent = `
        @keyframes fadeInOut {
            0% { opacity: 0; transform: translate(-50%, -40%); }
            15% { opacity: 1; transform: translate(-50%, -50%); }
            85% { opacity: 1; transform: translate(-50%, -50%); }
            100% { opacity: 0; transform: translate(-50%, -60%); }
        }
    `;
    document.head.appendChild(style);

    // ========== منطق القائمة الرئيسية (كما هو) ==========
    // ... باقي كود القائمة الرئيسية ...
    const todoInput = document.getElementById('todoInput');
    const addBtn = document.getElementById('addTodoBtn');
    const todoList = document.getElementById('todoList');
    const clearBtn = document.getElementById('clearCompletedBtn');
    const completedCount = document.getElementById('completedCount');
    const totalCount = document.getElementById('totalCount');
    const remainingText = document.getElementById('remainingText');

    if (todoInput && addBtn && todoList) {
        let todos = [];

        try {
            const saved = localStorage.getItem('glass_todos');
            if (saved) todos = JSON.parse(saved);
        } catch (e) { }



        function saveTodos() {
            localStorage.setItem('glass_todos', JSON.stringify(todos));
        }

        function renderTodos() {
            if (todos.length === 0) {
                todoList.innerHTML = '<div class="empty-state"><i class="bi bi-clipboard-check"></i><p>لا توجد مهام</p></div>';
                updateStats();
                return;
            }

            let html = '';
            todos.forEach((todo, index) => {
                const completedClass = todo.completed ? 'completed' : '';
                const icon = todo.completed ? 'bi-check-circle-fill' : 'bi-circle';

                html += `
                    <li class="todo-item ${completedClass}" data-index="${index}">
                        <i class="bi ${icon} todo-status-icon"></i>
                        <span class="todo-item-text">${escapeHtml(todo.text)}</span>
                        <i class="bi bi-trash3 todo-delete-icon"></i>
                    </li>
                `;
            });

            todoList.innerHTML = html;
            todoList2.innerHTML = html;

            // إضافة الأحداث
            document.querySelectorAll('.todo-status-icon').forEach(icon => {
                icon.addEventListener('click', function (e) {
                    e.stopPropagation();
                    const li = this.closest('.todo-item');
                    if (li) toggleTodo(parseInt(li.dataset.index));
                });
            });

            document.querySelectorAll('.todo-delete-icon').forEach(icon => {
                icon.addEventListener('click', function (e) {
                    e.stopPropagation();
                    const li = this.closest('.todo-item');
                    if (li) deleteTodo(parseInt(li.dataset.index));
                });
            });

            updateStats();
        }

        function toggleTodo(index) {
            if (todos[index]) {
                todos[index].completed = !todos[index].completed;
                saveTodos();
                renderTodos();
            }
        }

        function deleteTodo(index) {
            if (todos[index]) {
                todos.splice(index, 1);
                saveTodos();
                renderTodos();
            }
        }

        function addTodo() {
            const text = todoInput.value.trim();
            if (text) {
                todos.unshift({ text: text, completed: false });
                todoInput.value = '';
                saveTodos();
                renderTodos();
            }
        }

        function clearCompleted() {
            todos = todos.filter(t => !t.completed);
            saveTodos();
            renderTodos();
        }

        function updateStats() {
            const completed = todos.filter(t => t.completed).length;
            const total = todos.length;

            if (completedCount) completedCount.textContent = completed;
            if (totalCount) totalCount.textContent = total;

            if (remainingText) {
                const remaining = total - completed;
                if (total === 0) remainingText.textContent = 'أضف مهمة';
                else if (remaining === 0) remainingText.textContent = 'مكتمل 🎉';
                else remainingText.textContent = `متبقي ${remaining}`;
            }
        }

        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        addBtn.addEventListener('click', addTodo);
        todoInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') addTodo();
        });
        if (clearBtn) clearBtn.addEventListener('click', clearCompleted);

        renderTodos();
    }
});

// في نهاية ملف todo.js
if (document.getElementById('draggableTodo') && document.getElementById('todoResizeHandle')) {
    makeResizable(
        document.getElementById('draggableTodo'),
        'todoResizeHandle',
        {
            minWidth: 260,
            minHeight: 300,
            maxWidth: 600,
            maxHeight: 700,
            onResizeStart: (el) => console.log('بدء تغيير حجم todo'),
            onResizeEnd: (el) => console.log('انتهاء تغيير حجم todo')
        }
    );
}