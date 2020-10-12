# wow-calendar

# Intro
Discord bot to manage World of Warcraft calendar events. The current in-game calendar as some issues, such as :

- calendar view is only accessible through the game or the mobile-app
    - mobile app is not really lightweight compared to discord and is lacking some features like setting other players status.
- you can't view calendar if you're not logged in on the invited character. You also can't check it through mobile app cause you can't log in if you're already logged in the game.
- you can't invite "people" but only their characters so to fully invite someone with alts you'll have to invite all his alts.
- it's also missing some minor features as auto-declined for a period of time, more status (late, benchable...), setup requirement by the event, hard to detect roles (tank/heal/dps), etc...
  
This bot is meant to address those issues and allow guild managers to manager their guild in one place, discord, which is probably what most are already doing for other matters.

For the moment this bot is hosted and accessible only privately.
If you want to use it you'll need to host it yourself, create a discord bot and associate it. There will be a publicly one available at some point.

## Data

This bot won't save any data server-side, everything is stored on discord (using hidden encoded url). We'll see how far we can go with this idea.

## Tech stack
This is a [nodejs](https://nodejs.org) project written in [typescript](https://www.typescriptlang.org/) and using [discordjs](https://discord.js.org).
We rely on [prettier](https://prettier.io/) and [es-lint](https://eslint.org/) to ensure code readability.
And [Docker](https://www.docker.com/) is used to manage deployement.

# Build
Once you've cloned this project you can build it using :
```
npm run build
```
This will create a `build` folder with compiled js files. That's the folder needed for deployement.

# Deploy
## Config
A `config.json` file is required and must be somewhere up on the filesystem hierarchy à la nodejs `require()`.
This file needs to contains those settings :
```json
{
    "BOT_TOKEN": "your_discord_bot_token",
    "EMOJI_GUILD_ID": "your_discord_guild_to_fetch_emojis"
}
```
To see which emoji needs to be defined on the guild check all `emojiName` properties from model.ts.

## Using docker
```
docker build --build-arg CONFIG_PATH=CONFIG_JSON_PATH -t IMAGE_TAG .
```
This will create an optimized docker image to deploy with `CONFIG_JSON_PATH` being the path to your config.json file and `IMAGE_TAG` your image tag name.

## Manually
```
npm install WowBot
```
To install the app on your server or a docker image. 
If you don't want to use npm on your deployement server you can pretty much build the project and copy the content of the `build` folder.
We higly recommend installing [optional packages](https://github.com/discordjs/discord.js#optional-packages) to speed up discordjs processing of websocket.


# Documentation
TODO on wiki

# Roadmap
List order is more or less priority order.

## Features
 - restrict sign-up by role
 - validate event action: closing all possible action and sending dm to all users accepted
 - reminder for people not signed-up
 - flexible setup (for HM)
 - auto-roster based on people specs and setup needed
 - absent command, so user can set himself as absent for an amount of time and he'll be automatically set as absent for all events
 - absent parser, try to parse sentence and understand period of absence to avoid using the command, makes it all more human.
 - i18n, supports multiple language

## Dev
- setup tests
- write tests for existing code
- work on more stability and better handling of errors
- handle errors on events (during parsing, displaying..): be sure we don't lose any information and allow user to resolve it.
- profile memory usage to be sure there is no leak
- finish setup linting (gave up too much options...)
- Intermediate abstract class for roster and events
- Module system for features