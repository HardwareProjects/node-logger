// This module provides logging services for node.js applications.
// It is based on the following goals.
// - The user should be able to set the Loglevel in the config file.
// - Only messages that are logged should cause overhead.
// - When logging errors or warnings, it must be ensured that the message is not lost,
//   even if the process exits immediately afterwards. 
// - Messages should contain an ISO-Date string by default.
// - Messages should be searchable by keyword or tag.
// - The message should be easily parsable (json).
// - If an Error object is logged, then its stack should be logged.
// - Logging to the console and/or to a file should be simple.
// - Logging to a file and errors additionally to stdout should be simple.
// - The logger should be extensible so that eg. logging to a database is possible.
// - Supports same method names and arguments as the console.log, console.info, console.warn and console.error methods.
// - If the tags array argument to the log function contains the element "always"
//   then the message is always logged independent on the level. 

import * as util from "util";
import * as path from "path";
import * as assert from "assert";
import * as fs from "fs";
import * as stream from "stream";
import { EOL } from "os";
import * as tty from "tty";
import * as callsite from "callsite";
const appRoot: string = require("app-root-path").path;
const stripcomment = require("strip-json-comments");

// The file that contains the logger options.
const configFilePath = path.join(appRoot, "node-logger.json");

/* tslint:disable:variable-name */
export const LogLevel = {
    OFF:   "OFF",
    ERROR: "ERROR",
    WARN:  "WARN",
    INFO:  "INFO",
    DEBUG: "DEBUG",
};
/* tslint:enable:variable-name */

const logLevelNames = Object.keys(LogLevel);

export interface LogFunction {
    (message: Message, shouldBeLogged: Boolean, destinations: NodeJS.WritableStream[]): Promise<void>;
}

export interface ApplicationOptions {
    // Specifies the minimum importance that messages must have to be logged.
    // Eg. WARN will only log messages with level WARN and ERROR.
    level?: string;
    // A list of destinations, that will be used by an internal or a provided logFunction.
    // Supported destination values are WritableStream, file path or the strings "stdout" or "stderr".
    destinations?: Array<string|NodeJS.WritableStream>;
    // The function that may modify the log message and write it to a destination.
    // Supported are the name of a predefined logFunction or a callback function.
    logFunction?: string|LogFunction;
}

export interface ModulOptions {
    // Tags that the logger will include in its log messages. Additional tags can be added by the logging function.
    tags?: string[];
}

export interface LoggerOptions extends ApplicationOptions {
}

export interface Message {
    isoDate: string;
    level: string;
    tags: string[];
    text: string;
    stack?: string;
}

const defaultOptions: LoggerOptions = {
    level: LogLevel.DEBUG,
    destinations: [process.stdout, process.stderr],
    logFunction: allDest0WarnDest1.name,
};

export let logFunctions = new Map<string, Function>();
logFunctions.set(allDest0WarnDest1.name, allDest0WarnDest1);

// log function. The returned promise is resolved when the message is written.
// Always write WARN or ERROR messages to destinations[1] if it exists and it is not equal to destinations[0].
// Always write to destinations[0] except
// - If the message was already written to the console by destinations[1] and destinations[0]
//   is also a console (so that WARN and ERROR messages are only printed once to the console).
export function allDest0WarnDest1(message: Message, shouldBeLogged: Boolean, destinations: NodeJS.WritableStream[]): Promise<void> {
    if (!shouldBeLogged) {
        return Promise.resolve();
    }
    return new Promise<void>((resolve, reject) => {
        const writeToDest1 = !isFirstLoglevelGreaterEqualSecond(message.level, LogLevel.INFO)
            && destinations[1] !== undefined && destinations[0] !== destinations[1];
        const isBothTty = isTty(destinations[0]) && isTty(destinations[1]);
        const writeToDest0 = !(writeToDest1 && isBothTty);
        const streamA = writeToDest1 ? destinations[1] : destinations[0];
        const streamB = writeToDest1 && writeToDest0 ? destinations[0] : null;
        const messageStr = JSON.stringify(message) + EOL;
        // Writing messageStr will always write a single line with a trailing EOL, because JSON.stringify(message) 
        // returns a string without direct line breaks. (Strings within the stringifyd json object containing "\n" 
        // characters are escaped to "\\n" and will display as "\n" in the logger output.")
        streamA.write(messageStr, () => {
            if (streamB) {
                streamB.write(messageStr, () => resolve());
            } else {
                resolve();
            }
        });
     });
}

