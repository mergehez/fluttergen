import fs from "fs";
import path from "path";

export function useIosContentsJson(outputPath: string) {
    fs.mkdirSync(path.dirname(outputPath), {recursive: true});
    return {
        images: [] as any[],
        add: function (idiom: string, size: string | undefined, scale: string, filename: string, appearances?: 'dark' | 'tinted' | 'monochrome') {
            this.images.push({
                idiom,
                size,
                scale,
                filename,
                appearances: appearances === 'dark'
                    ? [{appearance: "luminosity", value: "dark"}]
                    : appearances === 'tinted' || appearances === 'monochrome'
                        ? [{appearance: "luminosity", value: "tinted"}]
                        : appearances,
            });
        },
        deleteOldFiles: function () {
            const folder = path.dirname(outputPath);
            const files = fs.readdirSync(folder);
            for (const file of files) {
                // Only remove generated image assets; leave unrelated files (and Contents.json) untouched.
                if (file !== 'Contents.json' && /\.(png|jpe?g|gif|webp|pdf)$/i.test(file)) {
                    fs.unlinkSync(path.join(folder, file));
                }
            }
        },
        save: function () {
            fs.writeFileSync(outputPath, JSON.stringify({
                images: this.images,
                info: {version: 1, author: "fluttergen"},
            }, null, 2));
        }
    }
}