import { addMilliseconds, isPast } from 'date-fns';
import { GuildMember, Message, MessageEmbed, PartialUser, TextChannel, User } from 'discord.js';
import schedule from 'node-schedule';
import { logger } from '../../logger';
import { startDMCommandForm } from '../../commands/dmCommands';
import { DynamicEmbedMessage, ReactionAction, STATUS } from '../../DynamicEmbed';
import { getSpecEmoji } from '../../emojis';
import { getSpecTypePlus, isWowSpecId, SpecType, WowSpecs } from '../../model';
import { BLANK, clear, EMQUAD, formatDate, formatList, formatObjective, getMember, localStartWith, notNull } from '../../utils/utils';
import { Roster, RosterManager } from '../roster/rosterManager';

/* icons
https://wow.zamimg.com/images/wow/icons/large/spell_holy_championsbond.jpg
https://wow.zamimg.com/images/wow/icons/large/achievement_pvp_legion08.jpg
https://wow.zamimg.com/images/wow/icons/large/achievement_bg_tophealer_eos.jpg
https://wow.zamimg.com/images/wow/icons/large/spell_holy_borrowedtime.jpg
https://wow.zamimg.com/images/wow/icons/large/inv_letter_20.jpg
*/

export interface RosterSetup {
    tank: number;
    heal: number;
    dps: number;
}

export enum ParticipantStatus {
    PRESENT,
    LATE,
    ABSENT,
    BENCH,
}

export interface CalendarLineup {
    [id: string]: {
        status: ParticipantStatus, 
        benchable?: boolean
    }
}

export interface EventSetup {
    tank: number;
    heal: number; 
    dps: number;
}

const enum EMOJI {
    PRESENT = '👍',
    LATE = '⏲',
    ABSENT = '👎',
    BENCH = '🛋',
}

const typeId = 'ev';

export class CalendarEvent extends DynamicEmbedMessage {
    
    protected typeId = typeId;

    // getTime() is 13chars, can do <= 10 if we're really short on url chars encoding
    get id() { return this.date.getTime().toString() } 

    private static statusAction(emoji: string, status: ParticipantStatus): ReactionAction<CalendarEvent> {
        return {
            emoji,
            button: true,
            listener: function(r, u) {
                const res = this.setPlayerStatus(u.id, status);
                if (res === null) {
                    u.send('Tu dois selectionner une spé dans le roster avant de pouvoir t\'inscrire à un event\n' + this.specsRoster?.getLink());
                    return false;
                }
                
                return res;
            }
        };
    }

    private static readonly actions: ReactionAction<CalendarEvent>[] = [
        CalendarEvent.statusAction(EMOJI.PRESENT, ParticipantStatus.PRESENT),
        CalendarEvent.statusAction(EMOJI.ABSENT, ParticipantStatus.ABSENT),
        CalendarEvent.statusAction(EMOJI.LATE, ParticipantStatus.LATE),
        {
            emoji: EMOJI.BENCH,
            button: false,
            listener: function(r, u, removed) {
                return this.setPlayerMood(u.id, !removed);
            }
        },
        {
            emoji: '🛠️',
            permision: 'SEND_MESSAGES',
            button: true,
            listener: function(r, u,) {
                // would need to return an observable cause configurationForm can make multiple changes
                // for the moment we use the refresh() function for each changes
                this.configurationForm(u);
                return false;
            }
        }
    ];

    // delay in ms at which the event should be considered closed (0 to be right on event time)
    private static closingDelay = 900000; //15 min after event started

    private scheduleClose: schedule.Job;

    constructor(channel: TextChannel, messages: Message[], private date: Date, private specsRoster: Roster | undefined,
        private setup: EventSetup = {tank: 2, heal: 4, dps: 14}, private desc?: string | null, private lineup: CalendarLineup = {}
        ) {
        super(channel, messages);

        if (this.specsRoster == null) {
            this.errors.push(new Error('Can\'t find roster'));
            this.status = STATUS.ERROR;
        }

        this.scheduleClose = schedule.scheduleJob(addMilliseconds(date, CalendarEvent.closingDelay), () => this.close());
    }

