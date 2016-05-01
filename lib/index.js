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
exports.LogFunction = {
    defaultText: function defaultText(message, shouldBeLogged, destinations) {
        const isoDate = message.date.toISOString();
        const level = (message.level + "     ").substr(0, 5);
        const tags = message.tags.join(", ");
        const text = message.stack ? message.text + " STACK: " + message.stack : message.text;
        const messageText = `${isoDate} ${level} [${tags}] - ${text}` + os_1.EOL;
        return writeToDefaultDestination(messageText, message.level, shouldBeLogged, destinations);
    },
    defaultJson: function defaultJson(message, shouldBeLogged, destinations) {
        const isoDate = message.date.toISOString();
        let messageCpy = Object.assign({ isoDate: isoDate }, message);
        delete messageCpy.date;
        // Writing JSON messages will always write a single line with a trailing EOL, because JSON.stringify(message) 
        // returns a string without direct line breaks. (Strings within the stringifyd json object containing "\n" 
        // characters are escaped to "\\n" and will display as "\n" in the logger output.")
        const messageText = JSON.stringify(messageCpy) + os_1.EOL;
        return writeToDefaultDestination(messageText, message.level, shouldBeLogged, destinations);
    }
};
const defaultOptions = {
    level: exports.LogLevel.DEBUG,
    destinations: [process.stdout, process.stderr],
    logFunctions: [exports.LogFunction.defaultText.name],
};
// Default log function. The returned promise is resolved when the message is written.
// Always write WARN or ERROR messages to destinations[1] if it exists and it is not equal to destinations[0].
// Always write to destinations[0] except
// - If the message was already written to the console by destinations[1] and destinations[0]
//   is also a console (so that WARN and ERROR messages are only printed once to the console).
function writeToDefaultDestination(messageText, level, shouldBeLogged, destinations) {
    if (!shouldBeLogged) {
        return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
        const writeToDest1 = !isFirstLoglevelGreaterEqualSecond(level, exports.LogLevel.INFO)
            && destinations[1] !== undefined && destinations[0] !== destinations[1];
        const isBothTty = isTty(destinations[0]) && isTty(destinations[1]);
        const writeToDest0 = !(writeToDest1 && isBothTty);
        const streamA = writeToDest1 ? destinations[1] : destinations[0];
        const streamB = writeToDest1 && writeToDest0 ? destinations[0] : undefined;
        streamA.write(messageText, () => {
            if (streamB) {
                streamB.write(messageText, () => resolve());
            }
            else {
                resolve();
            }
        });
    });
}
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
    return new Logger({ level: options.level, destinations: options.destinations, logFunctions: options.logFunctions }, tagsWithCaller);
}
exports.createFromArguments = createFromArguments;
class Logger {
    constructor({ level = defaultOptions.level, destinations = defaultOptions.destinations, logFunctions = defaultOptions.logFunctions, }, tags = []) {
        this.logFunctions = [];
        checkLoglevel(level);
        this.level = level;
        this.setDestinations(destinations);
        this.setLogFunctions(logFunctions);
        this.tags = tags;
        Logger.instance = this;
    }
    setLogFunctions(logFunctions) {
        for (const logFunction of logFunctions) {
            if (typeof logFunction === "string") {
                if (logFunction === exports.LogFunction.defaultText.name) {
                    this.logFunctions.push(exports.LogFunction.defaultText);
                }
                else if (logFunction === exports.LogFunction.defaultJson.name) {
                    this.logFunctions.push(exports.LogFunction.defaultText);
                }
                else {
                    const customLogFn = this.tryParseCustomLogFnPath(logFunction);
                    if (customLogFn) {
                        this.logFunctions.push(customLogFn);
                    }
                    else {
                        throw new Error(`LogFunction value '${logFunction}' is invalid. Must be either '${exports.LogFunction.defaultText.name}' or `
                            + `'${exports.LogFunction.defaultJson.name}' or in the format '$baseDir/lib/log-helper-module.js:yourLogFunction'.`);
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
    tryParseCustomLogFnPath(customLogFnPath) {
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
            else if ("write" in dest) {
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
            logFunctions: this.logFunctions,
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
        if (typeof arg1 === "string" && logLevelNames.indexOf(arg1) !== -1) {
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
        if (typeof arg1 === "string" && logLevelNames.indexOf(arg1) !== -1) {
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
        message.date = new Date();
        message.level = level;
        message.tags = this.tags.concat(tags);
        message.text = messageText;
        if (format instanceof Error) {
            message.stack = format.stack;
        }
        let logFnPromises = [];
        for (const logFn of this.logFunctions) {
            logFnPromises.push(logFn(message, shouldBeLogged, this.destinations));
        }
        return Promise.all(logFnPromises);
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
Logger.instance = undefined;
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
    return "isTTY" in writableStream;
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