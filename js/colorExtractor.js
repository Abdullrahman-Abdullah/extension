// Color Extraction & Theme Adaptation
class ColorExtractor {
    constructor() {
        this.canvas = document.createElement('canvas');
        this.ctx = this.canvas.getContext('2d');
        this.currentColors = {
            primary: [59, 130, 246],
            secondary: [99, 102, 241],
            accent: [16, 185, 129]
        };
        
        this.initializeExtraction();
    }

    initializeExtraction() {
        // Watch for wallpaper changes
        const background = document.getElementById('background');
        if (background) {
            const observer = new MutationObserver(() => {
                this.extractColorsFromBackground();
            });
            
            observer.observe(background, {
                attributes: true,
                attributeFilter: ['style']
            });
        }
        
        // Initial extraction
        setTimeout(() => {
            this.extractColorsFromBackground();
        }, 1000);
    }

    extractColorsFromBackground() {
        const background = document.getElementById('background');
        if (!background) return;

        // Get background image URL
        const bgStyle = window.getComputedStyle(background);
        const bgImage = bgStyle.backgroundImage;
        
        if (bgImage && bgImage !== 'none') {
            const imageUrl = bgImage.replace(/^url\(['"](.+)['"]\)$/, '$1');
            this.analyzeImage(imageUrl);
        }
    }

    analyzeImage(imageUrl) {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        
        img.onload = () => {
            // Resize canvas for performance
            this.canvas.width = 150;
            this.canvas.height = 100;
            
            // Draw and analyze
            this.ctx.drawImage(img, 0, 0, this.canvas.width, this.canvas.height);
            const colors = this.extractDominantColors();
            this.applyColorScheme(colors);
        };
        
        img.onerror = () => {
            console.log('Could not load image for color extraction');
        };
        
        img.src = imageUrl;
    }

    extractDominantColors() {
        const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
        const data = imageData.data;
        const colorMap = {};
        
        // Sample every 4th pixel for performance
        for (let i = 0; i < data.length; i += 16) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const a = data[i + 3];
            
            if (a < 128) continue; // Skip transparent pixels
            
            // Round to reduce color variations
            const roundedR = Math.round(r / 10) * 10;
            const roundedG = Math.round(g / 10) * 10;
            const roundedB = Math.round(b / 10) * 10;
            
            const colorKey = `${roundedR},${roundedG},${roundedB}`;
            colorMap[colorKey] = (colorMap[colorKey] || 0) + 1;
        }
        
        // Sort by frequency and get top colors
        const sortedColors = Object.entries(colorMap)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 10)
            .map(([color]) => color.split(',').map(Number));
        
        return this.selectBestColors(sortedColors);
    }

    selectBestColors(colors) {
        const result = {
            primary: colors[0] || [59, 130, 246],
            secondary: null,
            accent: null
        };
        
        // Find secondary color (different enough from primary)
        for (let i = 1; i < colors.length; i++) {
            const color = colors[i];
            if (this.colorDistance(result.primary, color) > 100) {
                result.secondary = color;
                break;
            }
        }
        
        // Find accent color (bright and different)
        for (let i = 1; i < colors.length; i++) {
            const color = colors[i];
            const brightness = (color[0] + color[1] + color[2]) / 3;
            
            if (brightness > 100 && 
                this.colorDistance(result.primary, color) > 80 &&
                (!result.secondary || this.colorDistance(result.secondary, color) > 80)) {
                result.accent = color;
                break;
            }
        }
        
        // Fallbacks
        result.secondary = result.secondary || this.adjustColor(result.primary, 30);
        result.accent = result.accent || this.adjustColor(result.primary, -40);
        
        return result;
    }

    colorDistance(color1, color2) {
        const rDiff = color1[0] - color2[0];
        const gDiff = color1[1] - color2[1];
        const bDiff = color1[2] - color2[2];
        return Math.sqrt(rDiff * rDiff + gDiff * gDiff + bDiff * bDiff);
    }

    adjustColor(color, adjustment) {
        return [
            Math.max(0, Math.min(255, color[0] + adjustment)),
            Math.max(0, Math.min(255, color[1] + adjustment)),
            Math.max(0, Math.min(255, color[2] + adjustment))
        ];
    }

    rgbToHsl(r, g, b) {
        r /= 255; g /= 255; b /= 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        let h, s, l = (max + min) / 2;

        if (max === min) {
            h = s = 0;
        } else {
            const d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            switch (max) {
                case r: h = (g - b) / d + (g < b ? 6 : 0); break;
                case g: h = (b - r) / d + 2; break;
                case b: h = (r - g) / d + 4; break;
            }
            h /= 6;
        }
        return [h * 360, s * 100, l * 100];
    }

    applyColorScheme(colors) {
        this.currentColors = colors;
        
        // Create CSS custom properties
        const root = document.documentElement;
        
        // Primary colors
        root.style.setProperty('--adaptive-primary', `rgb(${colors.primary.join(',')})`);
        root.style.setProperty('--adaptive-secondary', `rgb(${colors.secondary.join(',')})`);
        root.style.setProperty('--adaptive-accent', `rgb(${colors.accent.join(',')})`);
        
        // Alpha variations
        root.style.setProperty('--adaptive-primary-20', `rgba(${colors.primary.join(',')}, 0.2)`);
        root.style.setProperty('--adaptive-primary-40', `rgba(${colors.primary.join(',')}, 0.4)`);
        root.style.setProperty('--adaptive-primary-60', `rgba(${colors.primary.join(',')}, 0.6)`);
        
        root.style.setProperty('--adaptive-secondary-20', `rgba(${colors.secondary.join(',')}, 0.2)`);
        root.style.setProperty('--adaptive-accent-20', `rgba(${colors.accent.join(',')}, 0.2)`);
        
        // Apply to UI elements
        this.updateUIColors(colors);
        
        // Smooth transition
        document.body.style.transition = 'all 0.8s ease';
        setTimeout(() => {
            document.body.style.transition = '';
        }, 800);
    }

    updateUIColors(colors) {
        // Update clock widget
        const clockWidget = document.querySelector('.clock-widget');
        if (clockWidget) {
            clockWidget.style.background = 
                `linear-gradient(135deg, rgba(${colors.primary.join(',')}, 0.15), rgba(${colors.secondary.join(',')}, 0.05))`;
            clockWidget.style.borderColor = `rgba(${colors.primary.join(',')}, 0.3)`;
        }
        
        // Update search bar
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.style.setProperty('--focus-color', `rgba(${colors.primary.join(',')}, 0.6)`);
        }
        
        // Update shortcuts
        const shortcuts = document.querySelectorAll('.shortcut:not(.add-shortcut)');
        shortcuts.forEach((shortcut, index) => {
            const colorIndex = index % 3;
            let color;
            
            switch(colorIndex) {
                case 0: color = colors.primary; break;
                case 1: color = colors.secondary; break;
                case 2: color = colors.accent; break;
            }
            
            shortcut.style.background = 
                `linear-gradient(135deg, rgba(${color.join(',')}, 0.2), rgba(${color.join(',')}, 0.05))`;
            shortcut.style.borderColor = `rgba(${color.join(',')}, 0.3)`;
        });
        
        // Update menu buttons
        this.updateMenuButtons(colors);
    }

    updateMenuButtons(colors) {
        // Update "Set Primary" buttons
        const setPrimaryBtns = document.querySelectorAll('.fav-set:not(.fav-card.active .fav-set)');
        setPrimaryBtns.forEach(btn => {
            btn.style.background = 
                `linear-gradient(135deg, rgba(${colors.primary.join(',')}, 0.8), rgba(${colors.secondary.join(',')}, 0.6))`;
        });
        
        // Update "Random" buttons
        const randomBtns = document.querySelectorAll('.fav-include:not(.included)');
        randomBtns.forEach(btn => {
            btn.style.background = 
                `linear-gradient(135deg, rgba(${colors.accent.join(',')}, 0.2), rgba(${colors.accent.join(',')}, 0.05))`;
            btn.style.borderColor = `rgba(${colors.accent.join(',')}, 0.4)`;
        });
    }
}

// Initialize color extraction
document.addEventListener('DOMContentLoaded', () => {
    new ColorExtractor();
});

// Also initialize if script loads after DOM
if (document.readyState !== 'loading') {
    new ColorExtractor();
}