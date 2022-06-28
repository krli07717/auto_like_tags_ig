import config from "../config.json";
import type { Page } from "puppeteer";
import log from "./logger";

const INSTAGRAM_WEBSITE = "https://www.instagram.com/";

export default class Bot {
  readonly username: string = config.username;
  readonly password: string = config.password;
  private page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async init() {
    try {
      log("bot init");
      await this.login();
      log("login success");
    } catch (error) {
      throw error;
    }
  }

  private async login() {
    try {
      log("bot login");
      await this.page.goto(INSTAGRAM_WEBSITE);
      const usernameInput = await this.page.waitForSelector(
        "input[name=username]"
      );
      await usernameInput?.type(this.username);
      const passwordInput = await this.page.waitForSelector(
        "input[name=password]"
      );
      await passwordInput?.type(this.password);
      await passwordInput?.press("Enter");
    } catch (error) {
      throw error;
    }
  }
}
