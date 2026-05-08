declare module "*.scss" {
  const content: Record<string, string>;
  export default content;
}

declare module "*/translations.json" {
  const content: Record<string, Record<string, Record<string, string>>>;
  export default content;
}
