import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
  ManyToOne,
  ManyToMany,
  JoinTable,
} from "typeorm";

@Entity()
export class BotUser {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({
    type: "varchar",
    length: 50,
    unique: true,
  })
  username: string;

  @OneToMany(() => Niche, (niche) => niche.botUser)
  @JoinTable()
  niche: Niche[];

  // @OneToMany(() => Like, (like) => like.byUser)
  // likes: Like[];

  // @ManyToMany(() => Follower, (follower) => follower.following)
  // @JoinTable()
  // followers: Follower[];
}

// @Entity()
// export class Follower {
//   @PrimaryGeneratedColumn()
//   id: number;

//   @Column({
//     type: "varchar",
//     length: 50,
//     unique: true,
//   })
//   username: string;

//   @ManyToMany(() => BotUser, (botUser) => botUser.followers, {
//     cascade: true,
//   })
//   @JoinTable()
//   following: BotUser[];

//   @Column({
//     default: false,
//   })
//   unfollowed: boolean;

//   @Column()
//   timestamp: Date;
// }

@Entity()
export class Niche {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  nameTag: string;

  @Column()
  priority: number;

  @OneToMany(() => Like, (like) => like.niche)
  likes: Like[];

  @ManyToOne(() => BotUser, (botUser) => botUser.niche, {
    cascade: true,
  })
  @JoinTable()
  botUser: BotUser;
}

@Entity()
export class Like {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({
    type: "varchar",
    length: 50,
  })
  toUser: string;

  // @ManyToOne(() => BotUser, (botUser) => botUser.likes, {
  //   cascade: true,
  // })
  // byUser: BotUser;
  // can get from niche ofUser

  @ManyToOne(() => Niche, (niche) => niche.likes, {
    cascade: true,
  })
  niche: Niche;

  @Column()
  timestamp: string; /** not Date for luxon reason */
}