export function createFromConfigFile(tags: string[] = []) {
     const tagsWithCaller = [getCallerFilename()].concat(tags);
     if (Logger.instance) {
        return new Logger(Logger.instance.getOptions(), tagsWithCaller);
     }
     const options = parseConfigSync(configFilePath);
     return new Logger(options, tagsWithCaller);
}

export function createFromArguments(options: LoggerOptions, tags: string[] = []) {
    const tagsWithCaller = [getCallerFilename()].concat(tags);
    if (Logger.instance) {
        return new Logger(Logger.instance.getOptions(), tagsWithCaller);
    }
    return new Logger({ level: options.level, destinations: options.destinations, logFunction: options.logFunction }, tagsWithCaller);
}

export class Logger implements LoggerOptions, ModulOptions {
    static instance: Logger = null;
    level: string;
    tags: string[];
    destinations: NodeJS.WritableStream[];
    logFunction: LogFunction;

    constructor({ level = defaultOptions.level,
                  destinations = defaultOptions.destinations,
                  logFunction = defaultOptions.logFunction,
                }, tags: string[] = []) {
        checkLoglevel(level);
        this.level = level;
        this.setDestinations(destinations);
        this.setLogFunction(logFunction);
        this.tags = tags;
        Logger.instance = this;
    }

    private setLogFunction(logFunction: string|LogFunction) {
        if (typeof logFunction === "string") {
            if (logFunctions.has(logFunction)) {
                this.logFunction = logFunctions.get(logFunction) as any;
            } else {
                throw new Error(`The logFunction with name '${logFunction}' is not known.`);
            }
        } else if (typeof logFunction === "function") {
            this.logFunction = logFunction;
        } else {
            throw new TypeError(`The argument 'logFunction' has unexpected type '${typeof logFunction}'.`);
        }
    }

    private setDestinations(destinations: Array<string|NodeJS.WritableStream>) {
        this.destinations = [];
        for (const dest of destinations) {
            if (typeof dest === "string") {
                if (dest === "stdout") {
                    this.destinations.push(process.stdout);
                } else if (dest === "stderr") {
                    this.destinations.push(process.stderr);
                } else {
                    const s = fs.createWriteStream(dest, { flags: "a" });
                    this.destinations.push(s);
                }
            } else if (dest instanceof stream.Writable || dest instanceof stream.Transform) {
                this.destinations.push(dest);
            } else {
                throw new TypeError(`One of the elements of argument 'destinations' has unexpected type '${typeof dest}'.`);
            }
        }
    }

    // Returns a copy of the options that were used in the constructor.
    getOptions(): LoggerOptions & ModulOptions {
        return {
            level:        this.level,
            destinations: this.destinations,
            logFunction:  this.logFunction,
            tags:         this.tags.slice(),
        };
    }

    error(format: any, ...optionalParams: any[]): Promise<void> {
        return this.doLog(LogLevel.ERROR, [], format, optionalParams);
    }

    error2(tags: string[]|string, format: any, ...optionalParams: any[]): Promise<void> {
        return this.doLog(LogLevel.ERROR, tags, format, optionalParams);
    }

    warn(format: any, ...optionalParams: any[]): Promise<void> {
        return this.doLog(LogLevel.WARN, [], format, optionalParams);
    }

    warn2(tags: string[]|string, format: any, ...optionalParams: any[]): Promise<void> {
        return this.doLog(LogLevel.WARN, tags, format, optionalParams);
    }

    info(format: any, ...optionalParams: any[]): Promise<void> {
        return this.doLog(LogLevel.INFO, [], format, optionalParams);
    }

    info2(tags: string[]|string, format: any, ...optionalParams: any[]): Promise<void> {
        return this.doLog(LogLevel.INFO, tags, format, optionalParams);
    }

    debug(format: any, ...optionalParams: any[]): Promise<void> {
        return this.doLog(LogLevel.DEBUG, [], format, optionalParams);
    }

    debug2(tags: string[]|string, format: any, ...optionalParams: any[]): Promise<void> {
        return this.doLog(LogLevel.DEBUG, tags, format, optionalParams);
    }

