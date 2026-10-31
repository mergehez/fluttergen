import fs from "fs";
import path from "path";
import {KnownError} from "knownError.ts";

function escapeXml(value: string): string {
    return value
        .replaceAll('&', '&amp;')
        .replaceAll('"', '&quot;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;');
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function detectIndent(text: string, fallback: string): string {
    const match = /(?:^|\n)([ \t]+)</.exec(text);
    return match ? match[1] : fallback;
}

/**
 * Adds or replaces a `<color name="...">` entry without reformatting the rest of
 * the file, so comments and custom formatting are preserved.
 */
export function setColorResource(filePath: string, colorName: string, value: string): 'created' | 'updated' {
    const escapedName = escapeRegExp(colorName);
    const escapedValue = escapeXml(value);

    if (!fs.existsSync(filePath)) {
        fs.mkdirSync(path.dirname(filePath), {recursive: true});
        fs.writeFileSync(filePath, [
            '<?xml version="1.0" encoding="utf-8"?>',
            '<resources>',
            `    <color name="${escapeXml(colorName)}">${escapedValue}</color>`,
            '</resources>',
            '',
        ].join('\n'));
        return 'created';
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const colorRegex = new RegExp(`(<color\\s+[^>]*\\bname="${escapedName}"[^>]*>)([\\s\\S]*?)(</color>)`);
    const selfClosingRegex = new RegExp(`<color\\s+[^>]*\\bname="${escapedName}"[^>]*/>`);

    let updated: string;
    if (colorRegex.test(content)) {
        updated = content.replace(colorRegex, (_match, open: string, _old: string, close: string) => `${open}${escapedValue}${close}`);
    } else if (selfClosingRegex.test(content)) {
        updated = content.replace(selfClosingRegex, `<color name="${escapeXml(colorName)}">${escapedValue}</color>`);
    } else {
        const indent = detectIndent(content, '    ');
        updated = insertBeforeClosingTag(
            content,
            'resources',
            `${indent}<color name="${escapeXml(colorName)}">${escapedValue}</color>`
        );
    }

    fs.writeFileSync(filePath, updated);
    return 'updated';
}

/**
 * Adds or replaces an `<item name="...">` inside a `<style name="...">` block.
 * Returns `false` when the style does not exist.
 */
export function setStyleItem(
    filePath: string,
    styleName: string,
    itemName: string,
    value: string,
    required: boolean = true
): boolean {
    const content = fs.readFileSync(filePath, 'utf-8');
    const styleRegex = new RegExp(`(<style\\s+[^>]*\\bname="${escapeRegExp(styleName)}"[^>]*>)([\\s\\S]*?)(</style>)`);
    const styleMatch = styleRegex.exec(content);
    if (!styleMatch) {
        console.warn(`Warning: style '${styleName}' was not found in ${filePath}, skipping '${itemName}'.`);
        return false;
    }

    const fullMatch = styleMatch[0];
    const openTag = styleMatch[1];
    const body = styleMatch[2];
    const closeTag = styleMatch[3];

    const escapedItemName = escapeRegExp(itemName);
    const escapedValue = escapeXml(value);
    const itemRegex = new RegExp(`(<item\\s+[^>]*\\bname="${escapedItemName}"[^>]*>)([\\s\\S]*?)(</item>)`);
    const selfClosingItemRegex = new RegExp(`<item\\s+[^>]*\\bname="${escapedItemName}"[^>]*/>`);

    let newBody = body;
    if (itemRegex.test(body)) {
        newBody = body.replace(itemRegex, (_match, itemOpen: string, _old: string, itemClose: string) => `${itemOpen}${escapedValue}${itemClose}`);
    } else if (selfClosingItemRegex.test(body)) {
        newBody = body.replace(selfClosingItemRegex, `<item name="${escapeXml(itemName)}">${escapedValue}</item>`);
    } else if (required) {
        const indent = detectIndent(body, '        ');
        const lastNewline = body.lastIndexOf('\n');
        if (lastNewline === -1) {
            newBody = `${body} <item name="${escapeXml(itemName)}">${escapedValue}</item> `;
        } else {
            const beforeClosing = body.slice(0, lastNewline + 1);
            const closingIndent = body.slice(lastNewline + 1);
            newBody = `${beforeClosing}${indent}<item name="${escapeXml(itemName)}">${escapedValue}</item>\n${closingIndent}`;
        }
    }

    if (newBody === body) {
        return true;
    }

    const updated = content.slice(0, styleMatch.index) + openTag + newBody + closeTag + content.slice(styleMatch.index + fullMatch.length);
    fs.writeFileSync(filePath, updated);
    return true;
}

function insertBeforeClosingTag(content: string, tagName: string, line: string): string {
    const closeTag = `</${tagName}>`;
    const closeIndex = content.lastIndexOf(closeTag);
    if (closeIndex === -1) {
        throw new KnownError(`Could not find ${closeTag} while updating the file.`);
    }

    const before = content.slice(0, closeIndex);
    const after = content.slice(closeIndex);
    const needsNewline = before.length > 0 && !before.endsWith('\n');
    return `${before}${needsNewline ? '\n' : ''}${line}\n${after}`;
}
