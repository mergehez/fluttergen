import fs from "fs";

function getDeepValue(obj: Record<string, any>, path: string): any {
    const keys = path.split('.');
    let current: any = obj;
    for (const key of keys) {
        if (current && key in current) {
            current = current[key];
        } else {
            return '__not_found__';
        }
    }
    return current;
}

export function usePlaceholderReplacer(filePath: string) {
    function replacePlaceholders(prefix: string, variables: Record<string, any>) {
        let content = fs.readFileSync(filePath, 'utf-8').split('\n').map(line => {
            return line.replace(new RegExp(`\\{${prefix}\\.([a-zA-Z0-9_.]+)\\}`, 'g'), (match, p1) => {
                const value = getDeepValue(variables, p1);
                console.log(`Replacing placeholder {${prefix}.${p1}} with value:`, value);
                return value !== '__not_found__' ? value : match;
            });
        }).join('\n');
        // {prefix.key} => variables[key]
        // {prefix.key1.key2} => variables[key1][key2]

        fs.writeFileSync(filePath, content);
    }

    return {
        replace: replacePlaceholders
    }
}