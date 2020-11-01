import { Message, MessageEmbed, TextChannel } from 'discord.js';
import { DynamicEmbedMessage, ReactionAction } from '../../DynamicEmbed';
import { getSpecEmoji } from '../../utils/emojis';
import {
    toSpecTypePlus,
    isWowSpecId,
    SpecType,
    WowClasses,
    WowSpecId,
    WowSpecs,
} from '../../model';
import { BLANK, getMember, link, notNull, logger } from '../../utils/utils';
import { RosterDataDict, RosterUtils } from './roster';
import { Roster, RosterManager } from './rosterManager';

const typeId = 'rt';

export class RosterMessage extends DynamicEmbedMessage implements Roster {
    private static readonly specActions = [
        WowClasses.DK.specs.Blood,
        WowSpecs.dk_dps,
        ...Object.values(WowClasses.DH.specs),
        ...Object.values(WowClasses.Druid.specs),
        WowClasses.Hunt.specs.Survival,
        WowSpecs.hunt_rdps,
        WowSpecs.mage_dps,
        ...Object.values(WowClasses.Monk.specs),
        ...Object.values(WowClasses.Pal.specs),
        WowClasses.Priest.specs.Shadow,
        WowSpecs.priest_heal,
        WowSpecs.rogue_dps,
        ...Object.values(WowClasses.Sham.specs),
        WowClasses.War.specs.Protection,
        WowSpecs.war_dps,
        WowSpecs.warlock_dps,
    ];

    /*eslint class-methods-use-this: "off"*/
    get typeId(): string {
        return typeId;
    }

    get name(): string {
        return this.title;
    }

    // TODO ensure name is unique for the moment
    protected constructor(
        channel: TextChannel,
        messages: Message[],
        public readonly title: string,
        private readonly roster: RosterDataDict = {}
    ) {
        super(channel, messages);

        RosterManager.get().setRoster(this.id, this);
    }

    protected async destroy(): Promise<void> {
        await super.destroy();

        RosterManager.get().removeRoster(this.id);
    }

    public static async load(
        channel: TextChannel,
        stopFn: (lastMatch?: Message, lastMessage?: Message) => boolean = l => l != null
    ): Promise<RosterMessage[]> {
        const foundRoster = await DynamicEmbedMessage.findExistingMessages(
            channel,
            type => type === typeId,
            stopFn,
            1
        );
        return Promise.all(
            foundRoster
                .map(parsedRoster => {
                    try {
                        const data = RosterMessage.decodeData(
                            parsedRoster.pathData,
                            parsedRoster.paramData
                        );

                        const instance = new RosterMessage(
                            channel,
                            parsedRoster.messages,
                            data.title,
                            data.roster
                        );

                        return instance.init().then(() => instance);
                    } catch (e) {
                        logger.error('error loading roster message %s', e);
                        DynamicEmbedMessage.renderError(parsedRoster.messages[0], [
                            new Error('Error loading roster message' + e),
                        ]);
                    }
                })
                .filter(notNull)
        );
    }

    public static async create(channel: TextChannel, title: string): Promise<RosterMessage> {
        const instance = new RosterMessage(
            channel,
            [await channel.send(BLANK), await channel.send(BLANK)],
            title
        );
        await instance.init();

        return instance;
    }

    private async init() {
        this.refresh();

        const mainSpecEmoji = '🥇';

        // wanted to do the map only once as the static prop specActions, but getSpecEmoji() won't work yet at this point
        return await this.setupReactions([
            {
                emoji: mainSpecEmoji,
            },
            ...RosterMessage.specActions.map(
                spec =>
                    <ReactionAction<RosterMessage>>{
                        emoji: getSpecEmoji(spec),
                        // TODO didn't want to introduce Promise to listener so we're only using cache
                        // this is probably no gonna work on all scenario, but need to know more how ReactionManager works
                        // because maybe it is enough to rely on cache.
                        // we may aswell keep track of users reaction to mainSpecEmoji ourselves by adding a listener to mainSpecEmoji
                        // but kinda re-inventing the wheel offered by discord.js
                        listener: function (_mr, user, isRemoved) {
                            if (isRemoved) {
                                return RosterUtils.removeSpecToUser(this.roster, user.id, spec);
                            }

                            // we don't keep cache of this, cause reacting to specs on roster is a rare action
                            const mainSpecReaction = this.message.reactions.cache.find(
                                v => v.emoji.name === mainSpecEmoji
                            );

                            if (
                                mainSpecReaction != null &&
                                mainSpecReaction.users.cache.some(v => v.id === user.id)
                            ) {
                                mainSpecReaction.users.remove(user.id);
                                RosterUtils.setMainSpecToUser(this.roster, user.id, spec);
                                return true;
                            }

                            return RosterUtils.addSpecToUser(this.roster, user.id, spec);
                        },
                    }
            ),
        ]);
    }

