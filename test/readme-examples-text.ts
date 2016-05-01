import * as path from "path";
import * as util from "util";
import * as stream from "stream";
import * as test from "tape";
import * as appRoot from "app-root-path";

// Only used to type annotate (typeof Logger) dynamic imports. Will not emit import() if only used that way. 
import * as NodeLoggerType from "../src/index.ts";

const Logger: typeof NodeLoggerType = appRoot.require("/lib/index");

test("Readme examples text format.", (assert) => {
    const log = Logger.createFromConfigFile();
    const isInfo = log.isInfoOrVerboser();

    isInfo && log.info("Checking isInfo prevents expensive argument evaluation if not needed. Note that the filename where the logger was created is included as a tag. %j", util.inspect(log));
    log.info2(["functional_warning"], "This message includes a tag, so it can be easily filtered.\n Note that there is always exactly one output line per message.");
    const touchFeatureLog = Logger.createFromConfigFile(["touch_feature"]);
    touchFeatureLog.error(new Error("Messages form this logger will have the tags specified during creation. Note that all log-functions return promises."))
        .then(() => assert.end());
});

test("Readme examples JSON format.", (assert) => {
    const log = Logger.createFromConfigFile();
    log.logFunctions = [Logger.LogFunction.defaultJson];
    const isInfo = log.isInfoOrVerboser();

    isInfo && log.info("Checking isInfo prevents expensive argument evaluation if not needed. Note that the filename where the logger was created is included as a tag. %j", util.inspect(log));
    log.info2(["functional_warning"], "This message includes a tag, so it can be easily filtered.\n Note that there is always exactly one output line per message.");
    const touchFeatureLog = Logger.createFromConfigFile(["touch_feature"]);
    touchFeatureLog.error(new Error("Messages form this logger will have the tags specified during creation. Note that all log-functions return promises."))
        .then(() => assert.end());
});
