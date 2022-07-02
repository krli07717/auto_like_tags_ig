import puppeteer from "puppeteer";
import type { Page } from "puppeteer";
import log from "./logger";
import { BotUser, Like, Niche, dataSource } from "../db";
import { DateTime } from "luxon";
import type { IConfig, ITag } from "../types";
import * as Config from "../config.json";

const checkConfig = (config: IConfig) => config;
const convertType = <T>(arg: any) => arg as T;

const LIKES_LIMIT_OF_DAY = 250;
const LIKES_LIMIT_PER_NICHE = Math.floor(
  LIKES_LIMIT_OF_DAY / Config.tagsToLike.length
);
const LIKE_INTERVAL_MILLISECONDS = 30000; //todo: speed in ~120 likes/hour
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
  private likedUserTodayMap: Record<string, number> = {};

  constructor() {}

  async init() {
    try {
      log("bot init");
      await this.initDb();
      this.niches = this.niches.sort((a, b) => a.priority - b.priority);

      // check likes today reach limit
      await this.initLikesLeavedToday();
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

        const dbBotUser = await dataSource.manager.findOneBy(BotUser, {
          username,
        });

        const dbNiches = await dataSource
          .getRepository(Niche)
          .createQueryBuilder("niche")
          .where("niche.botUserId = :id", { id: dbBotUser!.id })
          .getMany();

        this.niches = dbNiches;
        return;
      }

      log("Hello,", dbBotUser.username);

      //todo: handle priority update

      const niches = await dataSource
        .getRepository(Niche)
        .createQueryBuilder("niche")
        .where("niche.botUserId = :id", { id: dbBotUser.id })
        .getMany();

      if (tagsToLike?.length) {
        const dbNiches = niches.map((n) => n.nameTag);
        const newTags = tagsToLike.filter(
          (tag) => !dbNiches.includes(tag.name)
        );
        if (newTags.length) {
          for (let i = 0; i < newTags.length; i++) {
            //create niche for new tag
            const niche = new Niche();
            niche.nameTag = newTags[i].name;
            niche.priority = newTags[i].priority;
            niche.likes = [];
            niches.push(niche);
            niche.botUser = dbBotUser;
            await dataSource.manager.save(niche);
            log("create new niche", niche.nameTag);
          }
        }
        log("use config tags");
        const tagsNameInConfig = tagsToLike.map((tag) => tag.name);
        this.niches = await dataSource
          .getRepository(Niche)
          .createQueryBuilder("niche")
          .where("niche.nameTag IN (:...tag_name)", {
            tag_name: tagsNameInConfig,
          })
          .getMany();
        return;
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

  private async getAllLikesToday() {
    try {
      const todayStart = DateTime.now().toFormat("yyyy-LL-dd") + " 00:00:00";
      const todayEnd = DateTime.now().toFormat("yyyy-LL-dd") + " 23:59:59";
      const nicheIds = this.niches.map((n) => n.id);

      return await dataSource
        .getRepository(Like)
        .createQueryBuilder("like")
        .select("_like")
        .from(Like, "_like")
        .where("_like.timestamp >= :todayStart", { todayStart })
        .andWhere("_like.timestamp <= :todayEnd", { todayEnd })
        .andWhere("_like.nicheId IN (:...id)", { id: nicheIds })
        .getMany();
    } catch (error) {
      throw error;
    }
  }

  private async initLikesLeavedToday() {
    try {
      const allLikesToday = await this.getAllLikesToday();

      allLikesToday.forEach((like) => {
        this.likedUserTodayMap[like.toUser] = 1;
      });

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
      // process.exit(0);
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
        await this.likePost();
        const hasMorePost = await this.goToNextPost();
        if (!hasMorePost) break;
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

      await this.storeLikeToDb(userLiked);
      log(`like post from ${userLiked}`);

      this.likedUserTodayMap[userLiked] = 1;
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
      // log("stored a like");
    } catch (error) {
      throw error;
    }
  }

  private async goToNextPost() {
    try {
      // log("go to next post");
      const hasNextPost = this.page.$("*[aria-label=下一步]");
      if (!hasNextPost) return false;
      await this.page.$eval("*[aria-label=下一步]", (node) =>
        node.parentElement?.click()
      );
      const canEnsureReady = await this.ensurePostModalIsReady();
      if (!canEnsureReady) return false;
      return true;
    } catch (error) {
      throw error;
    }
  }

  private async ensurePostModalIsReady() {
    try {
      try {
        await this.page.waitForSelector(
          "*[role=dialog] h2"
        ); /** wait for first post username selector */
        return true;
      } catch (error) {
        console.log("error: code 0001"); //debugging
        return false;
      }
    } catch (error) {
      throw error;
    }
  }

  private async shouldILikeThis() {
    try {
      /** likes in niche hashtag group, where not-yet-liked, likes-of-post <= 200, non-follower-account */
      // todo check if already restart from past last time

      // check if already liked
      const liked = await this.page.$("*[aria-label=收回讚]");
      if (liked) return false;

      // todo: check if user is already follower ?
      // get followers list

      // check if likes-of-post <= 100

      const postLikes = await this.page.$eval(
        "article section:nth-child(2)",
        (node) => node.textContent
      );
      const between0and10kLikes = /(\d+)\s*個讚/.exec(postLikes);
      if (between0and10kLikes) {
        // 10000 > likes > 100, dont like
        if (+between0and10kLikes[1] > 100) return false;
      }
      const noLikesYet = /.*第一個.*/.test(postLikes);
      const likesHidden = /.*其他人.*/.test(postLikes);
      const postIsVideo = /.*觀看.*/.test(postLikes);
      if (!noLikesYet && !between0and10kLikes) {
        if (!likesHidden && !postIsVideo) {
          // likes > 10000, dont like
          return false;
        }
      }

      // check if is already 2nd post of same user I've liked today
      const userToLike = await this.page.$eval(
        "*[role=dialog] h2",
        (node) => node.textContent
      );
      const hasLikedToday = this.likedUserTodayMap[userToLike];
      if (hasLikedToday) return false;

      // handle 已驗證 username
      const isBigUser = /.*已驗證.*/.exec(userToLike);
      if (isBigUser) return false;

      // !todo: check if is shadow banned user (already be giving likes yet still not follower)
      // !todo: more tags in config better

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
      if (!this.niches)
        throw new Error("no niches found, try call init() first");

      await this.prepareBrowserPage();

      log("bot login");

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
      if (Config.hasTwoStepAuth) {
        /** todo!: handle 2 step auth */
        // wait and enter your passcode
        await this.page.waitForTimeout(50000);
      } else {
        await this.page.waitForNavigation();
      }
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

  async getReport() {
    try {
      const todayStart = DateTime.now().toFormat("yyyy-LL-dd") + " 00:00:00";
      const todayEnd = DateTime.now().toFormat("yyyy-LL-dd") + " 23:59:59";
      const botUser = await dataSource.manager.findOneBy(BotUser, {
        username: this.username,
      });
      const reportLikes = await dataSource
        .getRepository(Like)
        .createQueryBuilder("like")
        .innerJoinAndSelect("like.niche", "niche")
        .where("niche.botUserId = :id", { id: botUser?.id })
        .andWhere("like.timestamp >= :todayStart", { todayStart })
        .andWhere("like.timestamp <= :todayEnd", { todayEnd })
        .getMany();
      const nicheLikes: Partial<Record<string, number>> = {};
      reportLikes.forEach((like) => {
        if (nicheLikes[like.niche.nameTag]) {
          nicheLikes[like.niche.nameTag]!++;
          return;
        }
        nicheLikes[like.niche.nameTag] = 1;
      });
      let report = Object.keys(nicheLikes).reduce((acc, tag) => {
        acc += `${tag}: ${nicheLikes[tag]}`;
        acc += "\n";
        return acc;
      }, "\n---------Likes leaved today---------\n");
      report += `Total: ${reportLikes.length}\n`;
      log(report);
    } catch (error) {
      throw error;
    }
  }

  exit() {
    process.exit(0);
  }
}