    private static decodeData(pathData: string[], paramData: { [id: string]: string[] }) {
        const title = pathData[0];
        const roster = {};

        for (const id in paramData) {
            for (const spec of paramData[id]) {
                if (isWowSpecId(spec)) {
                    RosterUtils.addSpecToUser(roster, id, spec as WowSpecId);
                } else {
                    throw 'unknow spec: ' + spec;
                }
            }
        }

        return { title, roster };
    }

    protected encodeData(): {
        pathData?: string[];
        paramData?: { [name: string]: string | string[] };
    } {
        const paramData: { [id: string]: string[] } = {};
        for (const id in this.roster) {
            const specs = this.roster[id];
            if (specs.mainSpec != null) {
                // can we be 100% sure mainSpec will be the firs one we'll retrieve ?
                paramData[id] = [specs.mainSpec, ...specs.offSpecs];
            }
        }

        return {
            pathData: [this.title],
            paramData,
        };
    }

    protected generateMessage(): MessageEmbed {
        // 0 = TANK, 1 = HEAL, 2 = Melee DPS, 3 = Range DPS
        const mainSpecs: string[][] = [[], [], [], []];
        const backupSpecs: string[][] = [[], [], [], []];

        const channel = this.message.channel as TextChannel;

        for (const playerId in this.roster) {
            const specs = this.roster[playerId];
            if (specs.mainSpec == null) {
                continue;
            }

            const member = getMember(channel, playerId);

            if (member == null) {
                logger.warn('missing user ' + playerId);
                continue;
            }

            const mainSpec = WowSpecs[specs.mainSpec];
            const array = mainSpecs[toSpecTypePlus(mainSpec)];
            //array.push(getSpecEmoji(mainSpec)?.toString() + ' **' + member.displayName) + '**');
            array.push(getSpecEmoji(mainSpec)?.toString() + member.user.toString());

            for (const specId of specs.offSpecs) {
                const spec = WowSpecs[specId];
                backupSpecs[toSpecTypePlus(spec)].push(
                    getSpecEmoji(spec)?.toString() + ' ' + member.displayName
                );
            }
        }

        const msg = new MessageEmbed()
            .setColor('#0000ff')
            .setTitle(this.title)
            //TODO .setDescription()

            .addField('Total: ' + mainSpecs.reduce((c, l) => (c += l.length), 0), BLANK);

        DynamicEmbedMessage.add3columnFields(
            msg,
            `**__TANKS:__  (${mainSpecs[SpecType.TANK].length})**`,
            mainSpecs[SpecType.TANK],
            DynamicEmbedMessage.BLANK_LINE,
            backupSpecs[SpecType.TANK],
            backupSpecs[SpecType.TANK].length > 0 ? DynamicEmbedMessage.BLANK_LINE : [],

            DynamicEmbedMessage.BLANK_LINE,

            [`**__HEALS:__  (${mainSpecs[SpecType.HEAL].length})**`],
            mainSpecs[SpecType.HEAL],
            DynamicEmbedMessage.BLANK_LINE,
            backupSpecs[SpecType.HEAL],
            backupSpecs[SpecType.HEAL].length > 0 ? DynamicEmbedMessage.BLANK_LINE : [],

            DynamicEmbedMessage.BLANK_LINE
        );
        // split into more fields otherwise we may reach limite of 1024 chars per columns on a single field
        DynamicEmbedMessage.add3columnFields(
            msg,
            `**__DPS:__  (${
                mainSpecs[SpecType.DPS].length + mainSpecs[SpecType.DPS + 1].length
            }) *(m:${mainSpecs[SpecType.DPS].length},r:${mainSpecs[SpecType.DPS + 1].length})***`,

            mainSpecs[SpecType.DPS],
            mainSpecs[SpecType.DPS + 1]
        );

        DynamicEmbedMessage.add3columnFields(
            msg,
            BLANK,
            backupSpecs[SpecType.DPS].concat(backupSpecs[SpecType.DPS + 1])
        );

        return msg;
    }

    getLink(): string {
        return link(this.message);
    }

    getMainSpec(userId: string): WowSpecId | undefined {
        return RosterUtils.getSpecs(this.roster, userId)?.mainSpec;
    }

    getOffSpecs(userId: string): WowSpecId[] {
        return RosterUtils.getSpecs(this.roster, userId)?.offSpecs || [];
    }
}
