import {describe, expect, test} from 'bun:test';
import {getConfigJsonSchema} from '../src/schema.ts';

describe('JSON schema', () => {
    test('describes all config sections', () => {
        const schema = getConfigJsonSchema();

        expect(schema.$schema).toContain('json-schema.org');
        expect(schema.$id).toContain('fluttergen.schema.json');
        expect(schema.title).toBe('fluttergen configuration');

        for (const key of ['info', 'icon', 'splash', 'notificationIcon', 'variables', 'workflows', 'profiles', 'signing', 'permissions', 'release']) {
            expect(schema.properties).toHaveProperty(key);
        }
    });
});
