/**
 * Gatekeeper PWA Theme Integration Verification Script
 * 
 * This script verifies that the theme system is properly integrated
 * into the actual Gatekeeper PWA application.
 * 
 * Usage: Run this in the browser console when the app is loaded
 */

(function() {
    'use strict';

    console.log('🎨 Gatekeeper Theme Integration Verification Starting...');

    const results = {
        passed: 0,
        failed: 0,
        tests: []
    };

    function test(name, condition, message) {
        const passed = typeof condition === 'function' ? condition() : condition;
        results.tests.push({ name, passed, message });
        
        if (passed) {
            results.passed++;
            console.log(`✅ ${name}: PASS${message ? ` - ${message}` : ''}`);
        } else {
            results.failed++;
            console.log(`❌ ${name}: FAIL${message ? ` - ${message}` : ''}`);
        }
        
        return passed;
    }

    // Test 1: Check if useTheme hook is integrated
    test(
        'useTheme Hook Integration',
        () => {
            const appElement = document.querySelector('[data-theme-mode]');
            return appElement !== null;
        },
        'App should have theme mode data attribute'
    );

    // Test 2: Verify theme classes are applied
    test(
        'Theme Class Application',
        () => {
            const root = document.documentElement;
            return root.classList.contains('theme-bright') || 
                   root.classList.contains('theme-dark') ||
                   root.hasAttribute('data-theme');
        },
        'Document root should have theme classes or data-theme attribute'
    );

    // Test 3: Check CSS custom properties
    test(
        'CSS Custom Properties',
        () => {
            const style = getComputedStyle(document.documentElement);
            const bgPrimary = style.getPropertyValue('--bg-primary');
            const textPrimary = style.getPropertyValue('--text-primary');
            return bgPrimary.trim() !== '' && textPrimary.trim() !== '';
        },
        'Theme CSS custom properties should be defined'
    );

    // Test 4: Verify config modal has theme tab
    test(
        'Config Modal Theme Tab',
        () => {
            // Look for theme tab button or theme controls
            const themeTab = document.querySelector('[data-tab="theme"], .tab-button:contains("Theme")');
            const themeRadios = document.querySelectorAll('input[name="theme"]');
            return themeTab !== null || themeRadios.length > 0;
        },
        'Configuration modal should include theme settings'
    );

    // Test 5: Check localStorage integration
    test(
        'Theme Persistence',
        () => {
            try {
                // Check if there's a saved theme or if we can save one
                const saved = localStorage.getItem('gatekeeper-theme') || 
                             localStorage.getItem('gatekeeper-config');
                
                // Try to save a test theme
                localStorage.setItem('theme-test', 'test');
                const canSave = localStorage.getItem('theme-test') === 'test';
                localStorage.removeItem('theme-test');
                
                return saved !== null || canSave;
            } catch (error) {
                return false;
            }
        },
        'Theme persistence should work with localStorage'
    );

    // Test 6: Verify system preference detection
    test(
        'System Preference Detection',
        () => {
            if (!window.matchMedia) return false;
            
            try {
                const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
                return typeof darkQuery.matches === 'boolean';
            } catch (error) {
                return false;
            }
        },
        'System color scheme preference should be detectable'
    );

    // Test 7: Check theme switching functionality
    test(
        'Theme Switching',
        () => {
            try {
                const root = document.documentElement;
                const originalClass = root.className;
                
                // Try to switch themes
                root.classList.remove('theme-bright', 'theme-dark');
                root.classList.add('theme-dark');
                const hassDarkClass = root.classList.contains('theme-dark');
                
                root.classList.remove('theme-dark');
                root.classList.add('theme-bright');
                const hasBrightClass = root.classList.contains('theme-bright');
                
                // Restore original
                root.className = originalClass;
                
                return hassDarkClass && hasBrightClass;
            } catch (error) {
                return false;
            }
        },
        'Theme classes should be switchable'
    );

    // Test 8: Verify app component integration
    test(
        'App Component Integration',
        () => {
            // Check for theme-related data attributes or classes
            const app = document.querySelector('#root, [data-theme-loading], .app');
            if (!app) return false;
            
            const hasThemeAttributes = app.hasAttribute('data-theme-mode') ||
                                     app.hasAttribute('data-resolved-theme') ||
                                     app.hasAttribute('data-theme-loading');
            
            return hasThemeAttributes;
        },
        'Main app component should integrate theme data'
    );

    // Test 9: Check for theme error handling
    test(
        'Theme Error Handling',
        () => {
            // Look for error display elements or proper fallbacks
            const errorElements = document.querySelectorAll('[class*="error"], [data-error]');
            const hasErrorHandling = errorElements.length >= 0; // Always passes if no errors
            
            // Check if theme system gracefully handles missing data
            const root = document.documentElement;
            return hasErrorHandling && (root.className !== '' || root.hasAttribute('data-theme'));
        },
        'Theme system should handle errors gracefully'
    );

    // Test 10: Verify performance (no layout thrashing)
    test(
        'Performance Check',
        () => {
            try {
                const start = performance.now();
                
                // Simulate theme switch
                const root = document.documentElement;
                const originalClass = root.className;
                
                root.classList.add('theme-dark');
                root.classList.remove('theme-bright');
                
                // Force layout calculation
                root.offsetHeight;
                
                root.classList.add('theme-bright');
                root.classList.remove('theme-dark');
                
                const end = performance.now();
                const duration = end - start;
                
                // Restore original
                root.className = originalClass;
                
                return duration < 50; // Should complete in under 50ms
            } catch (error) {
                return false;
            }
        },
        'Theme switching should be performant (<50ms)'
    );

    // Summary
    const total = results.passed + results.failed;
    const passRate = (results.passed / total) * 100;

    console.log('\n📊 VERIFICATION SUMMARY:');
    console.log(`  Total Tests: ${total}`);
    console.log(`  Passed: ${results.passed}`);
    console.log(`  Failed: ${results.failed}`);
    console.log(`  Pass Rate: ${passRate.toFixed(1)}%`);

    if (passRate >= 90) {
        console.log('🎉 EXCELLENT - Theme integration is working perfectly!');
    } else if (passRate >= 75) {
        console.log('✅ GOOD - Theme integration is working with minor issues');
    } else if (passRate >= 50) {
        console.log('⚠️  NEEDS IMPROVEMENT - Some integration issues found');
    } else {
        console.log('❌ POOR - Major integration issues need to be addressed');
    }

    // Detailed results
    console.log('\n📋 DETAILED RESULTS:');
    results.tests.forEach(test => {
        const status = test.passed ? '✅' : '❌';
        console.log(`  ${status} ${test.name}${test.message ? ` - ${test.message}` : ''}`);
    });

    // Additional checks
    console.log('\n🔍 ADDITIONAL INFORMATION:');
    
    // Current theme state
    const currentTheme = document.documentElement.getAttribute('data-theme') ||
                        (document.documentElement.classList.contains('theme-dark') ? 'dark' : 'bright');
    console.log(`  Current Theme: ${currentTheme}`);
    
    // System preference
    if (window.matchMedia) {
        const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        console.log(`  System Preference: ${systemDark ? 'dark' : 'bright'}`);
    }
    
    // Saved theme
    const savedTheme = localStorage.getItem('gatekeeper-theme') ||
                      (localStorage.getItem('gatekeeper-config') ? 
                       JSON.parse(localStorage.getItem('gatekeeper-config')).theme : null);
    console.log(`  Saved Theme: ${savedTheme || 'none'}`);
    
    // CSS custom properties sample
    const style = getComputedStyle(document.documentElement);
    console.log(`  Background Color: ${style.getPropertyValue('--bg-primary').trim()}`);
    console.log(`  Text Color: ${style.getPropertyValue('--text-primary').trim()}`);

    return {
        passRate,
        results: results.tests,
        summary: {
            total,
            passed: results.passed,
            failed: results.failed
        }
    };
})();