    public static async create(channel: TextChannel, date: Date, specsRoster: Roster, setup?: EventSetup, desc?: string | null): Promise<CalendarEvent> {
        const instance = new CalendarEvent(channel, [await channel.send(BLANK)], date, specsRoster, setup, desc);        
        await instance.init();
        
        return instance;
    }

    public static async load(channel: TextChannel): Promise<CalendarEvent[]> {
        const isOutdated = (dateStr: string) => isPast(new Date(parseInt(dateStr)));
        
        // first message outdated
        let stopId: string | null = null; // don't set undefined in case lastMatch.id is undefined
       
        const foundEvents = await DynamicEmbedMessage.findExistingMessages(channel, 
            // create a real function rather than this cheaty oneliner 
            (type, date, msg) => type === typeId && (!isOutdated(date) || !(stopId = msg.id)), 
            (lastMatch) => lastMatch != null && lastMatch.id === stopId
        );
        return Promise.all(foundEvents
            .map(parsedRoster => {
                try {
                    const data = CalendarEvent.decodeData(parsedRoster.pathData, parsedRoster.paramData);

                    const instance = new CalendarEvent(channel, [parsedRoster.messages], 
                        new Date(parseInt(parsedRoster.id)), RosterManager.getRosterManager().getRoster(data.specsRoster), data.setup, data.desc, data.lineup
                    );

                    return instance.init().then(() => instance);
                } catch(e) {
                    logger.error('error loading event ', parsedRoster.id);
                    DynamicEmbedMessage.renderError(parsedRoster.messages, [new Error('Parsing error: ' + e)]);
                }
            })
            .filter(notNull)
        );
    }

    private async init() {
        this.refresh();

        await this.setupReactions(CalendarEvent.actions);
    }

    protected encodeData(): { pathData?: string[] | undefined; paramData?: { [name: string]: string | string[]; } | undefined; } {
        return {
            pathData: [this.specsRoster?.id || '0', CalendarEvent.encodeSetup(this.setup), this.desc || ''],
            paramData: CalendarEvent.encodeLineup(this.lineup),
        }
    }

    protected static decodeData(pathData: string[], paramData: {[id: string]: string[]}) {
        return {
            specsRoster: pathData[0],
            setup: CalendarEvent.decodeSetup(pathData[1]),
            desc: pathData[2],

            lineup: CalendarEvent.decodeLineup(paramData),
        };
    }

    private static decodeLineup(params: {[name: string]: string[]}) {
        const lineup: CalendarLineup = {};

        for (const playerId in params) {
            const values = params[playerId];

            let status: ParticipantStatus;
            try {
                status = parseInt(values[0]);
                if (ParticipantStatus[status] == null) {
                    throw 'invalid status: ' + status;
                }
            } catch (e) {
                logger.error('failed decoding lineup for ' + playerId, e);
                continue;
            }

            lineup[playerId] = {
                status,
                benchable: values.length > 1 && values[1] === 'benchable',
            }
        }

        return lineup;
    }

    private static encodeLineup(lineup: CalendarLineup) {
        const params: {[id: string]: string[]} = {}
        for (const playerId in lineup) {
            const status = lineup[playerId];

            const encodedStatus = [status.status.toString()];
            if (status.benchable) {
                encodedStatus.push('benchable')
            }

            params[playerId] = encodedStatus;
        }

        return params;
    }

    private static decodeSetup(setupStr: string) {
        try {
            const matchArray = Array.from(setupStr.matchAll(/(\d+)/g));

            // todo error prone, but we'll redo it once we handle setup with 4 values (rdps/mdps)
            return {
                tank: parseInt(matchArray[0][0]) || 0,
                heal: parseInt(matchArray[1][0]) || 0,
                dps: parseInt(matchArray[2][0]) || 0,
            };
        } catch(e) { 
            logger.error('failed parsing setup: ', e);
            return {tank: 2, heal: 4, dps: 14};
        }
    }

    private static encodeSetup(setup: EventSetup) {
        return setup.tank + '-' + setup.heal + '-' + setup.dps;
    }

