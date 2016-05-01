export declare const LogLevel: {
    OFF: string;
    ERROR: string;
    WARN: string;
    INFO: string;
    DEBUG: string;
};
export interface LogFn {
    (message: Message, shouldBeLogged: Boolean, destinations: NodeJS.WritableStream[]): Promise<void>;
}
export interface LoggerOptions {
    level?: string;
    destinations?: Array<string | NodeJS.WritableStream>;
    logFunctions?: (string | LogFn)[];
}
export interface ModulOptions {
    tags?: string[];
}
export interface Message {
    date: Date;
    level: string;
    tags: string[];
    text: string;
    stack?: string;
}
export declare const LogFunction: {
    defaultText: (message: Message, shouldBeLogged: Boolean, destinations: NodeJS.WritableStream[]) => Promise<void>;
    defaultJson: (message: Message, shouldBeLogged: Boolean, destinations: NodeJS.WritableStream[]) => Promise<void>;
};
export declare function createFromConfigFile(tags?: string[]): Logger;
export declare function createFromArguments(options: LoggerOptions, tags?: string[]): Logger;
export declare class Logger implements LoggerOptions, ModulOptions {
    static instance: Logger;
    level: string;
    tags: string[];
    destinations: NodeJS.WritableStream[];
    logFunctions: LogFn[];
    constructor({level, destinations, logFunctions}: {
        level?: string;
        destinations?: (string | NodeJS.WritableStream)[];
        logFunctions?: (string | LogFn)[];
    }, tags?: string[]);
    private setLogFunctions(logFunctions);
    private tryParseCustomLogFnPath(customLogFnPath);
    private setDestinations(destinations);
    getOptions(): LoggerOptions & ModulOptions;
    error(format: any, ...optionalParams: any[]): Promise<void>;
    error2(tags: string[] | string, format: any, ...optionalParams: any[]): Promise<void>;
    warn(format: any, ...optionalParams: any[]): Promise<void>;
    warn2(tags: string[] | string, format: any, ...optionalParams: any[]): Promise<void>;
    info(format: any, ...optionalParams: any[]): Promise<void>;
    info2(tags: string[] | string, format: any, ...optionalParams: any[]): Promise<void>;
    debug(format: any, ...optionalParams: any[]): Promise<void>;
    debug2(tags: string[] | string, format: any, ...optionalParams: any[]): Promise<void>;
    log(level: "OFF" | "ERROR" | "WARN" | "INFO" | "DEBUG", format: any, ...optionalParams: any[]): Promise<void>;
    log(format: any, ...optionalParams: any[]): Promise<void>;
    log2(level: "OFF" | "ERROR" | "WARN" | "INFO" | "DEBUG", tags: string[] | string, format: any, ...optionalParams: any[]): Promise<void>;
    log2(tags: string[] | string, format: any, ...optionalParams: any[]): Promise<void>;
    private doLog(level, tags, format, optionalParams);
    isErrorOrVerboser(): boolean;
    isWarnOrVerboser(): boolean;
    isInfoOrVerboser(): boolean;
    isDebugOrVerboser(): boolean;
}
