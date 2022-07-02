export interface ITag {
  name: string;
  priority: number;
}

export interface IConfig {
  username: string;
  password: string;
  tagsToLike?: ITag[];
  hasToStepAuth?: boolean;
}
