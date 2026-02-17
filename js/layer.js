/**
 * layer.js - نظام موحد لإدارة طبقات (z-index) للعناصر القابلة للتحريك
 * @version 3.0.0
 * @author Custom
 */

// =============================================
// ١. التعريفات الأساسية
// =============================================

const LayerSystem = (function () {
    'use strict';

    // ---------- الثوابت ----------
    const Z_INDEX = {
        BASE: 1000000,        // القاعدة الأساسية
        STEP: 2,             // خطوة الترقية
        MAX_SAFE: 9999999      // أقصى حد آمن
    };

    // العناصر المدعومة
    const ELEMENTS = {
        TODOLIST: 'draggableTodo',
        TODOSHORT: 'todo-short',
        NOTES: 'notes-widget',
        TIME: 'time-widget',
        DATE: 'date-widget',
        noteM: 'notes-modal'
    };

    // الألوان المخصصة
    const COLORS = {
        [ELEMENTS.TODOLIST]: '0, 0, 0 ,0',   // بنفسجي
        [ELEMENTS.TODOSHORT]: '0, 0, 0 ,0',   // برتقالي
        [ELEMENTS.NOTES]: '0, 0, 0 ,0',      // أخضر
        [ELEMENTS.TIME]: '0, 0, 0 ,0',     // ➕ ذهبي
        [ELEMENTS.DATE]: '0, 0, 0 ,0',             // أبيض
        [ELEMENTS.noteM]: '0, 0, 0 ,0',            // أحمر
        default: '0, 0, 0 ,0'
    };

    // ---------- المتغيرات الخاصة ----------
    let currentZIndex = Z_INDEX.BASE;
    const elementRegistry = new Map();
    let isInitialized = false;
    let conflictInterval = null;

    // ---------- دوال مساعدة ----------

    /**
     * الحصول على معرف العنصر
     */
    function getElementId(element) {
        if (typeof element === 'string') return element;
        return element?.id || null;
    }

    /**
     * الحصول على عنصر DOM
     */
    function getElement(elementId) {
        if (typeof elementId === 'string') {
            return document.getElementById(elementId);
        }
        return elementId;
    }

    /**
     * التأكد من أن العنصر جاهز
     */
    function ensureElementReady(element) {
        if (!element) return false;

        const computed = window.getComputedStyle(element);

        // إصلاح position إذا كان static
        if (computed.position === 'static') {
            element.style.setProperty('position', 'fixed', 'important');
        }

        // إضافة transform للعزل
        if (computed.transform === 'none') {
            element.style.transform = 'translateZ(0)';
        }

        return true;
    }

    /**
     * الحصول على لون العنصر
     */
    function getElementColor(elementId) {
        return COLORS[elementId] || COLORS.default;
    }

    // =============================================
    // ٢. API العام
    // =============================================

    return {
        /**
         * تهيئة النظام
         */
        init: function () {
            if (isInitialized) {
                return this;
            }


            // 1. إصلاح التعارضات
            this.fixConflicts();

            // 2. تعطيل الأنظمة القديمة
            this.disableOldSystems();

            // 3. تسجيل العناصر
            Object.values(ELEMENTS).forEach(id => {
                const element = document.getElementById(id);
                if (element) {
                    this.register(element, id);
                }
            });

            // 4. إضافة المستمعات
            this.setupEventListeners();

            // 5. بدء المراقبة
            this.startMonitoring();

            // 6. إضافة CSS
            this.injectStyles();

            isInitialized = true;

            // عرض الترتيب الحالي
            setTimeout(() => this.debug(), 100);

            return this;
        },

        /**
         * إصلاح التعارضات مع الأنظمة القديمة
         */
        fixConflicts: function () {

            Object.values(ELEMENTS).forEach(id => {
                const element = document.getElementById(id);
                if (!element) return;

                // قراءة القيم الحالية
                const computedZ = parseInt(window.getComputedStyle(element).zIndex) || 0;

                // إذا كان يستخدم نظام قديم (أقل من 1,000,000)
                if (computedZ > 0 && computedZ < Z_INDEX.BASE) {

                    // حساب قيمة جديدة
                    const newZ = Z_INDEX.BASE + (Object.values(ELEMENTS).indexOf(id) * 1);
                    element.style.setProperty('z-index', newZ.toString(), 'important');

                }
            });

            return this;
        },

        /**
         * تعطيل الأنظمة القديمة
         */
        disableOldSystems: function () {

            // 1. إزالة المتغيرات العامة القديمة
            const oldVars = ['highestZIndex', 'globalZIndex', 'zIndexCounter'];
            oldVars.forEach(varName => {
                if (window[varName] !== undefined) {
                    window[varName] = null;
                    delete window[varName];
                }
            });

            // 2. تعطيل الدوال القديمة
            if (window.bringToFront && !window._originalBringToFront) {
                window._originalBringToFront = window.bringToFront;
                window.bringToFront = function () {
                };
            }

            return this;
        },

        /**
         * تسجيل عنصر جديد
         */
        register: function (element, id) {
            if (!element || !id) {
                return false;
            }

            // تجهيز العنصر
            ensureElementReady(element);

            // تعيين z-index افتراضي
            const defaultZ = Z_INDEX.BASE + (Object.values(ELEMENTS).indexOf(id) * 1);
            element.style.setProperty('z-index', defaultZ.toString(), 'important');

            // تخزين في السجل
            elementRegistry.set(id, {
                element: element,
                zIndex: defaultZ,
                lastActive: Date.now()
            });

            return true;
        },

        /**
         * إعداد مستمعات الأحداث
         */
        setupEventListeners: function () {

            Object.values(ELEMENTS).forEach(id => {
                const element = document.getElementById(id);
                if (!element) return;

                // قائمة بالكلاسات التي يجب تجاهلها
                const ignoreClasses = [
                    '.todo-drag-handle',
                    '.notes-drag-handle',
                    '.todo-resize-handle',
                    '.notes-resize-handle',
                    'button',
                    'input'
                ];

                // مستمع النقر
                element.addEventListener('mousedown', (e) => {
                    // تجاهل إذا كان الضغط على عنصر تحكم
                    if (ignoreClasses.some(selector => e.target.closest(selector))) {
                        return;
                    }

                    this.raise(id, 'click');
                });

                // مستمع اللمس للجوال
                element.addEventListener('touchstart', (e) => {
                    if (ignoreClasses.some(selector => e.target.closest(selector))) {
                        return;
                    }

                    this.raise(id, 'touch');
                }, { passive: true });
            });

            return this;
        },

        /**
         * رفع عنصر للأمام
         */
        raise: function (elementId, source = 'manual') {
            const element = getElement(elementId);
            const id = getElementId(element);

            if (!element || !id) {
                return false;
            }

            // 1. زيادة المؤشر
            currentZIndex += Z_INDEX.STEP;

            // 2. التأكد من عدم تجاوز الحد
            if (currentZIndex > Z_INDEX.MAX_SAFE) {
                currentZIndex = Z_INDEX.BASE;
            }

            // 3. تطبيق z-index مع !important
            element.style.setProperty('z-index', currentZIndex.toString(), 'important');

            // 4. إضافة كلاس النشط
            element.classList.add('active-layer');

            // 5. إزالة كلاس النشط من العناصر الأخرى
            Object.values(ELEMENTS).forEach(otherId => {
                if (otherId !== id) {
                    const otherEl = document.getElementById(otherId);
                    if (otherEl) {
                        otherEl.classList.remove('active-layer');
                    }
                }
            });

            // 6. تحديث السجل
            if (elementRegistry.has(id)) {
                elementRegistry.get(id).zIndex = currentZIndex;
                elementRegistry.get(id).lastActive = Date.now();
            }

            // 7. تطبيق تأثير بصري
            this.applyVisualEffect(element, id);


            return true;
        },

        /**
         * تطبيق تأثير بصري
         */
        applyVisualEffect: function (element, id) {
            const color = getElementColor(id);

            element.style.transition = 'all 0.3s ease';
            // element.style.transform = 'scale(1.02)';
            // element.style.boxShadow = `0 40px 70px -15px rgba(${color}, 0.6)`;

            setTimeout(() => {
                element.style.transform = '';
                element.style.boxShadow = '';
            }, 300);
        },

        /**
         * بدء مراقبة التعارضات
         */
        startMonitoring: function () {
            if (conflictInterval) {
                clearInterval(conflictInterval);
            }

            conflictInterval = setInterval(() => {
                Object.values(ELEMENTS).forEach(id => {
                    const element = document.getElementById(id);
                    if (!element) return;

                    const computedZ = parseInt(window.getComputedStyle(element).zIndex) || 0;

                    // إذا تم تغيير z-index بواسطة نظام آخر
                    if (computedZ > 0 && computedZ < Z_INDEX.BASE && computedZ !== 1000) {

                        // إصلاح فوري
                        const newZ = currentZIndex + Z_INDEX.STEP;
                        element.style.setProperty('z-index', newZ.toString(), 'important');
                        currentZIndex = newZ;

                    }
                });
            }, 1000);

            return this;
        },

        /**
         * إيقاف المراقبة
         */
        stopMonitoring: function () {
            if (conflictInterval) {
                clearInterval(conflictInterval);
                conflictInterval = null;
            }
            return this;
        },

        /**
         * عرض ترتيب الطبقات
         */
        debug: function () {
            const elements = [];

            Object.values(ELEMENTS).forEach(id => {
                const element = document.getElementById(id);
                if (!element) return;

                const zIndex = parseInt(window.getComputedStyle(element).zIndex) || 0;
                elements.push({
                    id: id,
                    zIndex: zIndex,
                    element: element,
                    active: element.classList.contains('active-layer')
                });
            });

            // ترتيب تنازلي
            elements.sort((a, b) => b.zIndex - a.zIndex);

            elements.forEach((item, index) => {
                const prefix = index === 0 ? '👑 ' : '  ';
                const active = item.active ? ' [نشط]' : '';

            });
            console.groupEnd();

            return elements;
        },

        /**
         * تشخيص مشكلة عنصر معين
         */
        diagnose: function (elementId) {
            const element = getElement(elementId);
            const id = getElementId(element);

            if (!element || !id) {
                // console.error(`❌ العنصر غير موجود`);
                return;
            }

            console.group(`🔍 تشخيص ${id}`);

            const computed = window.getComputedStyle(element);



            // التحقق من وجود النظام
            const registryEntry = elementRegistry.get(id);


            console.groupEnd();
        },

        /**
         * إعادة ضبط النظام
         */
        reset: function () {


            // إعادة تعيين المؤشر
            currentZIndex = Z_INDEX.BASE;

            // إعادة تعيين جميع العناصر
            Object.values(ELEMENTS).forEach((id, index) => {
                const element = document.getElementById(id);
                if (!element) return;

                const newZ = Z_INDEX.BASE + (index * 1);
                element.style.setProperty('z-index', newZ.toString(), 'important');
                element.classList.remove('active-layer');
                element.style.transform = '';
                element.style.boxShadow = '';

                if (elementRegistry.has(id)) {
                    elementRegistry.get(id).zIndex = newZ;
                }
            });


            this.debug();

            return this;
        },

        /**
         * إضافة CSS ضروري
         */
        injectStyles: function () {
            const styleId = 'layer-system-styles';

            // تجنب التكرار
            if (document.getElementById(styleId)) return;

            const style = document.createElement('style');
            style.id = styleId;
            style.textContent = `
                /* ضمانات أساسية */
                #draggableTodo, #todo-short, #notes-widget {
                    position: fixed !important;
                    transform: translateZ(0);
                    backface-visibility: hidden;
                    will-change: z-index, transform;
                    transition: box-shadow 0.2s ease, transform 0.2s ease;
                }
                
               
                
                /* منع تحديد النص أثناء السحب */
                .dragging, .resizing {
                    user-select: none !important;
                    -webkit-user-select: none !important;
                    pointer-events: none !important;
                }
                
                /* مقابض تغيير الحجم */
                .todo-resize-handle, .notes-resize-handle {
                    cursor: nw-resize !important;
                }
            `;

            document.head.appendChild(style);
        },

        /**
         * الحصول على إحصائيات
         */
        stats: function () {
            return {
                currentZIndex: currentZIndex,
                registeredCount: elementRegistry.size,
                elements: Array.from(elementRegistry.entries()).map(([id, data]) => ({
                    id,
                    zIndex: data.zIndex,
                    lastActive: new Date(data.lastActive).toLocaleTimeString()
                }))
            };
        },

        /**
         * اختبار النظام
         */
        test: function () {

            const elements = Object.values(ELEMENTS);
            let index = 0;

            const testInterval = setInterval(() => {
                const id = elements[index % elements.length];
                this.raise(id, 'test');
                index++;

                if (index >= elements.length * 2) {
                    clearInterval(testInterval);
                }
            }, 1000);

            return this;
        }
    };
})();

// =============================================
// ٣. التصدير للاستخدام العام
// =============================================

// تعريفة على window
window.LayerSystem = LayerSystem;

// اختصارات
window.LS = LayerSystem;
window.LM = LayerSystem; // للتوافق مع الاسم القديم

// =============================================
// ٤. تهيئة تلقائية
// =============================================

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => LayerSystem.init());
} else {
    // إذا كان DOM جاهزاً
    setTimeout(() => LayerSystem.init(), 100);
}

// =============================================
// ٥. رسالة الترحيب
// =============================================

