declare module 'plist' {
    interface PlistOptions {
        pretty?: boolean;
        indent?: string;
        escapeHTML?: boolean;
    }

    const plist: {
        parse(xml: string): any;
        build(value: any, options?: PlistOptions): string;
    };

    export default plist;
}
