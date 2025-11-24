import colorNames from "color-name";
import colorConvert from "color-convert";

export type RgbObject = { r: number, g: number, b: number, alpha: number };
export const transparentRgb: RgbObject = {r: 0, g: 0, b: 0, alpha: 0};
export const colorConverter = {
    anyToRgba(color: string | undefined): RgbObject | undefined {
        color = color?.replaceAll(' ', '').toLowerCase();
        if (!color || color == 'transparent' || color == 'none' || color == 'system') {
            return undefined;
        }
        if (color.startsWith('#')) {
            return colorConverter.hexToRgba(color);
        }

        if (color in colorNames) {
            const arr = colorConvert.keyword.rgb(color);
            return {r: arr[0], g: arr[1], b: arr[2], alpha: 1};
        }

        let match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(,\s*[\d.]+)?\)/);
        if (match) {
            return {r: parseInt(match[1]), g: parseInt(match[2]), b: parseInt(match[3]), alpha: match[4] ? parseFloat(match[4].substring(1)) : 1};
        }
        match = color.match(/hsla?\((\d+),\s*(\d+)%,\s*(\d+)%(\s*,\s*[\d.]+)?\)/);
        if (match) {
            return colorConverter.hslaToRgba(color);
        }

        throw new Error(`Unsupported color format: ${color}. only hex, rgb(a) and hsl(a) are supported.`);
    },

    hexToRgba(str: string): RgbObject {
        let h = str.startsWith('#') ? str.slice(1).toUpperCase() : str.toUpperCase();
        if (h.length === 3 || h.length === 4) {
            // Shorthand format: #RGB -> #RRGGBB or #RGBA -> #RRGGBBAA
            h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2] + (h.length === 4 ? h[3] + h[3] : '');
        }

        if (h.length === 6 || h.length === 8) {
            // Standard format: #RRGGBB or #RRGGBBAA
            const r = parseInt(h.substring(0, 2), 16);
            const g = parseInt(h.substring(2, 4), 16);
            const b = parseInt(h.substring(4, 6), 16);
            if (h.length === 8) {
                return {r, g, b, alpha: parseInt(h.substring(6, 8), 16) / 255};
            }
            return {r, g, b, alpha: 1};
        }
        // Invalid Hex string
        throw new Error(`Invalid Hex color string: ${str}`);
    },
    rgbaToHex(rgba: RgbObject | undefined, fallback: `#${string}` = '#00000000'): `#${string}` {
        if (!rgba) {
            return fallback;
        }
        const toHex = (value: number): string => {
            const hex = value.toString(16).toUpperCase();
            return hex.length === 1 ? '0' + hex : hex;
        };

        // 4. Convert alpha to two-digit hexadecimal string if not 1.
        let aHex = rgba.alpha < 1 ? toHex(Math.round(rgba.alpha * 255)) : '';

        // 5. Combine and return the Hex string.
        return `#${toHex(rgba.r)}${toHex(rgba.g)}${toHex(rgba.b)}${aHex}`;
    },

    hslaToRgba(str: string): RgbObject {
        // 1. Use a regular expression to extract H, S, L, A values.
        // This regex handles both HSL and HSLA formats.
        const match = str.match(/hsla?\(\s*(\d+\.?\d*|\.\d+)\s*,\s*(\d+\.?\d*|\.\d+)%\s*,\s*(\d+\.?\d*|\.\d+)%\s*(?:,\s*(\d+\.?\d*|\.\d+)\s*)?\)/i);

        if (!match) {
            throw new Error(`Invalid HSLA color string: ${str}`);
        }

        // 2. Assign and normalize H, S, L, A.
        let h = parseFloat(match[1]) / 360; // H: 0-360 -> 0-1
        let s = parseFloat(match[2]) / 100; // S: 0-100% -> 0-1
        let l = parseFloat(match[3]) / 100; // L: 0-100% -> 0-1
        let a = match[4] ? parseFloat(match[4]) : 1; // A: 0-1 (default to 1)

        let r, g, b;

        if (s === 0) {
            // Achromatic (gray)
            r = g = b = l;
        } else {
            // Helper function for the color channel calculation
            const hue2rgb = (p: number, q: number, t: number) => {
                if (t < 0) t += 1;
                if (t > 1) t -= 1;
                if (t < 1 / 6) return p + (q - p) * 6 * t;
                if (t < 1 / 2) return q;
                if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
                return p;
            };

            const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
            const p = 2 * l - q;

            r = hue2rgb(p, q, h + 1 / 3);
            g = hue2rgb(p, q, h);
            b = hue2rgb(p, q, h - 1 / 3);
        }

        // 3. Convert R, G, B from 0-1 range to 0-255 integers.
        return {
            r: Math.round(r * 255),
            g: Math.round(g * 255),
            b: Math.round(b * 255),
            alpha: a,
        };
    },
};