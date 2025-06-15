/**
 * Test Suite: Centralized Constants
 * Validates the consolidated visual constants and their proper structure
 */

const { BotColors, StatusEmojis, VisualPatterns } = require('../../src/utils/constants');

describe('Constants Module', () => {
    describe('BotColors', () => {
        test('should have all required color constants', () => {
            const requiredColors = [
                'PRIMARY', 'SUCCESS', 'WARNING', 'ERROR', 'INFO',
                'SECONDARY', 'HEALTHY', 'PREMIUM'
            ];

            requiredColors.forEach(color => {
                expect(BotColors).toHaveProperty(color);
                expect(typeof BotColors[color]).toBe('number');
                expect(BotColors[color]).toBeGreaterThanOrEqual(0);
                expect(BotColors[color]).toBeLessThanOrEqual(0xFFFFFF);
            });
        });

        test('should have house colors for Hogwarts houses', () => {
            const houseColors = [
                'HOUSE_GRYFFINDOR', 'HOUSE_HUFFLEPUFF',
                'HOUSE_RAVENCLAW', 'HOUSE_SLYTHERIN'
            ];

            houseColors.forEach(house => {
                expect(BotColors).toHaveProperty(house);
                expect(typeof BotColors[house]).toBe('number');
            });
        });

        test('should use valid Discord.js color format (hex numbers)', () => {
            Object.values(BotColors).forEach(color => {
                expect(typeof color).toBe('number');
                expect(color.toString(16).length).toBeLessThanOrEqual(6);
            });
        });
    });

    describe('StatusEmojis', () => {
        test('should have all core status emojis', () => {
            const coreEmojis = [
                'SUCCESS', 'ERROR', 'WARNING', 'INFO', 'LOADING',
                'IN_PROGRESS', 'COMPLETED', 'HEALTHY', 'READY'
            ];

            coreEmojis.forEach(emoji => {
                expect(StatusEmojis).toHaveProperty(emoji);
                expect(typeof StatusEmojis[emoji]).toBe('string');
                expect(StatusEmojis[emoji].length).toBeGreaterThan(0);
            });
        });

        test('should have timer-specific emojis', () => {
            const timerEmojis = ['TIMER_ACTIVE', 'TIMER_PAUSED', 'TIMER_STOPPED'];

            timerEmojis.forEach(emoji => {
                expect(StatusEmojis).toHaveProperty(emoji);
                expect(typeof StatusEmojis[emoji]).toBe('string');
            });
        });

        test('should have house-specific emojis', () => {
            const houseEmojis = [
                'HOUSE_GRYFFINDOR', 'HOUSE_HUFFLEPUFF',
                'HOUSE_RAVENCLAW', 'HOUSE_SLYTHERIN'
            ];

            houseEmojis.forEach(emoji => {
                expect(StatusEmojis).toHaveProperty(emoji);
                expect(typeof StatusEmojis[emoji]).toBe('string');
            });
        });

        test('should not have duplicate emoji values for different meanings', () => {
            const values = Object.values(StatusEmojis);
            const uniqueValues = [...new Set(values)];

            // Allow some duplicates (like SUCCESS and COMPLETED both being ✅)
            // but ensure we don't have too many duplicates
            expect(uniqueValues.length).toBeGreaterThan(values.length * 0.7);
        });
    });

    describe('VisualPatterns', () => {
        test('should have progress bar configuration', () => {
            expect(VisualPatterns).toHaveProperty('PROGRESS_BAR');
            expect(VisualPatterns.PROGRESS_BAR).toHaveProperty('FILLED');
            expect(VisualPatterns.PROGRESS_BAR).toHaveProperty('EMPTY');
            expect(VisualPatterns.PROGRESS_BAR).toHaveProperty('DEFAULT_LENGTH');

            expect(typeof VisualPatterns.PROGRESS_BAR.DEFAULT_LENGTH).toBe('number');
            expect(VisualPatterns.PROGRESS_BAR.DEFAULT_LENGTH).toBeGreaterThan(0);
        });

        test('should have separator patterns', () => {
            expect(VisualPatterns).toHaveProperty('SEPARATORS');

            const separators = ['DASH', 'DOT', 'ARROW', 'BULLET'];
            separators.forEach(sep => {
                expect(VisualPatterns.SEPARATORS).toHaveProperty(sep);
                expect(typeof VisualPatterns.SEPARATORS[sep]).toBe('string');
            });
        });

        test('should have emphasis patterns', () => {
            expect(VisualPatterns).toHaveProperty('EMPHASIS');

            const emphasis = ['BOLD', 'ITALIC', 'CODE', 'BLOCK'];
            emphasis.forEach(emp => {
                expect(VisualPatterns.EMPHASIS).toHaveProperty(emp);
                expect(typeof VisualPatterns.EMPHASIS[emp]).toBe('string');
            });
        });
    });

    describe('Module Integration', () => {
        test('should export all required constants', () => {
            expect(BotColors).toBeDefined();
            expect(StatusEmojis).toBeDefined();
            expect(VisualPatterns).toBeDefined();
        });

        test('should be importable by other modules', () => {
            // This test ensures the module can be required without errors
            expect(() => {
                require('../../src/utils/constants');
            }).not.toThrow();
        });

        test('should have consistent naming conventions', () => {
            // All color constants should be UPPER_CASE
            Object.keys(BotColors).forEach(key => {
                expect(key).toMatch(/^[A-Z_]+$/);
            });

            // All emoji constants should be UPPER_CASE
            Object.keys(StatusEmojis).forEach(key => {
                expect(key).toMatch(/^[A-Z_]+$/);
            });
        });
    });
});
