/**
 * resizeable.js - نظام موحد للتحريك وتغيير الحجم
 * يستخدم مع todo.js و notes.js
 */

// =============================================
// ١. دوال التحكم في الحجم والرفع
// =============================================

// متغير عام لتتبع أعلى z-index
if (!window.highestZIndex) window.highestZIndex = 1000000;

/**
 * دالة رفع العنصر للأمام
 * @param {HTMLElement} element - العنصر المراد رفعه
 * @param {string} colorHint - لون التأثير (اختياري)
 */
window.bringToFront = function(element, colorHint = '167, 139, 250') {
    if (!element) return;
    
    window.highestZIndex += 1;
    element.style.zIndex = window.highestZIndex;
    
    // تأثير بسيط عند الرفع
    element.style.transition = 'transform 0.2s, box-shadow 0.2s';
    element.style.transform = 'scale(1.01)';
    element.style.boxShadow = `0 30px 60px -10px rgba(${colorHint}, 0.4)`;
    
    setTimeout(() => {
        element.style.transform = '';
        element.style.boxShadow = '';
    }, 200);
    
    console.log(`تم رفع العنصر ${element.id || 'غير معروف'} إلى الأمام`);
};

/**
 * دوال التحكم السريع في الحجم
 * @param {string} elementId - معرف العنصر
 * @param {string} action - increase / decrease / reset
 */
window.adjustSize = function(elementId, action) {
    const element = document.getElementById(elementId);
    if (!element) {
        console.warn(`العنصر ${elementId} غير موجود`);
        return;
    }
    
    // الحصول على الأبعاد الحالية
    const currentWidth = parseFloat(element.style.width) || element.offsetWidth;
    const currentHeight = parseFloat(element.style.height) || element.offsetHeight;
    
    let newWidth, newHeight;
    
    // تحديد نوع العنصر للحدود المناسبة
    const isTodo = elementId.includes('todo') || elementId.includes('draggableTodo');
    const isNotes = elementId.includes('notes') || elementId.includes('notes-widget');
    
    // الحدود الدنيا والقصوى
    const minW = 260;
    const maxW = 600;
    const minH = isTodo ? 300 : (isNotes ? 280 : 280);
    const maxH = 700;
    
    switch(action) {
        case 'increase':
            newWidth = currentWidth + 20;
            newHeight = currentHeight + 20;
            break;
        case 'decrease':
            newWidth = currentWidth - 20;
            newHeight = currentHeight - 20;
            break;
        case 'reset':
            newWidth = 320;
            newHeight = isTodo ? 380 : 320;
            break;
        default:
            return;
    }
    
    // تطبيق الحدود
    newWidth = Math.min(Math.max(newWidth, minW), maxW);
    newHeight = Math.min(Math.max(newHeight, minH), maxH);
    
    // تطبيق الأبعاد الجديدة
    element.style.width = newWidth + 'px';
    element.style.height = newHeight + 'px';
    
    // حفظ الحجم في localStorage
    const sizeData = { 
        width: newWidth + 'px', 
        height: newHeight + 'px' 
    };
    localStorage.setItem(`${elementId}_size`, JSON.stringify(sizeData));
    
    // تعديل الموقع إذا لزم الأمر
    adjustElementPosition(element);
    
    // إظهار رسالة قصيرة
    showResizeToast(action, elementId);
};

/**
 * إظهار رسالة قصيرة عند تغيير الحجم
 */
function showResizeToast(action, elementId) {
    const messages = {
        increase: '🔍 تكبير',
        decrease: '🔍 تصغير',
        reset: '↺ إعادة للحجم الافتراضي'
    };
    
    const toast = document.createElement('div');
    toast.style.cssText = `
        position: fixed;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(0, 0, 0, 0.8);
        backdrop-filter: blur(10px);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 30px;
        padding: 8px 20px;
        color: white;
        font-size: 0.9rem;
        z-index: 10000000;
        animation: fadeInOut 1.5s ease;
        pointer-events: none;
    `;
    toast.textContent = messages[action] || 'تغيير الحجم';
    document.body.appendChild(toast);
    
    setTimeout(() => toast.remove(), 1500);
}

