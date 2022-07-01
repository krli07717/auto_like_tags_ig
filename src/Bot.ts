import puppeteer from "puppeteer";
import type { Page } from "puppeteer";
import log from "./logger";
import { BotUser, Like, Niche, dataSource } from "../db";
import { DateTime } from "luxon";
import type { IConfig, ITag } from "../types";
import * as Config from "../config.json";

const checkConfig = (config: IConfig) => config;
const convertType = <T>(arg: any) => arg as T;

const LIKES_LIMIT_OF_DAY = 20;
const LIKES_LIMIT_PER_NICHE = 6;
const LIKE_INTERVAL_MILLISECONDS = 2000; //todo: speed in ~120 likes/hour
const INSTAGRAM_WEBSITE = "https://www.instagram.com/";
const getTagUrl = (tag: string) =>
  `https://www.instagram.com/explore/tags/${tag}/`;

export default class Bot {
  readonly username: string = Config.username;
  private readonly password: string = Config.password;
  niches: Niche[];

  likesLeavedToday: number;
  currentNiche: Niche;
  currentNicheLikes: number;

  private page: Page;

  constructor() {}

  async init() {
    try {
      log("bot init");
      await this.initDb();
      this.niches = this.niches.sort((a, b) => a.priority - b.priority);

      // check likes today reach limit
      await this.getLikesLeavedToday();
      if (this.likesLeavedToday >= LIKES_LIMIT_OF_DAY)
        throw new Error("Likes leaved today already reach limit");

      // todo: check followers
    } catch (error) {
      throw error;
    }
  }

  private async prepareBrowserPage() {
    try {
      log("preparing browser page");
      // init browser & page
      const browser = await puppeteer.launch({ headless: false, slowMo: 150 });
      this.page = await browser.newPage();
    } catch (error) {
      throw error;
    }
  }

  private async initDb() {
    try {
      log("init db");
      const config = checkConfig(Config);
      const { username, tagsToLike } = config;
      // await dataSource.initialize();

      // check if botUser already exists
      const dbBotUser = await dataSource.manager.findOneBy(BotUser, {
        username,
      });

      if (!dbBotUser) {
        if (!config.tagsToLike?.length)
          throw new Error(
            "new user must specify niche tags as string[] in config.json"
          );
        //todo: ensure tag name all diffrent string, priority all diffrent number

        const tags = convertType<ITag[]>(tagsToLike);

        // create niches
        const niches = [];
        for (let i = 0; i < tags.length; i++) {
          const niche = new Niche();
          niche.nameTag = tags[i].name;
          niche.priority = tags[i].priority;
          niche.likes = [];
          niches.push(niche);
          await dataSource.manager.save(niche);
          log("create new niche", niche.nameTag);
        }

        // create botUser
        const botUser = new BotUser();
        botUser.username = username;
        botUser.niche = niches;
        await dataSource.manager.save(botUser);
        log("created new bot user", username);
        this.niches = niches;
        return;
      }

      const niches = await dataSource
        .getRepository(Niche)
        .createQueryBuilder("niche")
        .where("niche.botUserId = :id", { id: dbBotUser.id })
        .getMany();

      if (tagsToLike?.length) {
        // todo: handle update tags
      }

      log("use db niches");
      this.niches = niches;
    } catch (error) {
      throw error;
    }
  }

  private async getCurrentNicheLikes() {
    try {
      const nicheId = this.currentNiche.id;
      const todayStart = DateTime.now().toFormat("yyyy-LL-dd") + " 00:00:00";
      const todayEnd = DateTime.now().toFormat("yyyy-LL-dd") + " 23:59:59";
      const nicheLikes = await dataSource
        .getRepository(Like)
        .createQueryBuilder("like") /** ambiguous column name */
        .select("__like")
        .from(Like, "__like")
        .where("__like.timestamp >= :todayStart", { todayStart })
        .andWhere("__like.timestamp <= :todayEnd", { todayEnd })
        .andWhere("__like.nicheId = :nid", { nid: nicheId })
        .getMany();

      this.currentNicheLikes = nicheLikes.length;
      log(
        `niche ${this.currentNiche.nameTag} likes today:`,
        this.currentNicheLikes
      );
    } catch (error) {
      throw error;
    }
  }

  private async getLikesLeavedToday() {
    try {
      const todayStart = DateTime.now().toFormat("yyyy-LL-dd") + " 00:00:00";
      const todayEnd = DateTime.now().toFormat("yyyy-LL-dd") + " 23:59:59";
      const nicheIds = this.niches.map((n) => n.id);

      const allLikesToday = await dataSource
        .getRepository(Like)
        .createQueryBuilder("like")
        .select("_like")
        .from(Like, "_like")
        .where("_like.timestamp >= :todayStart", { todayStart })
        .andWhere("_like.timestamp <= :todayEnd", { todayEnd })
        .andWhere("_like.nicheId IN (:...id)", { id: nicheIds })
        .getMany();

      this.likesLeavedToday = allLikesToday.length;
      log("bot likes leaved today: ", this.likesLeavedToday);
    } catch (error) {
      throw error;
    }
  }

