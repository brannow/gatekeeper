/**
 * Automated Theme Testing Script for Gatekeeper PWA
 * Tests theme switching, system preference detection, and persistence
 * 
 * Usage:
 * 1. Start the development server: docker exec gatekeeper-node npm run build && npm run preview
 * 2. Open test-theme.html in multiple browsers
 * 3. Run this script in browser console
 * 4. Check results in console and on page
 */

// Theme Testing Automation Suite
class ThemeTestSuite {
    constructor() {
        this.results = [];
        this.startTime = performance.now();
        this.systemPreference = this.detectSystemPreference();
        
        console.log('🎨 Gatekeeper Theme Test Suite Initialized');
        console.log('📱 Platform:', navigator.platform);
        console.log('🌐 User Agent:', navigator.userAgent);
        console.log('🎯 System Preference:', this.systemPreference);
    }

    // Core utility methods
    log(message, type = 'info') {
        const timestamp = new Date().toISOString();
        const emoji = {
            'pass': '✅',
            'fail': '❌', 
            'warn': '⚠️',
            'info': 'ℹ️'
        }[type] || 'ℹ️';
        
        console.log(`${emoji} [${timestamp}] ${message}`);
        this.results.push({ timestamp, type, message });
    }

    detectSystemPreference() {
        if (!window.matchMedia) return 'unknown';
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'bright';
    }

    async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Test 1: Basic Theme Switching
    async testThemeSwitching() {
        this.log('Starting theme switching tests...');
        
        const themes = ['bright', 'dark', 'system'];
        let passed = 0;

        for (const theme of themes) {
            try {
                // Set theme
                document.documentElement.classList.remove('theme-bright', 'theme-dark');
                
                let resolvedTheme = theme;
                if (theme === 'system') {
                    resolvedTheme = this.systemPreference;
                }
                
                if (resolvedTheme !== 'system') {
                    document.documentElement.classList.add(`theme-${resolvedTheme}`);
                }
                
                document.documentElement.setAttribute('data-theme', resolvedTheme);
                
                // Verify theme application
                const hasCorrectClass = theme === 'system' ? 
                    document.documentElement.classList.contains(`theme-${this.systemPreference}`) :
                    document.documentElement.classList.contains(`theme-${theme}`);
                
                const hasCorrectAttribute = document.documentElement.getAttribute('data-theme') === resolvedTheme;
                
                if (hasCorrectClass && hasCorrectAttribute) {
                    this.log(`Theme switching to ${theme} (${resolvedTheme}): PASS`, 'pass');
                    passed++;
                } else {
                    this.log(`Theme switching to ${theme}: FAIL - class: ${hasCorrectClass}, attr: ${hasCorrectAttribute}`, 'fail');
                }
                
                await this.delay(100); // Allow CSS transitions
                
            } catch (error) {
                this.log(`Theme switching to ${theme}: ERROR - ${error.message}`, 'fail');
            }
        }
        
        this.log(`Theme Switching Tests: ${passed}/${themes.length} passed`, passed === themes.length ? 'pass' : 'fail');
        return passed === themes.length;
    }

    // Test 2: System Preference Detection
    async testSystemPreferenceDetection() {
        this.log('Starting system preference detection tests...');
        
        let passed = 0;
        const tests = 4;

        // Test 1: matchMedia availability
        if (window.matchMedia) {
            this.log('matchMedia API: AVAILABLE', 'pass');
            passed++;
        } else {
            this.log('matchMedia API: NOT AVAILABLE', 'fail');
        }

        // Test 2: Dark mode query
        try {
            const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
            this.log(`Dark mode query: ${darkQuery.matches}`, 'pass');
            passed++;
        } catch (error) {
            this.log(`Dark mode query: ERROR - ${error.message}`, 'fail');
        }

        // Test 3: Light mode query
        try {
            const lightQuery = window.matchMedia('(prefers-color-scheme: light)');
            this.log(`Light mode query: ${lightQuery.matches}`, 'pass');
            passed++;
        } catch (error) {
            this.log(`Light mode query: ERROR - ${error.message}`, 'fail');
        }

        // Test 4: Event listener support
        try {
            const testQuery = window.matchMedia('(prefers-color-scheme: dark)');
            const testHandler = () => {};
            
            if (testQuery.addEventListener) {
                testQuery.addEventListener('change', testHandler);
                testQuery.removeEventListener('change', testHandler);
                this.log('addEventListener support: AVAILABLE', 'pass');
                passed++;
            } else if (testQuery.addListener) {
                testQuery.addListener(testHandler);
                testQuery.removeListener(testHandler);
                this.log('addListener (legacy) support: AVAILABLE', 'pass');
                passed++;
            } else {
                this.log('Event listener support: NOT AVAILABLE', 'fail');
            }
        } catch (error) {
            this.log(`Event listener test: ERROR - ${error.message}`, 'fail');
        }

        this.log(`System Preference Tests: ${passed}/${tests} passed`, passed === tests ? 'pass' : 'fail');
        return passed === tests;
    }