    // An alias method for info() with additional overload that accepts LogLevel.
    log(level: "OFF"|"ERROR"|"WARN"|"INFO"|"DEBUG", format: any, ...optionalParams: any[]): Promise<void>;
    log(format: any, ...optionalParams: any[]): Promise<void>;
    log(arg1: any, arg2: any, ...arg3: any[]): Promise<void> {
        if (typeof arg1 === "string" && logLevelNames.indexOf(arg1) > -1) {
            return this.doLog(arg1, [], arg2, arg3);
        } else {
            // arg1 contains the format string and arg2 and arg3 the format arguments.
            let formatArgs = arg3 as any[];
            if (arg2 !== undefined) {
                formatArgs = [arg2].concat(arg3);
            }
            return this.doLog(LogLevel.INFO, [], arg1, formatArgs);
        }
    }

    // An alias method for info2() with additional overload that accepts LogLevel.
    log2(level: "OFF"|"ERROR"|"WARN"|"INFO"|"DEBUG", tags: string[]|string, format: any, ...optionalParams: any[]): Promise<void>;
    log2(tags: string[]|string, format: any, ...optionalParams: any[]): Promise<void>;
    log2(arg1: any, arg2: any, arg3: any, ...arg4: any[]): Promise<void> {
        if (typeof arg1 === "string" && logLevelNames.indexOf(arg1) > -1) {
            return this.doLog(arg1, arg2, arg3, arg4);
        } else {
            // arg2 contains the format string and arg3 and arg4 the format arguments.
            let formatArgs = arg4 as any[];
            if (arg3 !== undefined) {
                formatArgs = [arg3].concat(arg4);
            }
            return this.doLog(LogLevel.INFO, arg1, arg2, formatArgs);
        }
    }

    private doLog(level: string, tags: string[]|string, format: any, optionalParams: any[]): Promise<void> {
        assert(Array.isArray(optionalParams), "optionalParams is expected to be an array because it is the ...optionalParams argument of the calling functions.");
        const shouldBeLogged = isFirstLoglevelGreaterEqualSecond(this.level, level) || [].concat(tags).indexOf("always") > -1;
        let messageText = optionalParams.length > 0 ? util.format(format, ...optionalParams) : util.format(format);
        let message = {} as Message;
        message.isoDate = new Date().toISOString();
        message.level = level;
        message.tags = this.tags.concat(tags as any);
        message.text = messageText;
        if (format instanceof Error) {
            message.stack = format.stack;
        }
        return this.logFunction(message, shouldBeLogged, this.destinations);
    }

    isErrorOrVerboser() {
        return isFirstLoglevelGreaterEqualSecond(this.level, LogLevel.ERROR);
    }

    isWarnOrVerboser() {
        return isFirstLoglevelGreaterEqualSecond(this.level, LogLevel.WARN);
    }

    isInfoOrVerboser() {
        return isFirstLoglevelGreaterEqualSecond(this.level, LogLevel.INFO);
    }

    isDebugOrVerboser() {
        return isFirstLoglevelGreaterEqualSecond(this.level, LogLevel.DEBUG);
    }
}

function parseConfigSync(configPath: string) {
    // Read the file non-async so that creating a logger will not need to return a Promise.
    const data = fs.readFileSync(configPath);
    const jsCode = data.toString();
    try {
        const stripped = stripcomment(jsCode);
        const parsed = JSON.parse(stripped) as LoggerOptions;
        return parsed;
    }
    catch (ex) {
        const newEx = new Error(`Error while parsing config file '${configPath}'.\n'${ex.message}'`);
        (newEx as any).__proto__ = ex.__proto__;
        throw newEx;
    }
};


function isTty(writableStream: NodeJS.WritableStream) {
    return writableStream as tty.WriteStream
        // writableStream.isTTY is undefined for some streams.
        && ((writableStream as tty.WriteStream).isTTY || false);
}

function isFirstLoglevelGreaterEqualSecond(firstLoglevel: string, secondLoglevel: string) {
    firstLoglevel = firstLoglevel.toUpperCase();
    checkLoglevel(firstLoglevel);
    return logLevelNames.indexOf(firstLoglevel) >= logLevelNames.indexOf(secondLoglevel);
}

function checkLoglevel(loglevel: string) {
    if (logLevelNames.indexOf(loglevel) === -1) {
        throw new Error(
            util.format("Value '%s' for argument loglevel not supported, must be one of: %j.",
                loglevel, logLevelNames));
    }
}

function getCallerFilename() {
    const stack = callsite();
    // caller refers to the caller of the function that called this function.
    const caller = stack[2];
    const callerFilepath = caller.getFileName();
    const callerFilename = path.basename(callerFilepath);
    return callerFilename;
}
