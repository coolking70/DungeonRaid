declare module "@art/*.png" {
  const url: string;
  export default url;
}

declare module "@sheet" {
  export const SHEET: { url: string; scale: number; label: string };
}