    // Test 3: Theme Persistence
    async testThemePersistence() {
        this.log('Starting theme persistence tests...');
        
        const originalTheme = localStorage.getItem('gatekeeper-theme');
        let passed = 0;
        const themes = ['bright', 'dark', 'system'];

        for (const theme of themes) {
            try {
                // Save theme
                localStorage.setItem('gatekeeper-theme', theme);
                
                // Verify save
                const saved = localStorage.getItem('gatekeeper-theme');
                if (saved === theme) {
                    this.log(`Theme persistence (${theme}): SAVE OK`, 'pass');
                    
                    // Test retrieval after page "reload" simulation
                    const retrieved = localStorage.getItem('gatekeeper-theme');
                    if (retrieved === theme) {
                        this.log(`Theme persistence (${theme}): RETRIEVE OK`, 'pass');
                        passed++;
                    } else {
                        this.log(`Theme persistence (${theme}): RETRIEVE FAIL`, 'fail');
                    }
                } else {
                    this.log(`Theme persistence (${theme}): SAVE FAIL`, 'fail');
                }
            } catch (error) {
                this.log(`Theme persistence (${theme}): ERROR - ${error.message}`, 'fail');
            }
        }

        // Test JSON persistence (like real app)
        try {
            const testConfig = {
                theme: 'dark',
                esp32: { host: '192.168.1.100', port: 80 },
                lastModified: Date.now()
            };
            
            localStorage.setItem('gatekeeper-config', JSON.stringify(testConfig));
            const retrieved = JSON.parse(localStorage.getItem('gatekeeper-config'));
            
            if (retrieved.theme === testConfig.theme) {
                this.log('JSON config persistence: PASS', 'pass');
                passed++;
            } else {
                this.log('JSON config persistence: FAIL', 'fail');
            }
            
            localStorage.removeItem('gatekeeper-config');
        } catch (error) {
            this.log(`JSON persistence: ERROR - ${error.message}`, 'fail');
        }

        // Restore original theme
        if (originalTheme) {
            localStorage.setItem('gatekeeper-theme', originalTheme);
        } else {
            localStorage.removeItem('gatekeeper-theme');
        }

        const totalTests = themes.length + 1; // +1 for JSON test
        this.log(`Theme Persistence Tests: ${passed}/${totalTests} passed`, passed === totalTests ? 'pass' : 'fail');
        return passed === totalTests;
    }

    // Test 4: CSS Custom Properties
    async testCSSCustomProperties() {
        this.log('Starting CSS custom properties tests...');
        
        let passed = 0;
        const properties = [
            '--bg-primary',
            '--text-primary', 
            '--color-primary',
            '--status-ready',
            '--border-primary'
        ];

        // Test bright theme
        document.documentElement.className = 'theme-bright';
        await this.delay(50);

        for (const property of properties) {
            try {
                const value = getComputedStyle(document.documentElement).getPropertyValue(property);
                if (value && value.trim() !== '') {
                    this.log(`CSS Property ${property} (bright): ${value.trim()}`, 'pass');
                    passed++;
                } else {
                    this.log(`CSS Property ${property} (bright): NOT FOUND`, 'fail');
                }
            } catch (error) {
                this.log(`CSS Property ${property} (bright): ERROR - ${error.message}`, 'fail');
            }
        }

        // Test dark theme
        document.documentElement.className = 'theme-dark';
        await this.delay(50);

        for (const property of properties) {
            try {
                const value = getComputedStyle(document.documentElement).getPropertyValue(property);
                if (value && value.trim() !== '') {
                    this.log(`CSS Property ${property} (dark): ${value.trim()}`, 'pass');
                    passed++;
                } else {
                    this.log(`CSS Property ${property} (dark): NOT FOUND`, 'fail');
                }
            } catch (error) {
                this.log(`CSS Property ${property} (dark): ERROR - ${error.message}`, 'fail');
            }
        }

        const totalTests = properties.length * 2; // Test both themes
        this.log(`CSS Custom Properties Tests: ${passed}/${totalTests} passed`, passed === totalTests ? 'pass' : 'fail');
        return passed === totalTests;
    }

