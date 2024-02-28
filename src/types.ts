export type Cursor = {
  name: string;
  color: string;
};

export type EmptyText = {
  text: string;
};

export type CustomText = {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  author?: string;
  title?: boolean;
  list?: boolean;
  hr?: boolean;
  blockquote?: boolean;
  code?: boolean;
};

declare module "slate" {
  interface CustomTypes {
    Text: CustomText & EmptyText;
  }
}
