import Bot from "./src/Bot";
import { dataSource } from "./db";
import puppeteer from "puppeteer";

async function main() {
  try {
    // todo: logger init
    await dataSource.initialize();

    const myBot = new Bot();
    await myBot.init();

    if (process.argv.includes("--report")) {
      await myBot.getReport();
      return;
    }

    await myBot.login();
    await myBot.likeRecentNichePosts();
    await myBot.getReport();

    // myBot.exit();
  } catch (error) {
    throw error;
  }
}

main();