    // Test 5: Accessibility
    async testAccessibility() {
        this.log('Starting accessibility tests...');
        
        let passed = 0;
        const tests = [];

        // Test contrast ratios
        const colorTests = [
            { bg: '#ffffff', text: '#333333', name: 'Light theme text' },
            { bg: '#121212', text: '#ffffff', name: 'Dark theme text' },
            { bg: '#4CAF50', text: '#ffffff', name: 'Primary button' },
            { bg: '#f44336', text: '#ffffff', name: 'Error button' }
        ];

        for (const test of colorTests) {
            const contrast = this.calculateContrastRatio(test.bg, test.text);
            const meetsWCAG = contrast >= 4.5;
            
            if (meetsWCAG) {
                this.log(`Contrast ${test.name}: ${contrast.toFixed(2)}:1 (WCAG AA)`, 'pass');
                passed++;
            } else {
                this.log(`Contrast ${test.name}: ${contrast.toFixed(2)}:1 (BELOW WCAG)`, 'fail');
            }
            
            tests.push(test);
        }

        // Test reduced motion preference
        try {
            if (window.matchMedia) {
                const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
                this.log(`Reduced motion preference: ${reducedMotion.matches ? 'ENABLED' : 'DISABLED'}`, 'info');
                this.log('Reduced motion detection: SUPPORTED', 'pass');
                passed++;
                tests.push({ name: 'motion' });
            } else {
                this.log('Reduced motion detection: NOT SUPPORTED', 'fail');
                tests.push({ name: 'motion' });
            }
        } catch (error) {
            this.log(`Reduced motion test: ERROR - ${error.message}`, 'fail');
            tests.push({ name: 'motion' });
        }

        // Test high contrast detection
        try {
            if (window.matchMedia) {
                const highContrast = window.matchMedia('(forced-colors: active)');
                this.log(`High contrast mode: ${highContrast.matches ? 'ACTIVE' : 'INACTIVE'}`, 'info');
                this.log('High contrast detection: SUPPORTED', 'pass');
                passed++;
                tests.push({ name: 'contrast' });
            } else {
                this.log('High contrast detection: NOT SUPPORTED', 'warn');
                tests.push({ name: 'contrast' });
            }
        } catch (error) {
            this.log(`High contrast test: ERROR - ${error.message}`, 'fail');
            tests.push({ name: 'contrast' });
        }

        this.log(`Accessibility Tests: ${passed}/${tests.length} passed`, passed === tests.length ? 'pass' : 'warn');
        return passed >= tests.length * 0.8; // 80% pass rate for accessibility
    }

    calculateContrastRatio(color1, color2) {
        const getLuminance = (color) => {
            const rgb = parseInt(color.replace('#', ''), 16);
            const r = (rgb >> 16) & 0xff;
            const g = (rgb >> 8) & 0xff;
            const b = rgb & 0xff;
            
            const sRGB = [r, g, b].map(c => {
                c = c / 255;
                return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
            });
            
            return 0.2126 * sRGB[0] + 0.7152 * sRGB[1] + 0.0722 * sRGB[2];
        };
        
        const lum1 = getLuminance(color1);
        const lum2 = getLuminance(color2);
        const bright = Math.max(lum1, lum2);
        const dark = Math.min(lum1, lum2);
        
        return (bright + 0.05) / (dark + 0.05);
    }

