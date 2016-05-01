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

export interface LogFn {
    (message: Message, shouldBeLogged: Boolean, destinations: NodeJS.WritableStream[]): Promise<void>;
}

export interface LoggerOptions {
    // Specifies the minimum importance that messages must have to be logged.
    // Eg. WARN will only log messages with level WARN and ERROR.
    level?: string;
    // A list of destinations, that will be used by the internal or a provided log functions.
    // Supported destination values are WritableStream, file path or the strings "stdout" or "stderr".
    destinations?: Array<string|NodeJS.WritableStream>;
    // The functions that may modify the log message and write it to a destination.
    // Supported are the names of the predefined log functions "defaultText" and "defaultJson" or 
    // the path to a custom log function as "$baseDir/lib/log-helper-module.js:yourLogFunction".
    logFunctions?: (string|LogFn)[];
}

export interface ModulOptions {
    // Tags that the logger will include in its log messages. Additional tags can be added by the logging function.
    tags?: string[];
}

export interface Message {
    date: Date;
    level: string;
    tags: string[];
    text: string;
    stack?: string;
}

export const LogFunction = {
    defaultText: function defaultText(message: Message, shouldBeLogged: Boolean, destinations: NodeJS.WritableStream[]): Promise<void> {
        const isoDate = message.date.toISOString();
        const level = (message.level + "     ").substr(0, 5);
        const tags = message.tags.join(", ");
        const text = message.stack ? message.text + " STACK: " + message.stack : message.text;
        const messageText = `${isoDate} ${level} [${tags}] - ${text}` + EOL; 
        return writeToDefaultDestination(messageText, message.level, shouldBeLogged, destinations);
    },
    defaultJson: function defaultJson(message: Message, shouldBeLogged: Boolean, destinations: NodeJS.WritableStream[]): Promise<void> {
        const isoDate = message.date.toISOString();
        let messageCpy = Object.assign({isoDate: isoDate}, message);
        delete messageCpy.date;
        // Writing JSON messages will always write a single line with a trailing EOL, because JSON.stringify(message) 
        // returns a string without direct line breaks. (Strings within the stringifyd json object containing "\n" 
        // characters are escaped to "\\n" and will display as "\n" in the logger output.")
        const messageText = JSON.stringify(messageCpy) + EOL;
        return writeToDefaultDestination(messageText, message.level, shouldBeLogged, destinations);
    }
}

const defaultOptions: LoggerOptions = {
    level: LogLevel.DEBUG,
    destinations: [process.stdout, process.stderr],
    logFunctions: [LogFunction.defaultText.name],
};

// Default log function. The returned promise is resolved when the message is written.
// Always write WARN or ERROR messages to destinations[1] if it exists and it is not equal to destinations[0].
// Always write to destinations[0] except
// - If the message was already written to the console by destinations[1] and destinations[0]
//   is also a console (so that WARN and ERROR messages are only printed once to the console).
function writeToDefaultDestination(messageText: string, level: string, shouldBeLogged: Boolean, destinations: NodeJS.WritableStream[]): Promise<void> {
    if (!shouldBeLogged) {
        return Promise.resolve();
    }
    return new Promise<void>((resolve, reject) => {
        const writeToDest1 = !isFirstLoglevelGreaterEqualSecond(level, LogLevel.INFO)
            && destinations[1] !== undefined && destinations[0] !== destinations[1];
        const isBothTty = isTty(destinations[0]) && isTty(destinations[1]);
        const writeToDest0 = !(writeToDest1 && isBothTty);
        const streamA = writeToDest1 ? destinations[1] : destinations[0];
        const streamB = writeToDest1 && writeToDest0 ? destinations[0] : undefined;
        streamA.write(messageText, () => {
            if (streamB) {
                streamB.write(messageText, () => resolve());
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
    return new Logger({ level: options.level, destinations: options.destinations, logFunctions: options.logFunctions }, tagsWithCaller);
}

export class Logger implements LoggerOptions, ModulOptions {
    static instance: Logger = undefined;
    level: string;
    tags: string[];
    destinations: NodeJS.WritableStream[];
    logFunctions = [] as LogFn[];

    constructor({ level = defaultOptions.level,
                  destinations = defaultOptions.destinations,
                  logFunctions = defaultOptions.logFunctions,
                }, tags: string[] = []) {
        checkLoglevel(level);
        this.level = level;
        this.setDestinations(destinations);
        this.setLogFunctions(logFunctions);
        this.tags = tags;
        Logger.instance = this;
    }

    private setLogFunctions(logFunctions: (string|LogFn)[]) {
        for (const logFunction of logFunctions) {
            if (typeof logFunction === "string") {
                if (logFunction === LogFunction.defaultText.name) {
                    this.logFunctions.push(LogFunction.defaultText);
                } else if (logFunction === LogFunction.defaultJson.name) {
                    this.logFunctions.push(LogFunction.defaultText);
                } else {
                    const customLogFn = this.tryParseCustomLogFnPath(logFunction);
                    if (customLogFn) {
                        this.logFunctions.push(customLogFn);
                    } else {
                        throw new Error(`LogFunction value '${logFunction}' is invalid. Must be either '${LogFunction.defaultText.name}' or `
                            + `'${LogFunction.defaultJson.name}' or in the format '$baseDir/lib/log-helper-module.js:yourLogFunction'.`);
                    }
                }
            }
            else if (typeof logFunction === "function") {
                this.logFunctions.push(logFunction);
            }
            else {
                throw new TypeError(`The argument 'logFunction' has unexpected type '${typeof logFunction}'.`);
            }
        }
    }
    
    private tryParseCustomLogFnPath(customLogFnPath: string) {
        if (customLogFnPath.indexOf(":") !== -1) {
            const [modulePath, fnName] = customLogFnPath.split(":", 2);
            const modulePath2 = modulePath.replace(/\$baseDir\b/, appRoot);
            const logFnModule = require(modulePath2);
            if (logFnModule[fnName]) {
                return logFnModule[fnName];
            }
            else {
                throw new Error(`Error loading log function '${fnName}' from module path '${modulePath2}'.`);
            }
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
            } else if ("write" in dest) {
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
            logFunctions: this.logFunctions,
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
        if (typeof arg1 === "string" && logLevelNames.indexOf(arg1) !== -1) {
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
        if (typeof arg1 === "string" && logLevelNames.indexOf(arg1) !== -1) {
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
        message.date = new Date();
        message.level = level;
        message.tags = this.tags.concat(tags as any);
        message.text = messageText;
        if (format instanceof Error) {
            message.stack = format.stack;
        }
        let logFnPromises: Promise<void>[] = [];
        for (const logFn of this.logFunctions) {
            logFnPromises.push(logFn(message, shouldBeLogged, this.destinations));
        }
        return Promise.all(logFnPromises) as any as Promise<void>;
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
    return "isTTY" in writableStream;
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