// =============================================
// ٢. نظام تغيير الحجم بالسحب
// =============================================

/**
 * جعل عنصر قابل لتغيير الحجم بالسحب
 * @param {HTMLElement} element - العنصر المراد
 * @param {string} handleId - معرف مقبض تغيير الحجم
 * @param {Object} options - خيارات إضافية
 */
window.makeResizable = function(element, handleId, options = {}) {
    const resizeHandle = document.getElementById(handleId);
    if (!resizeHandle) {
        console.warn(`مقبض تغيير الحجم ${handleId} غير موجود`);
        return;
    }
    
    // الإعدادات الافتراضية
    const settings = {
        minWidth: options.minWidth || 260,
        minHeight: options.minHeight || 280,
        maxWidth: options.maxWidth || 600,
        maxHeight: options.maxHeight || 700,
        onResizeStart: options.onResizeStart || null,
        onResize: options.onResize || null,
        onResizeEnd: options.onResizeEnd || null
    };
    
    let isResizing = false;
    let startX, startY, startWidth, startHeight;
    
    // تمييز العنصر عند التحويم
    resizeHandle.addEventListener('mouseenter', () => {
        resizeHandle.style.opacity = '1';
    });
    
    resizeHandle.addEventListener('mouseleave', () => {
        if (!isResizing) {
            resizeHandle.style.opacity = '0.5';
        }
    });
    
    // أحداث بدء السحب
    resizeHandle.addEventListener('mousedown', initResize);
    resizeHandle.addEventListener('touchstart', initResize, { passive: false });
    
    function initResize(e) {
        e.preventDefault();
        e.stopPropagation();
        
        isResizing = true;
        element.classList.add('resizing');
        
        // استدعاء callback إذا وجد
        if (settings.onResizeStart) settings.onResizeStart(element);
        
        // رفع العنصر للأمام
        if (window.LayerManager) {
        LayerManager.bringToFront(element, 'resize:' + (element.id || 'unknown'));
    }
        
        // حفظ القيم الأولية
        startX = e.clientX || (e.touches && e.touches[0].clientX);
        startY = e.clientY || (e.touches && e.touches[0].clientY);
        
        const rect = element.getBoundingClientRect();
        startWidth = rect.width;
        startHeight = rect.height;
        
        // إزالة transition أثناء السحب
        element.style.transition = 'none';
        
        // منع تحديد النص
        document.body.style.userSelect = 'none';
        document.body.style.cursor = 'nw-resize';
        
        // إضافة مستمعي الأحداث
        document.addEventListener('mousemove', resize);
        document.addEventListener('touchmove', resize, { passive: false });
        document.addEventListener('mouseup', stopResize);
        document.addEventListener('touchend', stopResize);
    }
    
    function resize(e) {
        if (!isResizing) return;
        
        e.preventDefault();
        
        const clientX = e.clientX || (e.touches && e.touches[0].clientX);
        const clientY = e.clientY || (e.touches && e.touches[0].clientY);
        
        if (clientX === undefined) return;
        
        // حساب الأبعاد الجديدة
        let newWidth = startWidth + (clientX - startX);
        let newHeight = startHeight + (clientY - startY);
        
        // تطبيق الحدود
        newWidth = Math.min(Math.max(newWidth, settings.minWidth), settings.maxWidth);
        newHeight = Math.min(Math.max(newHeight, settings.minHeight), settings.maxHeight);
        
        // تطبيق الأبعاد
        element.style.width = newWidth + 'px';
        element.style.height = newHeight + 'px';
        
        // استدعاء callback إذا وجد
        if (settings.onResize) settings.onResize(element, newWidth, newHeight);
        
        // تعديل الموقع إذا لزم الأمر
        adjustElementPosition(element);
    }
    
    function stopResize() {
        if (isResizing) {
            isResizing = false;
            element.classList.remove('resizing');
            element.style.transition = '';
            
            document.body.style.userSelect = '';
            document.body.style.cursor = '';
            resizeHandle.style.opacity = '0.5';
            
            // حفظ الحجم
            saveElementSize(element);
            
            // استدعاء callback إذا وجد
            if (settings.onResizeEnd) settings.onResizeEnd(element);
        }
        
        // إزالة المستمعين
        document.removeEventListener('mousemove', resize);
        document.removeEventListener('touchmove', resize);
        document.removeEventListener('mouseup', stopResize);
        document.removeEventListener('touchend', stopResize);
    }
    
    // تحميل الحجم المحفوظ عند البدء
    loadElementSize(element);
};