    /* TODO we're using 3 returns, set as expected, not set cause already set and not set cause no spec could be found
     * using boolean + null atm but need to do better, number or boolean + throw
     */
    setPlayerStatus(userId: string, status: ParticipantStatus) {
        if (this.lineup[userId]?.status != status) {
            const spec = this.specsRoster?.getMainSpec(userId);
            if (spec == null) {                
                return null;
            }

            this.lineup[userId] = {status, benchable: this.lineup[userId]?.benchable};
            return true;
        }

        return false;
    }

    setPlayerMood(userId: string, benchable = true) {
        if (this.lineup[userId]?.benchable != benchable) {
            this.lineup[userId] = {status: this.lineup[userId]?.status, benchable};
            return true;
        }

        return false;
    }

    protected generateMessage(): MessageEmbed {
        const present: string[][] = [[],[],[],[]];
        const absent: string[] = [];
        const bench: string[] = [];

        const chan = this.message.channel as TextChannel;

        for (const playerId in this.lineup) {
            const status = this.lineup[playerId].status;
            const user = getMember(chan, playerId)?.user;

            if (user == null) {
                logger.warn('missing user', playerId);
                continue;
            }

            switch(status) {
                case ParticipantStatus.LATE:                      
                case ParticipantStatus.PRESENT:                
                    const specId = this.specsRoster?.getMainSpec(playerId);
                    // TODO
                    if (specId == null || !isWowSpecId(specId)) continue;

                    const extra = (status === ParticipantStatus.LATE ? ' ' + EMOJI.LATE : '') + (this.lineup[playerId].benchable === true ? ' ' + EMOJI.BENCH : '');

                    present[getSpecTypePlus(WowSpecs[specId])].push(getSpecEmoji(WowSpecs[specId])?.toString() + user.toString() + extra);
                    break;
                case ParticipantStatus.ABSENT:
                    absent.push(user.toString());
                    break;
                case ParticipantStatus.BENCH:
                    bench.push(user.toString());
                    break;
            }
        }

        const presetnNb = present.reduce((v, a) => v + a.length, 0);
        const requiredNb = this.setup.tank + this.setup.heal + this.setup.dps;
        const missingNb = Math.max(0, requiredNb - presetnNb);

        const msg = new MessageEmbed()            
            .setThumbnail('https://wow.zamimg.com/images/wow/icons/large/spell_holy_championsbond.jpg')
            .setTitle(formatDate(this.date))
        
        if (this.desc != null) {
            msg.setDescription(this.desc);
        }

        msg.addField('Setup', 
                formatObjective(this.setup.tank, present[SpecType.TANK].length, this.setup.tank) + 
                '-' + 
                formatObjective(this.setup.heal, present[SpecType.HEAL].length, this.setup.heal) + 
                '-' + 
                formatObjective(this.setup.dps, present[SpecType.DPS].length + present[SpecType.DPS + 1].length, this.setup.dps) + 
                '\n\u200b', 
            true)
            .addField('Inscrit', formatObjective(presetnNb, presetnNb, requiredNb), true)
            .addField('Manquant', missingNb, true);

        DynamicEmbedMessage.add3columnFields(msg, '__TANKS__  (' + present[SpecType.TANK].length + ')', present[SpecType.TANK]);
        DynamicEmbedMessage.add3columnFields(msg, '__HEALS__  (' + present[SpecType.HEAL].length + ')', present[SpecType.HEAL]);
        DynamicEmbedMessage.add3columnFields(msg, '__DPS__  (' + (present[SpecType.DPS].length+present[SpecType.DPS+1].length) + ') *(c:' + present[SpecType.DPS].length + ',r:' + present[SpecType.DPS + 1].length + ')*', present[SpecType.DPS], present[SpecType.DPS+1]);

        // using EM Quad to ease parsing, it's our separator between label and values. Also better visually.
        msg.addField(BLANK, '**Absents (' + absent.length + ')**' + EMQUAD + formatList(absent) + '\n**Bench (' + bench.length + ')**' + EMQUAD + formatList(bench));

        return msg;
    }

