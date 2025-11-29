import fs from "fs";
import path from "path";

export function useIosContentsJson(outputPath: string) {
    fs.mkdirSync(path.dirname(outputPath), {recursive: true});
    return {
        images: [] as any[],
        add: function (idiom: string, size: string | undefined, scale: string, filename: string, appearances?: 'dark' | 'monochrome') {
            this.images.push({
                idiom,
                size,
                scale,
                filename,
                appearances: appearances === 'dark'
                    ? [{appearance: "luminosity", value: "dark"}]
                    : appearances === 'monochrome'
                        ? [{appearance: "monochromatic"}]
                        : appearances,
            });
        },
        deleteOldFiles: function () {
            const files = fs.readdirSync(path.dirname(outputPath));
            for (const file of files) {
                if (file !== 'Contents.json') {
                    fs.unlinkSync(path.join(path.dirname(outputPath), file));
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