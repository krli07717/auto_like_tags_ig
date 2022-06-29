import Bot from "./src/Bot";
import puppeteer from "puppeteer";

async function main() {
  try {
    const browser = await puppeteer.launch({ headless: false, slowMo: 150 });
    const page = await browser.newPage();
    const myBot = new Bot(page);
    await myBot.init();
    await myBot.likeRecentNichePosts();
  } catch (error) {
    throw error;
  }
}

main();

// How many “Likes” can you do?

// 120 per hour, or
// 300-500 per day

// don't act like a bot, leave space
// leave comment report with account, posts,