// =============================================
// ٣. دوال مساعدة
// =============================================

/**
 * تعديل موقع العنصر إذا خرج من الشاشة
 */
function adjustElementPosition(element) {
    const rect = element.getBoundingClientRect();
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;
    
    let newLeft = parseFloat(element.style.left) || rect.left;
    let newTop = parseFloat(element.style.top) || rect.top;
    let needsUpdate = false;
    
    if (rect.right > windowWidth) {
        newLeft = windowWidth - rect.width - 5;
        needsUpdate = true;
    }
    if (rect.bottom > windowHeight) {
        newTop = windowHeight - rect.height - 5;
        needsUpdate = true;
    }
    if (rect.left < 5) {
        newLeft = 5;
        needsUpdate = true;
    }
    if (rect.top < 5) {
        newTop = 5;
        needsUpdate = true;
    }
    
    if (needsUpdate) {
        element.style.left = newLeft + 'px';
        element.style.top = newTop + 'px';
    }
}

/**
 * حفظ حجم العنصر
 */
function saveElementSize(element) {
    const id = element.id;
    if (id) {
        const sizeData = {
            width: element.style.width,
            height: element.style.height
        };
        localStorage.setItem(`${id}_size`, JSON.stringify(sizeData));
    }
}

/**
 * تحميل حجم العنصر المحفوظ
 */
function loadElementSize(element) {
    const id = element.id;
    if (id) {
        try {
            const saved = localStorage.getItem(`${id}_size`);
            if (saved) {
                const size = JSON.parse(saved);
                if (size.width) element.style.width = size.width;
                if (size.height) element.style.height = size.height;
            }
        } catch (e) {
            console.log(`لا يوجد حجم محفوظ لـ ${id}`);
        }
    }
}

// =============================================
// ٤. إضافة تأثيرات CSS
// =============================================

// إضافة تأثيرات CSS ديناميكياً
const style = document.createElement('style');
style.textContent = `
    @keyframes fadeInOut {
        0% { opacity: 0; transform: translate(-50%, 20px); }
        15% { opacity: 1; transform: translate(-50%, 0); }
        85% { opacity: 1; transform: translate(-50%, 0); }
        100% { opacity: 0; transform: translate(-50%, -20px); }
    }
    
    .resizing {
        transition: none !important;
        user-select: none !important;
        -webkit-user-select: none !important;
    }
    
    .todo-resize-handle, .notes-resize-handle {
        position: absolute;
        bottom: 0;
        right: 0;
        width: 24px;
        height: 24px;
        cursor: nw-resize;
        z-index: 1000001;
        opacity: 0.5;
        transition: opacity 0.2s;
        display: flex;
        align-items: center;
        justify-content: center;
        color: rgba(255, 255, 255, 0.5);
    }
    
    .todo-resize-handle:hover {
        opacity: 1;
        color: #a78bfa;
    }
    
    .notes-resize-handle:hover {
        opacity: 1;
        color: #6ee7b7;
    }
    
    .glass-todo, .glass-notes {
        transition: box-shadow 0.2s ease, transform 0.2s ease;
    }
`;
document.head.appendChild(style);

// =============================================
// ٥. تصدير الدوال للاستخدام
// =============================================