  async likeRecentNichePosts() {
    try {
      log("like recent niche posts");
      if (!this.niches || !this.page)
        throw new Error("bot not yet prepared, try init() then login()");

      for (let i = 0; i < this.niches.length; i++) {
        if (this.likesLeavedToday >= LIKES_LIMIT_OF_DAY) break;
        this.currentNiche = this.niches[i];
        await this.getCurrentNicheLikes();
        if (this.currentNicheLikes >= LIKES_LIMIT_PER_NICHE) continue;
        await this.findFirstRecentNichePost();
        await this.likeNiche();
      }

      if (this.likesLeavedToday >= LIKES_LIMIT_OF_DAY) {
        log(`likes reached day limit ${LIKES_LIMIT_OF_DAY}`);
      } else {
        log("auto like process complete.");
      }
      process.exit(0);
    } catch (error) {
      throw error;
    }
  }

  private async likeNiche() {
    try {
      log("liking niche: ", this.currentNiche.nameTag);
      while (
        this.likesLeavedToday < LIKES_LIMIT_OF_DAY &&
        this.currentNicheLikes < LIKES_LIMIT_PER_NICHE
      ) {
        /**TODO: reach niche limit then getNextNiche */
        await this.likePost();
        await this.goToNextPost();
      }
      if (this.currentNicheLikes >= LIKES_LIMIT_PER_NICHE) {
        log(
          `niche ${this.currentNiche.nameTag} reach day limit: `,
          LIKES_LIMIT_PER_NICHE
        );
      }
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

      await this.page.$eval("*[aria-label=讚]", (node) =>
        node.parentElement?.parentElement?.click()
      ); // click like

      const userLiked = await this.page.$eval(
        "*[role=dialog] h2",
        (node) => node.textContent
      );
      log(`like post from ${userLiked}`);

      await this.storeLikeToDb(userLiked);

      this.likesLeavedToday++;
      this.currentNicheLikes++;

      await this.page.waitForTimeout(LIKE_INTERVAL_MILLISECONDS);
    } catch (error) {
      throw error;
    }
  }

  private async storeLikeToDb(userLiked: string) {
    try {
      const like = new Like();
      like.toUser = userLiked;
      like.niche = this.currentNiche;
      like.timestamp = DateTime.now().toFormat("yyyy-LL-dd HH:mm:ss");

      await dataSource.manager.save(like);
      log("stored a like");
    } catch (error) {
      throw error;
    }
  }

  private async goToNextPost() {
    try {
      log("go to next post");
      //todo: handle if no more post
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
      ); /** wait for first post username selector */
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

      // check if user is already follower ?
      // get followers list

      // check if likes-of-post <= 200
      /** handle hide likes */
      /** handle yet no likes */
      /** handle "萬" likes */

      // check if is already 2nd post of same user I've liked today

      // check if is shadow banned user (already be giving likes yet still not follower)

      return true;
    } catch (error) {
      throw error;
    }
  }

  private async findFirstRecentNichePost() {
    try {
      log("find first recent post, niche:", this.currentNiche.nameTag);
      await this.page.goto(
        getTagUrl(this.currentNiche.nameTag)
      ); /** open other pages and like? sound too Bot */
      await this.handleModalDialog();
      const firstPostLink = await this.page.waitForSelector(
        "h2:nth-child(2) + div *[role=link]"
      );
      if (!firstPostLink)
        throw new Error(
          "first post link not found on page"
        ); /**TODO: go to next niche */
      await firstPostLink.click();
      await this.ensurePostModalIsReady();
    } catch (error) {
      throw error;
    }
  }

  async login() {
    try {
      log("bot login");

      if (!this.niches)
        throw new Error("no niches found, try call init() first");

      await this.prepareBrowserPage();

      await this.page.goto(INSTAGRAM_WEBSITE);

      /** if logged in */
      // await this.page.waitForTimeout(3000);
      // const accountImg = await this.page.$("nav img");
      // if (accountImg) {
      //   let regex = /([\w_]+)的大頭貼照/;
      //   const account = regex.exec(
      //     accountImg.getProperty("alt") as unknown as string
      //   )?.[1];
      //   log(`account ${account} already logged in`);
      //   return;
      // }
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
      /** handle 2 step auth */
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
