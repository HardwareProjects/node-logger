import * as path from "path";
import * as stream from "stream";
import * as test from "tape";
import * as appRoot from "app-root-path";

// Only used to type annotate (typeof Logger) dynamic imports. Will not emit import() if only used that way. 
import * as NodeLoggerType from "../src/index.ts";

const Log: typeof NodeLoggerType = appRoot.require("/lib/index");

test("Logger test", async (assert) => {
    const testStreams = [createStringStream(), createStringStream()];
    const log = Log.createFromConfigFile();
    log.level = "INFO";
    log.destinations = testStreams;
    
    const isError = log.isErrorOrVerboser();
    const isWarn = log.isWarnOrVerboser();
    const isInfo = log.isInfoOrVerboser();
    const isDebug = log.isDebugOrVerboser();
    assert.true(isError, "INFO is more verbose than ERROR");
    assert.true(isWarn, "INFO is more verbose than WARN");
    assert.true(isInfo, "INFO is as verbose as INFO");
    assert.false(isDebug, "INFO is less verbose than DBUG");

    let res0: NodeLoggerType.Message;
    let res1: NodeLoggerType.Message;    
    await log.error(new Error("test exception without tag"));
    res0 = JSON.parse(testStreams[0].read());
    res1 = JSON.parse(testStreams[1].read());
    assert.equal(res0.level, "ERROR");
    assert.equal(res0.stack.substr(0, 6), "Error:");
    assert.deepEqual(res0, res1);
    await log.error2(["mytag"], new Error("test exception with tag"));
    res0 = JSON.parse(testStreams[0].read());
    testStreams[1].read(); // clear stream
    assert.true(res0.tags.indexOf("mytag") > -1);
    
    await log.warn("test warn without tag. Args: %s", "first arg");
    res0 = JSON.parse(testStreams[0].read());
    res1 = JSON.parse(testStreams[1].read());
    await log.warn2(["mytag"], "test warn with tag. Args: %s", "first arg");
    res0 = JSON.parse(testStreams[0].read());
    testStreams[1].read(); // clear stream
    assert.true(res0.tags.indexOf("mytag") > -1);
    
    await log.info("test info without tag. Args: %s", "first arg");
    res0 = JSON.parse(testStreams[0].read());
    res1 = JSON.parse(testStreams[1].read());
    assert.isEqual(res1, null, "Only ERROR and WARN messages should be written to destinations[1].");
    await log.info2(["mytag"], "test info with tag. Args: %s", "first arg");
    res0 = JSON.parse(testStreams[0].read());
    testStreams[1].read(); // clear stream
    assert.true(res0.tags.indexOf("mytag") > -1);
    
    await log.debug("test debug without tag. Should not log.");
    let a = testStreams[0].read();
    let b = testStreams[1].read();
    assert.equal(a, null, "Should not log debug messages when logger level is info.");
    assert.equal(b, null, "Should not log debug messages when logger level is info.");
    
    assert.end();
});

function createStringStream() {
    var s = new stream.Transform();
    s._transform = function (data, encoding, callback) {
        callback(null, data);
    };
    s.setEncoding("utf8");
    return s;
}
