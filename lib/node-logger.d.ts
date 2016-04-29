// Generated by dts-bundle v0.4.3

declare module 'node-logger' {
    export const LogLevel: {
        OFF: string;
        ERROR: string;
        WARN: string;
        INFO: string;
        DEBUG: string;
    };
    export interface LogFunction {
        (message: Message, shouldBeLogged: Boolean, destinations: NodeJS.WritableStream[]): Promise<void>;
    }
    export interface ApplicationOptions {
        level?: string;
        destinations?: Array<string | NodeJS.WritableStream>;
        logFunction?: string | LogFunction;
    }
    export interface ModulOptions {
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
    export let logFunctions: Map<string, Function>;
    export function allDest0WarnDest1(message: Message, shouldBeLogged: Boolean, destinations: NodeJS.WritableStream[]): Promise<void>;
    export function createFromConfigFile(tags?: string[]): Logger;
    export function createFromArguments(options: LoggerOptions, tags?: string[]): Logger;
    export class Logger implements LoggerOptions, ModulOptions {
        static instance: Logger;
        level: string;
        tags: string[];
        destinations: NodeJS.WritableStream[];
        logFunction: LogFunction;
        constructor({level, destinations, logFunction}: {
            level?: string;
            destinations?: (string | NodeJS.WritableStream)[];
            logFunction?: string | LogFunction;
        }, tags?: string[]);
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
        isErrorOrVerboser(): boolean;
        isWarnOrVerboser(): boolean;
        isInfoOrVerboser(): boolean;
        isDebugOrVerboser(): boolean;
    }
}
