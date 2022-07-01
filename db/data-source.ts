import "reflect-metadata";
import { DataSource } from "typeorm";
import { BotUser, Like, Niche } from "./entity";

const AppDataSource = new DataSource({
  type: "sqlite",
  database: "igbot.sqlite",
  synchronize: true,
  logging: false,
  entities: [BotUser, Like, Niche],
  migrations: [],
  subscribers: [],
});

export default AppDataSource;
