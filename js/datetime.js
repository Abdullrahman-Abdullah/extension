/**
 * datetime.js - عناصر الوقت والتاريخ
 * مع حفظ الحجم تلقائياً - نسخة مصححة
 */

document.addEventListener('DOMContentLoaded', function() {
    'use strict';
    
    // ===== تهيئة العناصر =====
    const timeWidget = document.getElementById('time-widget');
    const dateWidget = document.getElementById('date-widget');
    
    if (!timeWidget && !dateWidget) return;
    
    // ===== نظام التحريك =====
    function makeDraggable(element, handleId, storageKey) {
        if (!element || !handleId) return;
        
        const handle = document.getElementById(handleId);
        if (!handle) return;
        
        let isDragging = false;
        let startX, startY, startLeft, startTop;
        let longPressTimer;
        
        // تحميل الموقع المحفوظ
        loadPosition();
        
        handle.addEventListener('mousedown', startLongPress);
        handle.addEventListener('touchstart', startLongPress, { passive: false });
        
        document.addEventListener('mousemove', (e) => {
            if (isDragging) moveElement(e);
        });
        
        document.addEventListener('touchmove', (e) => {
            if (isDragging) {
                e.preventDefault();
                moveElement(e.touches[0]);
            }
        }, { passive: false });
        
        document.addEventListener('mouseup', stopDrag);
        document.addEventListener('touchend', stopDrag);
        
        function startLongPress(e) {
            e.preventDefault();
            longPressTimer = setTimeout(() => startDrag(e), 100);
        }
        
        function startDrag(e) {
            isDragging = true;
            element.classList.add('dragging');
            
            if (window.LayerSystem) {
                LayerSystem.raise(element.id, 'drag');
            }
            
            // تصحيح: الحصول على الإحداثيات بشكل آمن
            let clientX, clientY;
            if (e.touches) {
                clientX = e.touches[0].clientX;
                clientY = e.touches[0].clientY;
            } else {
                clientX = e.clientX;
                clientY = e.clientY;
            }
            
            if (clientX === undefined || clientY === undefined) return;
            
            const rect = element.getBoundingClientRect();
            startX = clientX;
            startY = clientY;
            startLeft = rect.left;
            startTop = rect.top;
            
            element.style.transition = 'none';
        }
        
        function moveElement(e) {
            if (!isDragging) return;
            
            // تصحيح: الحصول على الإحداثيات بشكل آمن
            let clientX, clientY;
            if (e.touches) {
                clientX = e.touches[0].clientX;
                clientY = e.touches[0].clientY;
            } else {
                clientX = e.clientX;
                clientY = e.clientY;
            }
            
            if (clientX === undefined || clientY === undefined) return;
            
            const deltaX = clientX - startX;
            const deltaY = clientY - startY;
            
            let newLeft = startLeft + deltaX;
            let newTop = startTop + deltaY;
            
            const winW = window.innerWidth;
            const winH = window.innerHeight;
            const elW = element.offsetWidth;
            const elH = element.offsetHeight;
            
            newLeft = Math.max(5, Math.min(newLeft, winW - elW - 5));
            newTop = Math.max(5, Math.min(newTop, winH - elH - 5));
            
            element.style.left = newLeft + 'px';
            element.style.top = newTop + 'px';
            element.style.right = 'auto';
            element.style.bottom = 'auto';
        }
        
        function stopDrag() {
            if (longPressTimer) clearTimeout(longPressTimer);
            
            if (isDragging) {
                isDragging = false;
                element.classList.remove('dragging');
                element.style.transition = '';
                savePosition();
            }
        }
        
        function savePosition() {
            const left = element.style.left;
            const top = element.style.top;
            if (left && top) {
                localStorage.setItem(storageKey, JSON.stringify({ left, top }));
            }
        }
        
        function loadPosition() {
            try {
                const saved = localStorage.getItem(storageKey);
                if (saved) {
                    const pos = JSON.parse(saved);
                    element.style.left = pos.left;
                    element.style.top = pos.top;
                    element.style.right = 'auto';
                    element.style.bottom = 'auto';
                }
            } catch (e) {}
        }
    }
    
    // ===== نظام تغيير الحجم مع الحفظ =====
    function makeResizable(element, handleId, options = {}) {
        if (!element || !handleId) return;
        
        const handle = document.getElementById(handleId);
        if (!handle) return;
        
        const minW = options.minWidth || 180;
        const minH = options.minHeight || 120;
        const maxW = options.maxWidth || 400;
        const maxH = options.maxHeight || 300;
        
        let isResizing = false;
        let startX, startY, startW, startH;
        
        // تحميل الحجم المحفوظ
        loadSize();
        
        handle.addEventListener('mousedown', initResize);
        handle.addEventListener('touchstart', initResize, { passive: false });
        
        function initResize(e) {
            e.preventDefault();
            e.stopPropagation();
            
            isResizing = true;
            element.classList.add('resizing');
            
            if (window.LayerSystem) {
                LayerSystem.raise(element.id, 'resize');
            }
            
            // تصحيح: الحصول على الإحداثيات بشكل آمن
            let clientX, clientY;
            if (e.touches) {
                clientX = e.touches[0].clientX;
                clientY = e.touches[0].clientY;
            } else {
                clientX = e.clientX;
                clientY = e.clientY;
            }
            
            if (clientX === undefined || clientY === undefined) return;
            
            startX = clientX;
            startY = clientY;
            startW = element.offsetWidth;
            startH = element.offsetHeight;
            
            element.style.transition = 'none';
            
            document.addEventListener('mousemove', resize);
            document.addEventListener('touchmove', resize, { passive: false });
            document.addEventListener('mouseup', stopResize);
            document.addEventListener('touchend', stopResize);
        }
        
        function resize(e) {
            if (!isResizing) return;
            
            // تصحيح: الحصول على الإحداثيات بشكل آمن
            let clientX, clientY;
            if (e.touches) {
                clientX = e.touches[0].clientX;
                clientY = e.touches[0].clientY;
            } else {
                clientX = e.clientX;
                clientY = e.clientY;
            }
            
            if (clientX === undefined || clientY === undefined) return;
            
            let newW = startW + (clientX - startX);
            let newH = startH + (clientY - startY);
            
            newW = Math.min(Math.max(newW, minW), maxW);
            newH = Math.min(Math.max(newH, minH), maxH);
            
            element.style.width = newW + 'px';
            element.style.height = newH + 'px';
            
            adjustFontSizes(element, newW);
        }
        
        function stopResize() {
            if (isResizing) {
                isResizing = false;
                element.classList.remove('resizing');
                element.style.transition = '';
                
                // حفظ الحجم بعد التغيير
                saveSize();
            }
            
            document.removeEventListener('mousemove', resize);
            document.removeEventListener('touchmove', resize);
            document.removeEventListener('mouseup', stopResize);
            document.removeEventListener('touchend', stopResize);
        }
        
        // دالة حفظ الحجم
        function saveSize() {
            const sizeData = {
                width: element.style.width,
                height: element.style.height
            };
            localStorage.setItem(`${element.id}_size`, JSON.stringify(sizeData));
        }
        
        // دالة تحميل الحجم المحفوظ
        function loadSize() {
            try {
                const saved = localStorage.getItem(`${element.id}_size`);
                if (saved) {
                    const size = JSON.parse(saved);
                    if (size.width) element.style.width = size.width;
                    if (size.height) element.style.height = size.height;
                    
                    const width = parseFloat(size.width) || minW;
                    adjustFontSizes(element, width);
                }
            } catch (e) {}
        }
        
        function adjustFontSizes(el, width) {
            const timeDisplay = el.querySelector('.time-display');
            const dateDisplay = el.querySelector('.date-display');
            const dateFull = el.querySelector('.date-full');
            
            if (timeDisplay) {
                if (width < 220) {
                    timeDisplay.style.fontSize = '1.5rem';
                } else if (width < 280) {
                    timeDisplay.style.fontSize = '2rem';
                } else if (width < 350) {
                    timeDisplay.style.fontSize = '2.5rem';
                } else {
                    timeDisplay.style.fontSize = '3rem';
                }
            }
            
            if (dateDisplay) {
                if (width < 220) {
                    dateDisplay.style.fontSize = '1.1rem';
                } else if (width < 280) {
                    dateDisplay.style.fontSize = '1.4rem';
                } else if (width < 350) {
                    dateDisplay.style.fontSize = '1.7rem';
                } else {
                    dateDisplay.style.fontSize = '2rem';
                }
            }
            
            if (dateFull) {
                if (width < 220) {
                    dateFull.style.fontSize = '0.7rem';
                } else if (width < 280) {
                    dateFull.style.fontSize = '0.8rem';
                } else if (width < 350) {
                    dateFull.style.fontSize = '0.9rem';
                } else {
                    dateFull.style.fontSize = '1rem';
                }
            }
        }
    }
    
    // ===== تحديث الوقت =====
    function updateTime() {
        const timeDisplay = document.getElementById('timeDisplay');
        const timePeriod = document.getElementById('timePeriod');
        
        if (!timeDisplay) return;
        
        const now = new Date();
        let hours = now.getHours();
        const minutes = now.getMinutes().toString().padStart(2, '0');
        const seconds = now.getSeconds().toString().padStart(2, '0');
        
        const period = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12;
        hours = hours ? hours : 12;
        
        timeDisplay.textContent = `${hours.toString().padStart(2, '0')}:${minutes}:${seconds}`;
        
        if (timePeriod) {
            timePeriod.textContent = period;
        }
    }
    
    // ===== تحديث التاريخ =====
    function updateDate() {
        const dateDisplay = document.getElementById('dateDisplay');
        const dateFull = document.getElementById('dateFull');
        
        if (!dateDisplay || !dateFull) return;
        
        const now = new Date();
        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        
        dateDisplay.textContent = days[now.getDay()];
        dateFull.textContent = `${months[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()}`;
    }
    
    // ===== تفعيل العناصر مع حفظ الحجم =====
    
    // تفعيل الوقت
    if (timeWidget) {
        makeDraggable(timeWidget, 'timeDragHandle', 'timePosition');
        makeResizable(timeWidget, 'timeResizeHandle', {
            minWidth: 160,
            minHeight: 100,
            maxWidth: 450,
            maxHeight: 250
        });
        
        updateTime();
        setInterval(updateTime, 1000);
    }
    
    // تفعيل التاريخ
    if (dateWidget) {
        makeDraggable(dateWidget, 'dateDragHandle', 'datePosition');
        makeResizable(dateWidget, 'dateResizeHandle', {
            minWidth: 180,
            minHeight: 120,
            maxWidth: 500,
            maxHeight: 260
        });
        
        updateDate();
        setInterval(updateDate, 60000);
    }
    
});