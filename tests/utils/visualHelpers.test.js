/**
 * Tests for Visual Helper Utilities
 * Ensures visual formatting functions work correctly
 */

describe('Visual Helpers', () => {
    let visualHelpers;

    beforeAll(() => {
        visualHelpers = require('../../src/utils/visualHelpers');
    });

    it('should export expected functions', () => {
        expect(visualHelpers).toBeDefined();
        expect(typeof visualHelpers.createProgressBar).toBe('function');
        expect(typeof visualHelpers.getStatusColor).toBe('function');
        expect(typeof visualHelpers.formatDataGrid).toBe('function');
        expect(typeof visualHelpers.createHeader).toBe('function');
    });

    describe('createProgressBar', () => {
        it('should create a progress bar with correct percentage', () => {
            const result = visualHelpers.createProgressBar(5, 10);
            expect(result).toHaveProperty('bar');
            expect(result).toHaveProperty('percentage');
            expect(result.percentage).toBe('50.0');
        });

        it('should handle edge cases', () => {
            const full = visualHelpers.createProgressBar(10, 10);
            expect(full.percentage).toBe('100.0');

            const empty = visualHelpers.createProgressBar(0, 10);
            expect(empty.percentage).toBe('0.0');
        });
    });

    describe('formatDataGrid', () => {
        it('should format data into grid structure', () => {
            const data = ['Item 1', 'Item 2', 'Item 3'];
            const result = visualHelpers.formatDataGrid(data, 2);
            expect(typeof result).toBe('string');
            expect(result.length).toBeGreaterThan(0);
        });
    });

    describe('createHeader', () => {
        it('should create formatted header', () => {
            const result = visualHelpers.createHeader('Test Title');
            expect(typeof result).toBe('string');
            expect(result).toContain('Test Title');
        });
    });
});
