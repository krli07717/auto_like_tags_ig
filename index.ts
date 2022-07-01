import Bot from "./src/Bot";
import { dataSource } from "./db";

async function main() {
  try {
    // todo: logger init

    await dataSource.initialize();

    const myBot = new Bot();
    await myBot.init();
    await myBot.login();
    await myBot.likeRecentNichePosts();
  } catch (error) {
    throw error;
  }
}

main();