    private async configurationForm(u: User | PartialUser) {
        await startDMCommandForm(this, u, {
            welcomeMessage: 'Quels changements voulez-vous appliquer à l\'évènement ?',
            commands: {
                'set': {
                    description: '`set user1 user2 ... statut? benchable?`',
                    helpMessage: `Vous pouvez set un ou plusieurs utilisateurs avec le même statut (present/absent/retard/bench).
                    statut et benchable sont optionel et son par defaut : present et non-benchable.
                    le nom des joueurs n'as pas besoin d'être complet, un début suffit mais si 2 joueurs ont un nom avec le même début un seul sera ajouter.
                    /!\ La recherche de nom s'effectue sur le nom affiché sur le serveur ET le nom d'utilisateur global.
                    exemples:
                        \`set nekros reck absent\`
                        \`set era wak absent benchable\`
                        \`set bamleprètre\`
                        \`set essa benchable\`
                    `,
                    callback: function(args: string[]) {
                        // must be sync with ParticipantStatus, don't like that very much
                        const statusStr = ['present', 'late', 'absent', 'bench'];
                        const members = (this.message.channel as TextChannel).members;                      

                        let statusIdx = 0;
                        let status = ParticipantStatus.PRESENT;
                        let benchable = false;

                        const players: GuildMember[] = [];
                        const playersNotFound: string[] = [];
                        
                        for (const w of args) {
                            if (w == 'benchable') {
                                benchable = true;
                            } else if ( (statusIdx = statusStr.findIndex(v => v === w)) >= 0) {
                                status = statusIdx;
                            } else {
                                const player = members.find(m => localStartWith(clear(m.displayName), w) || localStartWith(clear(m.user.username), w));
                                if (player != null) {
                                    players.push(player);
                                } else {
                                    playersNotFound.push(w);
                                }
                            }
                        }

                        if (players.length == 0) {
                            return 'aucun joueur trouvé !';
                        }

                        const playerAdded = [];
                        const playerAlreadySet = [];
                        const playerNoSpec = [];

                        for (const p of players) {
                            // todo setMood ?
                            const result = this.setPlayerStatus(p.user.id, status)
                            this.setPlayerMood(p.user.id, benchable);

                            switch(result) {
                                case true :
                                    playerAdded.push(p.displayName);
                                    break;
                                case false:
                                    playerAlreadySet.push(p.displayName);
                                    break;
                                case null:
                                    playerNoSpec.push(p.displayName);
                            }
                        }
                        this.refresh();

                        let feedback = '';


                        if (playerAdded.length > 0) {
                            feedback += 'joueurs ajouté avec le status *' + statusStr[status] + '* ' + (benchable ? 'et *benchable*' : '') + ' : ' + formatList(playerAdded);
                        }
                        // this one is optional
                        if (playerAlreadySet.length > 0) {
                            feedback += '\nJoueurs qui avait déjà le même status: ' + formatList(playerAlreadySet);
                        }
                        if (playerNoSpec.length > 0) {
                            feedback += '\njoueurs n\'ayant pas été ajouté car ils ne sont pas inscrit dans le roster: ' + formatList(playerNoSpec);
                        }
                        if (playersNotFound.length > 0) {
                            feedback += '\nJoueur(s) non trouvé(s) : ' + formatList(playersNotFound);
                        }

                        return feedback;
                    },
                },
                /*
                'setup': {
                    description: '`setup x-x-x`',
                    helpMessage: '',
                    callback: () => {},
                },
                */
                'date': {
                    description: '`date jjmm`',
                    helpMessage: '',
                    callback: () => {},
                },
                'time': {
                    description: '`time hhmm`',
                    helpMessage: '',
                    callback: () => {},
                },
                'desc': {
                    description: '`desc nouvelle description`',
                    helpMessage: '',
                    callback: () => {},
                },
            }
        }); 
    }

    public async cancel() {
        this.scheduleClose.cancel();
        await this.disconnect();
        await this.message.delete();
    }

    private close() {
        this.status = STATUS.CLOSE;
        this.refresh();
        this.disconnect();
    }

    protected async disconnect() {
        await super.disconnect();
        if (!this.message.deleted) {
            await this.message.reactions.removeAll(); 
        }
    }
}
