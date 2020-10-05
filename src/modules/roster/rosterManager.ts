import { Snowflake } from 'discord.js';
import { WowSpecId } from "../../model";

export interface Roster {
    readonly id: Snowflake;
    readonly name: string;

    getLink(): string;
    getMainSpec(userId: Snowflake): WowSpecId | void;
    getOffSpecs(userId: Snowflake): WowSpecId[];
}

let singleton: RosterManager | undefined;

export class RosterManager {

    private rosters: {[id: string]: Roster} = {};
    private defaultRosterId: Snowflake | undefined;

    private constructor() { }

    /**
     * Will override whatever may already been set
     * @param id 
     * @param roster 
     * @param isDefault 
     */
    setRoster(id: Snowflake, roster: Roster, isDefault = false) {
        this.rosters[id] = roster;
        if (isDefault || Object.keys(this.rosters).length === 1) {
            this.defaultRosterId = id;
        }
    }

    removeRoster(id: Snowflake) {
        delete this.rosters[id];
    }

    setDefaultRoster(idOrName: Snowflake | string) {
        if (this.rosters[idOrName] != null) {
            this.defaultRosterId = idOrName;
            return true;
        }

        for (const id in this.rosters) {
            const roster = this.rosters[id];
            if (roster.name === idOrName) {
                this.defaultRosterId = id;
                return true;
            }
        }

        return false;
    }

    getDefaultRoster() {
        if (this.defaultRosterId != null) {
            return this.rosters[this.defaultRosterId];
        }
    }

    getRoster(idOrName: Snowflake | string) {
        return this.getRosterById(idOrName) || this.getRosterByName(idOrName);
    }

    getRosterById(id: Snowflake): Roster | undefined {
        return this.rosters[id];
    }

    getRosterByName(name: string): Roster | undefined {
        return Object.values(this.rosters).find(r => r.name === name);
    }

    static getRosterManager() {
        return singleton || (singleton = new RosterManager());
    }
}