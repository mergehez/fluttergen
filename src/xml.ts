import xml2js from 'xml2js';


export async function useXmlParser(xmlString: string) {
    const content = await xml2js.parseStringPromise(xmlString);

    return [
        content,
        (obj: any) => {
            const builder = new xml2js.Builder({
                renderOpts: {pretty: true, indent: '\t', newline: '\n'},
                allowSurrogateChars: true,
                xmldec: {version: '1.0', standalone: false, encoding: 'utf-8'}
            });
            return builder.buildObject(obj);
        }
    ] as const
}