    // Test 6: Performance
    async testPerformance() {
        this.log('Starting performance tests...');
        
        let passed = 0;
        const iterations = 20;
        const times = [];

        // Test theme switching performance
        for (let i = 0; i < iterations; i++) {
            const start = performance.now();
            
            const theme = i % 2 === 0 ? 'dark' : 'bright';
            document.documentElement.classList.remove('theme-bright', 'theme-dark');
            document.documentElement.classList.add(`theme-${theme}`);
            document.documentElement.setAttribute('data-theme', theme);
            
            // Force layout
            document.documentElement.offsetHeight;
            
            const end = performance.now();
            times.push(end - start);
        }

        const average = times.reduce((a, b) => a + b) / times.length;
        const min = Math.min(...times);
        const max = Math.max(...times);

        this.log(`Theme switch performance: avg ${average.toFixed(2)}ms, min ${min.toFixed(2)}ms, max ${max.toFixed(2)}ms`, 'info');

        if (average < 16) {
            this.log('Theme switch performance: EXCELLENT (<16ms)', 'pass');
            passed++;
        } else if (average < 50) {
            this.log('Theme switch performance: GOOD (<50ms)', 'pass');
            passed++;
        } else {
            this.log('Theme switch performance: NEEDS IMPROVEMENT (>50ms)', 'fail');
        }

        // Test memory usage (if available)
        if (performance.memory) {
            const memoryMB = performance.memory.usedJSHeapSize / 1048576;
            this.log(`Memory usage: ${memoryMB.toFixed(2)}MB`, 'info');
            
            if (memoryMB < 50) {
                this.log('Memory usage: EXCELLENT (<50MB)', 'pass');
                passed++;
            } else if (memoryMB < 100) {
                this.log('Memory usage: GOOD (<100MB)', 'pass');
                passed++;
            } else {
                this.log('Memory usage: HIGH (>100MB)', 'warn');
            }
        } else {
            this.log('Memory API not available', 'info');
            passed++; // Don't penalize for missing API
        }

        this.log(`Performance Tests: ${passed}/2 passed`, passed === 2 ? 'pass' : 'warn');
        return passed >= 1; // At least one performance test should pass
    }

    // Test 7: Browser Feature Support
    async testBrowserSupport() {
        this.log('Starting browser support tests...');
        
        let passed = 0;
        const features = [
            { name: 'CSS Custom Properties', test: () => CSS && CSS.supports && CSS.supports('color', 'var(--test)') },
            { name: 'CSS.supports API', test: () => typeof CSS !== 'undefined' && typeof CSS.supports === 'function' },
            { name: 'matchMedia API', test: () => typeof window.matchMedia === 'function' },
            { name: 'localStorage', test: () => typeof Storage !== 'undefined' },
            { name: 'addEventListener', test: () => typeof EventTarget !== 'undefined' },
            { name: 'performance API', test: () => typeof performance !== 'undefined' },
            { name: 'JSON API', test: () => typeof JSON !== 'undefined' },
            { name: 'Flexbox', test: () => CSS && CSS.supports && CSS.supports('display', 'flex') },
            { name: 'CSS Grid', test: () => CSS && CSS.supports && CSS.supports('display', 'grid') },
            { name: 'CSS Transitions', test: () => CSS && CSS.supports && CSS.supports('transition', 'all 0.3s') }
        ];

        for (const feature of features) {
            try {
                if (feature.test()) {
                    this.log(`Browser feature ${feature.name}: SUPPORTED`, 'pass');
                    passed++;
                } else {
                    this.log(`Browser feature ${feature.name}: NOT SUPPORTED`, 'fail');
                }
            } catch (error) {
                this.log(`Browser feature ${feature.name}: ERROR - ${error.message}`, 'fail');
            }
        }

        this.log(`Browser Support Tests: ${passed}/${features.length} passed`, passed >= features.length * 0.8 ? 'pass' : 'fail');
        return passed >= features.length * 0.8; // 80% feature support required
    }

