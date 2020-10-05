import { Message, PartialUser, User } from 'discord.js';
import { logger } from '../logger';

export interface DMCommand<T> {
    description?: string;
    helpMessage: string;
    // allow async function ?
    callback: (this: T, commandArgs: string[]) => string | void;
}

export interface DMCommands<T> {
    [commandName: string]: DMCommand<T>
}

export interface DMCommandConfig<T> {
    welcomeMessage: string;
    exitMessage?: string;
    // shouldn't those be a guild wide constant settings, to not confuse users ?
    exitCommand?: string;
    helpCommand?: string;

    commands: DMCommands<T>;
}

const awaitOptions = {
    max: 1,
    idle: 30000,
    errors: ['timeout'],
}

const defaultHelpCommand = 'help';
const defaultExitCommand = 'fu';
const defaultExitMessage = 'bye bye';

// TODO possibility to not force this on callback (got trouble with typing)
// TODO LOW prevent user to start a from while there is already one going on
export async function startDMCommandForm<T>(_this: T, u: User | PartialUser, config: DMCommandConfig<T>) {
    const user = u.partial ? await u.fetch() : u;
    const dmChannel = await user.createDM();

    await dmChannel.send(
        config.welcomeMessage + 
        '\n Pour plus d\'information vous pouvez taper `' + (config.helpCommand || defaultHelpCommand) + ' nom_de_commande`' +
        Object.values(config.commands).reduce((p, c) => c.description != null ? p +'\n\t' + c.description : p, '') +
        '\n pour quitter taper `' + (config.exitCommand || defaultExitCommand) + '` ou attendez 30s.'
    );
    try {
        // two ways out, exit command found or error raised
        while (true) {
            // We're on DM so testing for message.bot should do the trick no need to check message.id to see who's really sending the message
            const answers = (await dmChannel.awaitMessages((m: Message) => !m.author.bot, awaitOptions)).first();
            if (answers == null) throw 'empty answers';
           
            const splitAnswers = answers.content.split('\n');
            for (const answerLine of splitAnswers) {
                const words = answerLine.trim().split(' ');
                const commandName = words[0];

                if (commandName === (config.exitCommand || defaultExitCommand)) {
                    await dmChannel.send(config.exitMessage || defaultExitMessage);
                    break;
                }

                const dmCommand = config.commands[commandName];
                if (dmCommand == null) {
                    await dmChannel.send('command not found');
                } else {
                    const commandArguments = words.slice(1);
                    const feedback = dmCommand.callback.call(_this, commandArguments);
                    if (feedback != null) {
                        await dmChannel.send(feedback);
                    }
                }
            }
        }
    } catch (e) {
        logger.verbose('terminating DM Command seesion: ', e);
    }

    await dmChannel.send('Fin de la session.');
}