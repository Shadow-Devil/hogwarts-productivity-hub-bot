/**
 * Tests for Visual Helper Utilities
 * Ensures visual formatting functions work correctly
 */

import { describe, expect, it } from '@jest/globals';

import { createHeader, createProgressBar, formatDataGrid, getStatusColor } from '../../src/utils/visualHelpers';

describe('Visual Helpers', () => {


    it('should export expected functions', () => {
        expect(typeof createProgressBar).toBe('function');
        expect(typeof getStatusColor).toBe('function');
        expect(typeof formatDataGrid).toBe('function');
        expect(typeof createHeader).toBe('function');
    });

    describe('createProgressBar', () => {
        it('should create a progress bar with correct percentage', () => {
            const result = createProgressBar(5, 10);
            expect(result).toHaveProperty('bar');
            expect(result).toHaveProperty('percentage');
            expect(result.percentage).toBe('50.0');
        });

        it('should handle edge cases', () => {
            const full = createProgressBar(10, 10);
            expect(full.percentage).toBe('100.0');

            const empty = createProgressBar(0, 10);
            expect(empty.percentage).toBe('0.0');
        });
    });

    describe('formatDataGrid', () => {
        it('should format data into grid structure', () => {
            const data = ['Item 1', 'Item 2', 'Item 3'];
            const result = formatDataGrid(data, {});
            expect(typeof result).toBe('string');
            expect(result.length).toBeGreaterThan(0);
        });
    });

    describe('createHeader', () => {
        it('should create formatted header', () => {
            const result = createHeader('Test Title');
            expect(typeof result).toBe('string');
            expect(result).toContain('Test Title');
        });
    });
});