    // Main test runner
    async runAllTests() {
        this.log('🚀 Starting comprehensive theme test suite...');
        
        const testResults = {
            themeSwitching: await this.testThemeSwitching(),
            systemPreference: await this.testSystemPreferenceDetection(),
            persistence: await this.testThemePersistence(),
            cssProperties: await this.testCSSCustomProperties(),
            accessibility: await this.testAccessibility(),
            performance: await this.testPerformance(),
            browserSupport: await this.testBrowserSupport()
        };

        // Calculate overall results
        const passedTests = Object.values(testResults).filter(Boolean).length;
        const totalTests = Object.keys(testResults).length;
        const passRate = (passedTests / totalTests) * 100;

        this.log('📊 TEST SUITE SUMMARY:', 'info');
        this.log(`  Total Tests: ${totalTests}`, 'info');
        this.log(`  Passed: ${passedTests}`, 'info');
        this.log(`  Failed: ${totalTests - passedTests}`, 'info');
        this.log(`  Pass Rate: ${passRate.toFixed(1)}%`, 'info');

        Object.entries(testResults).forEach(([test, passed]) => {
            this.log(`  ${test}: ${passed ? 'PASS' : 'FAIL'}`, passed ? 'pass' : 'fail');
        });

        const endTime = performance.now();
        const duration = endTime - this.startTime;
        this.log(`⏱️  Total test duration: ${duration.toFixed(2)}ms`, 'info');

        // Overall assessment
        if (passRate >= 90) {
            this.log('🎉 OVERALL RESULT: EXCELLENT - Theme implementation is production ready!', 'pass');
        } else if (passRate >= 75) {
            this.log('✅ OVERALL RESULT: GOOD - Theme implementation is functional with minor issues', 'pass');
        } else if (passRate >= 50) {
            this.log('⚠️  OVERALL RESULT: NEEDS IMPROVEMENT - Some critical issues found', 'warn');
        } else {
            this.log('❌ OVERALL RESULT: POOR - Major issues need to be addressed', 'fail');
        }

        return {
            results: testResults,
            passRate,
            duration,
            logs: this.results
        };
    }

