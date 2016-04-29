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
"use strict";
const util = require("util");
const path = require("path");
const assert = require("assert");
const fs = require("fs");
const stream = require("stream");
const os_1 = require("os");
const callsite = require("callsite");
const appRoot = require("app-root-path").path;
const stripcomment = require("strip-json-comments");
// The file that contains the logger options.
const configFilePath = path.join(appRoot, "node-logger.json");
/* tslint:disable:variable-name */
exports.LogLevel = {
    OFF: "OFF",
    ERROR: "ERROR",
    WARN: "WARN",
    INFO: "INFO",
    DEBUG: "DEBUG",
};
/* tslint:enable:variable-name */
const logLevelNames = Object.keys(exports.LogLevel);
const defaultOptions = {
    level: exports.LogLevel.DEBUG,
    destinations: [process.stdout, process.stderr],
    logFunction: allDest0WarnDest1.name,
};
exports.logFunctions = new Map();
exports.logFunctions.set(allDest0WarnDest1.name, allDest0WarnDest1);
// log function. The returned promise is resolved when the message is written.
// Always write WARN or ERROR messages to destinations[1] if it exists and it is not equal to destinations[0].
// Always write to destinations[0] except
// - If the message was already written to the console by destinations[1] and destinations[0]
//   is also a console (so that WARN and ERROR messages are only printed once to the console).
function allDest0WarnDest1(message, shouldBeLogged, destinations) {
    if (!shouldBeLogged) {
        return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
        const writeToDest1 = !isFirstLoglevelGreaterEqualSecond(message.level, exports.LogLevel.INFO)
            && destinations[1] !== undefined && destinations[0] !== destinations[1];
        const isBothTty = isTty(destinations[0]) && isTty(destinations[1]);
        const writeToDest0 = !(writeToDest1 && isBothTty);
        const streamA = writeToDest1 ? destinations[1] : destinations[0];
        const streamB = writeToDest1 && writeToDest0 ? destinations[0] : null;
        const messageStr = JSON.stringify(message) + os_1.EOL;
        // Writing messageStr will always write a single line with a trailing EOL, because JSON.stringify(message) 
        // returns a string without direct line breaks. (Strings within the stringifyd json object containing "\n" 
        // characters are escaped to "\\n" and will display as "\n" in the logger output.")
        streamA.write(messageStr, () => {
            if (streamB) {
                streamB.write(messageStr, () => resolve());
            }
            else {
                resolve();
            }
        });
    });
}
exports.allDest0WarnDest1 = allDest0WarnDest1;
function createFromConfigFile(tags = []) {
    const tagsWithCaller = [getCallerFilename()].concat(tags);
    if (Logger.instance) {
        return new Logger(Logger.instance.getOptions(), tagsWithCaller);
    }
    const options = parseConfigSync(configFilePath);
    return new Logger(options, tagsWithCaller);
}
exports.createFromConfigFile = createFromConfigFile;
function createFromArguments(options, tags = []) {
    const tagsWithCaller = [getCallerFilename()].concat(tags);
    if (Logger.instance) {
        return new Logger(Logger.instance.getOptions(), tagsWithCaller);
    }
    return new Logger({ level: options.level, destinations: options.destinations, logFunction: options.logFunction }, tagsWithCaller);
}
exports.createFromArguments = createFromArguments;
class Logger {
    constructor({ level = defaultOptions.level, destinations = defaultOptions.destinations, logFunction = defaultOptions.logFunction, }, tags = []) {
        checkLoglevel(level);
        this.level = level;
        this.setDestinations(destinations);
        this.setLogFunction(logFunction);
        this.tags = tags;
        Logger.instance = this;
    }
    setLogFunction(logFunction) {
        if (typeof logFunction === "string") {
            if (exports.logFunctions.has(logFunction)) {
                this.logFunction = exports.logFunctions.get(logFunction);
            }
            else {
                throw new Error(`The logFunction with name '${logFunction}' is not known.`);
            }
        }
        else if (typeof logFunction === "function") {
            this.logFunction = logFunction;
        }
        else {
            throw new TypeError(`The argument 'logFunction' has unexpected type '${typeof logFunction}'.`);
        }
    }
    setDestinations(destinations) {
        this.destinations = [];
        for (const dest of destinations) {
            if (typeof dest === "string") {
                if (dest === "stdout") {
                    this.destinations.push(process.stdout);
                }
                else if (dest === "stderr") {
                    this.destinations.push(process.stderr);
                }
                else {
                    const s = fs.createWriteStream(dest, { flags: "a" });
                    this.destinations.push(s);
                }
            }
            else if (dest instanceof stream.Writable || dest instanceof stream.Transform) {
                this.destinations.push(dest);
            }
            else {
                throw new TypeError(`One of the elements of argument 'destinations' has unexpected type '${typeof dest}'.`);
            }
        }
    }
    // Returns a copy of the options that were used in the constructor.
    getOptions() {
        return {
            level: this.level,
            destinations: this.destinations,
            logFunction: this.logFunction,
            tags: this.tags.slice(),
        };
    }
    error(format, ...optionalParams) {
        return this.doLog(exports.LogLevel.ERROR, [], format, optionalParams);
    }
    error2(tags, format, ...optionalParams) {
        return this.doLog(exports.LogLevel.ERROR, tags, format, optionalParams);
    }
    warn(format, ...optionalParams) {
        return this.doLog(exports.LogLevel.WARN, [], format, optionalParams);
    }
    warn2(tags, format, ...optionalParams) {
        return this.doLog(exports.LogLevel.WARN, tags, format, optionalParams);
    }
    info(format, ...optionalParams) {
        return this.doLog(exports.LogLevel.INFO, [], format, optionalParams);
    }
    info2(tags, format, ...optionalParams) {
        return this.doLog(exports.LogLevel.INFO, tags, format, optionalParams);
    }
    debug(format, ...optionalParams) {
        return this.doLog(exports.LogLevel.DEBUG, [], format, optionalParams);
    }
    debug2(tags, format, ...optionalParams) {
        return this.doLog(exports.LogLevel.DEBUG, tags, format, optionalParams);
    }
    log(arg1, arg2, ...arg3) {
        if (typeof arg1 === "string" && logLevelNames.indexOf(arg1) > -1) {
            return this.doLog(arg1, [], arg2, arg3);
        }
        else {
            // arg1 contains the format string and arg2 and arg3 the format arguments.
            let formatArgs = arg3;
            if (arg2 !== undefined) {
                formatArgs = [arg2].concat(arg3);
            }
            return this.doLog(exports.LogLevel.INFO, [], arg1, formatArgs);
        }
    }
    log2(arg1, arg2, arg3, ...arg4) {
        if (typeof arg1 === "string" && logLevelNames.indexOf(arg1) > -1) {
            return this.doLog(arg1, arg2, arg3, arg4);
        }
        else {
            // arg2 contains the format string and arg3 and arg4 the format arguments.
            let formatArgs = arg4;
            if (arg3 !== undefined) {
                formatArgs = [arg3].concat(arg4);
            }
            return this.doLog(exports.LogLevel.INFO, arg1, arg2, formatArgs);
        }
    }
    doLog(level, tags, format, optionalParams) {
        assert(Array.isArray(optionalParams), "optionalParams is expected to be an array because it is the ...optionalParams argument of the calling functions.");
        const shouldBeLogged = isFirstLoglevelGreaterEqualSecond(this.level, level) || [].concat(tags).indexOf("always") > -1;
        let messageText = optionalParams.length > 0 ? util.format(format, ...optionalParams) : util.format(format);
        let message = {};
        message.isoDate = new Date().toISOString();
        message.level = level;
        message.tags = this.tags.concat(tags);
        message.text = messageText;
        if (format instanceof Error) {
            message.stack = format.stack;
        }
        return this.logFunction(message, shouldBeLogged, this.destinations);
    }
    isErrorOrVerboser() {
        return isFirstLoglevelGreaterEqualSecond(this.level, exports.LogLevel.ERROR);
    }
    isWarnOrVerboser() {
        return isFirstLoglevelGreaterEqualSecond(this.level, exports.LogLevel.WARN);
    }
    isInfoOrVerboser() {
        return isFirstLoglevelGreaterEqualSecond(this.level, exports.LogLevel.INFO);
    }
    isDebugOrVerboser() {
        return isFirstLoglevelGreaterEqualSecond(this.level, exports.LogLevel.DEBUG);
    }
}
Logger.instance = null;
exports.Logger = Logger;
function parseConfigSync(configPath) {
    // Read the file non-async so that creating a logger will not need to return a Promise.
    const data = fs.readFileSync(configPath);
    const jsCode = data.toString();
    try {
        const stripped = stripcomment(jsCode);
        const parsed = JSON.parse(stripped);
        return parsed;
    }
    catch (ex) {
        const newEx = new Error(`Error while parsing config file '${configPath}'.\n'${ex.message}'`);
        newEx.__proto__ = ex.__proto__;
        throw newEx;
    }
}
;
function isTty(writableStream) {
    return writableStream
        && (writableStream.isTTY || false);
}
function isFirstLoglevelGreaterEqualSecond(firstLoglevel, secondLoglevel) {
    firstLoglevel = firstLoglevel.toUpperCase();
    checkLoglevel(firstLoglevel);
    return logLevelNames.indexOf(firstLoglevel) >= logLevelNames.indexOf(secondLoglevel);
}
function checkLoglevel(loglevel) {
    if (logLevelNames.indexOf(loglevel) === -1) {
        throw new Error(util.format("Value '%s' for argument loglevel not supported, must be one of: %j.", loglevel, logLevelNames));
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
//# sourceMappingURL=index.js.map