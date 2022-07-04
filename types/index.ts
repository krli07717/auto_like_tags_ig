export interface ITag {
  name: string;
  priority: number;
}

export interface IConfig {
  username: string;
  password: string;
  tagsToLike: ITag[] | Omit<ITag, "priority">[];
  hasTwoStepAuth?: boolean;
}