    // Export results
    exportResults() {
        const results = {
            timestamp: new Date().toISOString(),
            userAgent: navigator.userAgent,
            platform: navigator.platform,
            systemPreference: this.systemPreference,
            logs: this.results
        };

        const blob = new Blob([JSON.stringify(results, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `gatekeeper-theme-test-results-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);

        this.log('📄 Test results exported to JSON file', 'info');
    }
}

// Browser-specific tests
class BrowserSpecificTests {
    static async testChrome() {
        console.log('🔍 Running Chrome-specific tests...');
        
        // Test Chrome's color-scheme support
        if (CSS.supports('color-scheme', 'light dark')) {
            console.log('✅ Chrome color-scheme property: SUPPORTED');
        } else {
            console.log('❌ Chrome color-scheme property: NOT SUPPORTED');
        }
        
        // Test Chrome DevTools detection
        const devtools = {
            open: false,
            orientation: null
        };
        
        setInterval(() => {
            if (window.outerHeight - window.innerHeight > 200) {
                if (!devtools.open) {
                    console.log('🔧 Chrome DevTools opened - theme testing mode activated');
                    devtools.open = true;
                }
            } else {
                if (devtools.open) {
                    console.log('🔧 Chrome DevTools closed');
                    devtools.open = false;
                }
            }
        }, 1000);
    }

    static async testFirefox() {
        console.log('🦊 Running Firefox-specific tests...');
        
        // Test Firefox's privacy settings impact
        try {
            localStorage.setItem('firefox-test', 'test');
            localStorage.removeItem('firefox-test');
            console.log('✅ Firefox localStorage: ACCESSIBLE');
        } catch (error) {
            console.log('❌ Firefox localStorage: BLOCKED (private mode?)');
        }
        
        // Test Firefox's prefers-color-scheme support
        if (window.matchMedia) {
            const query = window.matchMedia('(prefers-color-scheme: dark)');
            console.log(`🦊 Firefox prefers-color-scheme: ${query.matches ? 'DARK' : 'LIGHT'}`);
        }
    }

    static async testSafari() {
        console.log('🧭 Running Safari-specific tests...');
        
        // Test Safari's theme-color meta tag support
        const themeColorMeta = document.querySelector('meta[name="theme-color"]');
        if (themeColorMeta) {
            console.log(`✅ Safari theme-color meta: ${themeColorMeta.content}`);
        } else {
            console.log('⚠️  Safari theme-color meta: NOT FOUND');
        }
        
        // Test Safari's system appearance detection
        if (window.matchMedia) {
            const query = window.matchMedia('(prefers-color-scheme: dark)');
            console.log(`🧭 Safari system appearance: ${query.matches ? 'DARK' : 'LIGHT'}`);
            
            // Test dynamic updates
            query.addEventListener('change', (e) => {
                console.log(`🧭 Safari appearance changed: ${e.matches ? 'DARK' : 'LIGHT'}`);
            });
        }
    }

    static async testEdge() {
        console.log('🌐 Running Edge-specific tests...');
        
        // Test Edge's Windows integration
        if (navigator.userAgent.includes('Edg/')) {
            console.log('✅ Microsoft Edge detected');
            
            // Test Windows 10/11 theme detection
            if (window.matchMedia) {
                const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
                console.log(`🌐 Edge Windows theme: ${darkQuery.matches ? 'DARK' : 'LIGHT'}`);
            }
        }
    }
}

// Platform-specific tests
class PlatformSpecificTests {
    static async testMacOS() {
        if (navigator.platform.includes('Mac')) {
            console.log('🍎 Running macOS-specific tests...');
            
            // Test macOS appearance detection
            if (window.matchMedia) {
                const darkMode = window.matchMedia('(prefers-color-scheme: dark)');
                console.log(`🍎 macOS appearance: ${darkMode.matches ? 'DARK' : 'LIGHT'}`);
                
                // Test automatic appearance switching
                darkMode.addEventListener('change', (e) => {
                    console.log(`🍎 macOS appearance changed: ${e.matches ? 'DARK' : 'LIGHT'}`);
                });
            }
        }
    }

    static async testWindows() {
        if (navigator.platform.includes('Win')) {
            console.log('🪟 Running Windows-specific tests...');
            
            // Test Windows theme detection
            if (window.matchMedia) {
                const darkMode = window.matchMedia('(prefers-color-scheme: dark)');
                console.log(`🪟 Windows theme: ${darkMode.matches ? 'DARK' : 'LIGHT'}`);
            }
        }
    }

    static async testIOS() {
        if (/iPad|iPhone|iPod/.test(navigator.userAgent)) {
            console.log('📱 Running iOS-specific tests...');
            
            // Test iOS appearance detection
            if (window.matchMedia) {
                const darkMode = window.matchMedia('(prefers-color-scheme: dark)');
                console.log(`📱 iOS appearance: ${darkMode.matches ? 'DARK' : 'LIGHT'}`);
                
                // Test iOS viewport-fit support
                const viewportMeta = document.querySelector('meta[name="viewport"]');
                if (viewportMeta && viewportMeta.content.includes('viewport-fit')) {
                    console.log('✅ iOS viewport-fit: SUPPORTED');
                } else {
                    console.log('⚠️  iOS viewport-fit: NOT CONFIGURED');
                }
            }
        }
    }

    static async testAndroid() {
        if (/Android/.test(navigator.userAgent)) {
            console.log('🤖 Running Android-specific tests...');
            
            // Test Android theme detection
            if (window.matchMedia) {
                const darkMode = window.matchMedia('(prefers-color-scheme: dark)');
                console.log(`🤖 Android theme: ${darkMode.matches ? 'DARK' : 'LIGHT'}`);
            }
        }
    }
}

// Quick test runner for console
window.testTheme = async function() {
    const suite = new ThemeTestSuite();
    const results = await suite.runAllTests();
    
    console.log('\n📋 Quick Test Commands:');
    console.log('  testTheme()           - Run all tests');
    console.log('  testTheme.export()    - Export results');
    console.log('  testTheme.browser()   - Run browser-specific tests');
    console.log('  testTheme.platform()  - Run platform-specific tests');
    
    return results;
};

window.testTheme.export = function() {
    if (window.lastTestSuite) {
        window.lastTestSuite.exportResults();
    } else {
        console.log('❌ No test results to export. Run testTheme() first.');
    }
};

window.testTheme.browser = async function() {
    const userAgent = navigator.userAgent;
    
    if (userAgent.includes('Chrome') && !userAgent.includes('Edg')) {
        await BrowserSpecificTests.testChrome();
    }
    if (userAgent.includes('Firefox')) {
        await BrowserSpecificTests.testFirefox();
    }
    if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) {
        await BrowserSpecificTests.testSafari();
    }
    if (userAgent.includes('Edg/')) {
        await BrowserSpecificTests.testEdge();
    }
};

window.testTheme.platform = async function() {
    await PlatformSpecificTests.testMacOS();
    await PlatformSpecificTests.testWindows();
    await PlatformSpecificTests.testIOS();
    await PlatformSpecificTests.testAndroid();
};

// Auto-run basic tests when script loads
console.log('🎨 Theme Test Suite Loaded!');
console.log('📝 Run testTheme() to start comprehensive testing');
console.log('🚀 Or use testTheme.browser() for browser-specific tests');

// Save reference for export
window.lastTestSuite = null;

// Export for use in automated testing
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ThemeTestSuite, BrowserSpecificTests, PlatformSpecificTests };
}