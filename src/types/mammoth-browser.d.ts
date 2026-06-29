// mammoth ships a browser bundle without bundled types for this subpath.
declare module "mammoth/mammoth.browser" {
  export function convertToHtml(input: {
    arrayBuffer: ArrayBuffer;
  }): Promise<{ value: string; messages: unknown[] }>;
  export function extractRawText(input: {
    arrayBuffer: ArrayBuffer;
  }): Promise<{ value: string; messages: unknown[] }>;
  const _default: {
    convertToHtml: typeof convertToHtml;
    extractRawText: typeof extractRawText;
  };
  export default _default;
}
