import config from "../config.json";
import type { Page } from "puppeteer";
import log from "./logger";

const INSTAGRAM_WEBSITE = "https://www.instagram.com/";
const getTagUrl = (tag: string) =>
  `https://www.instagram.com/explore/tags/${tag}/`;
const LIKES_LIMIT_OF_DAY = 5;

export default class Bot {
  readonly username: string = config.username;
  readonly password: string = config.password;
  readonly tagsToLike: string[] = config.tagsToLike;
  likesLeaved = 0; /** should get from db */

  private page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async init() {
    try {
      log("bot init");
      await this.page.goto(INSTAGRAM_WEBSITE);
      await this.login();
    } catch (error) {
      throw error;
    }
  }

  async likeRecentNichePosts() {
    try {
      log("like recent niche posts");
      await this.findFirstRecentNichePost();
      //todo: while < daily likes limit
      //todo: speed in ~120 likes/hour
      //todo: remember first like post time, so next time won't start from it again
      while (this.likesLeaved < LIKES_LIMIT_OF_DAY) {
        await this.likePost();
        await this.goToNextPost();
      }
      log(`likes reached day limit ${LIKES_LIMIT_OF_DAY}`);
      //handle if there's no more posts
    } catch (error) {
      throw error;
    }
  }

  private async likePost() {
    try {
      const shouldLikeThis = await this.shouldILikeThis();
      if (!shouldLikeThis) {
        return;
      }
      const like = await this.page.$eval("*[aria-label=讚]", (node) =>
        node.parentElement?.parentElement?.click()
      ); // click like

      const user = await this.page.$eval(
        "*[role=dialog] h2",
        (node) => node.textContent
      );
      log(`like post from ${user}`); //store to db

      this.likesLeaved++;

      await this.page.waitForTimeout(5000);
    } catch (error) {
      throw error;
    }
  }

  private async goToNextPost() {
    try {
      log("go to next post");
      await this.page.$eval("*[aria-label=下一步]", (node) =>
        node.parentElement?.click()
      );
      await this.ensurePostModalIsReady();
    } catch (error) {
      throw error;
    }
  }

  private async ensurePostModalIsReady() {
    try {
      await this.page.waitForSelector(
        "*[role=dialog] h2"
      ); /** wait for first post user selector */
    } catch (error) {
      throw error;
    }
  }

  private async shouldILikeThis() {
    try {
      /** likes in niche hashtag group, where not-yet-liked, likes-of-post <= 200, non-follower-account */
      // todo:
      // check if already restart from past last time

      // check if already liked
      const liked = await this.page.$("*[aria-label=收回讚]");
      if (liked) {
        return false;
      }
      // check if user is already follower

      // check if likes-of-post <= 200

      // check if is already 2nd post of same user I've liked today

      return true;
    } catch (error) {
      throw error;
    }
  }

  private async findFirstRecentNichePost() {
    try {
      log("find first recent niche post");
      await this.page.goto(
        getTagUrl(
          this.tagsToLike[0]
        ) /** niche tags should be hot or should be spreaded; should have a priority list */
      ); /** open other pages and like? sound too Bot */
      await this.handleModalDialog();
      const firstPostLink = await this.page.waitForSelector(
        "h2:nth-child(2) + div *[role=link]"
      );
      if (!firstPostLink) throw new Error("first post link not found on page");
      await firstPostLink.click();
      await this.ensurePostModalIsReady();
    } catch (error) {
      throw error;
    }
  }

  private async login() {
    try {
      log("bot login");
      const usernameInput = await this.page.waitForSelector(
        "input[name=username]"
      );
      await usernameInput?.type(this.username);
      const passwordInput = await this.page.waitForSelector(
        "input[name=password]"
      );
      await passwordInput?.type(this.password);
      await passwordInput?.press("Enter");
      await this.page.waitForNavigation();
    } catch (error) {
      throw error;
    }
  }

  private async handleModalDialog() {
    try {
      log("handle modal dialog");
      const dialog = await this.page.$("*[role=dialog] button:last-child");
      if (dialog) {
        await dialog.click();
      }
    } catch (error) {
      throw error;
    }
  }
}
