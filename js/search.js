// تأثيرات إضافية للبحث
document.addEventListener('DOMContentLoaded', function() {
    const searchBar = document.getElementById('searchBar');
    const searchInput = document.getElementById('searchInput');
    const searchTrigger = document.getElementById('searchTrigger');
    
    if (!searchBar || !searchInput || !searchTrigger) return;
    
    // تأثير عند الكتابة
    searchInput.addEventListener('input', function() {
        if (this.value.length > 0) {
            searchBar.style.opacity = '0.7';
            setTimeout(() => {
                searchBar.style.opacity = '1';
            }, 200);
        }
    });
    
    // تأثير عند الضغط على Enter
    searchInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            
            // تأثير النبض
            searchTrigger.style.transform = 'scale(0.9)';
            searchBar.style.boxShadow = '0 0 30px #8a5cf65b';
            
            setTimeout(() => {
                searchTrigger.style.transform = '';
                searchBar.style.boxShadow = '';
            }, 200);
            
            // هنا ضع وظيفة البحث
        }
    });
    
    // تأثير النقر على زر البحث
    searchTrigger.addEventListener('click', function() {
        // تأثير دوران
        this.style.transform = ' rotate(360deg) scale(1.2)';
        
        setTimeout(() => {
            this.style.transform = '';
        }, 400);
        
        if (searchInput.value.trim()) {
        }
    });
});